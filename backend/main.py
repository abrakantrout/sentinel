from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4
import asyncio
import random
import string

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.core.data_store import data_store
from app.services.mock_apis import mock_bank_freeze, mock_police_alert, mock_telecom_flag, mock_monitor_account, mock_close_case
from app.services.orchestrator import run_pipeline
from app.services.evidence_agent import collect_evidence, collect_evidence_for_case, collect_evidence_for_transaction

from fastapi.middleware.cors import CORSMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager that handles background simulation loop startup and shutdown.
    """
    loop_task = asyncio.create_task(_baseline_loop())
    yield
    loop_task.cancel()


app = FastAPI(title="SENTINEL - Real-Time Fraud Response System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections = [ws for ws in self.active_connections if ws is not websocket]

    async def broadcast(self, message: dict[str, Any]) -> None:
        failed: list[WebSocket] = []
        for ws in self.active_connections:
            try:
                await ws.send_json(message)
            except Exception:
                failed.append(ws)
        for ws in failed:
            self.disconnect(ws)


manager = ConnectionManager()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_nodes(nodes: Any) -> list[dict[str, Any]]:
    if not isinstance(nodes, list):
        return []
    normalized = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        account_id = node.get("account_id") or node.get("accountId") or node.get("id")
        if not account_id:
            continue
        normalized.append(
            {
                "account_id": str(account_id),
                "accountId": str(account_id),
                "id": str(account_id),
                "status": node.get("status", "active"),
                "balance": float(node.get("balance", 0.0)),
            }
        )
    return normalized


def _normalize_edges(edges: Any) -> list[dict[str, Any]]:
    if not isinstance(edges, list):
        return []
    normalized = []
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = edge.get("source") or edge.get("from")
        target = edge.get("target") or edge.get("to")
        tx_id = edge.get("tx_id") or edge.get("id") or f"{source}-{target}"
        if not source or not target:
            continue
        normalized.append(
            {
                "id": str(tx_id),
                "tx_id": str(tx_id),
                "source": str(source),
                "target": str(target),
                "from": str(source),
                "to": str(target),
                "amount": float(edge.get("amount", 0.0)),
                "timestamp": edge.get("timestamp"),
            }
        )
    return normalized


def _normalize_action_log(case: dict[str, Any]) -> list[dict[str, Any]]:
    raw = case.get("actionLog")
    if isinstance(raw, list):
        return raw
    raw = case.get("actions_taken")
    if not isinstance(raw, list):
        return []
    normalized = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        target_id = entry.get("target_id") or entry.get("target") or "GLOBAL"
        normalized.append(
            {
                "action_id": str(entry.get("action_id") or f"action_{uuid4().hex[:10]}"),
                "case_id": entry.get("case_id") or case.get("case_id"),
                "action_type": str(entry.get("action_type") or "").upper(),
                "action": str(entry.get("action") or entry.get("action_type") or "").lower(),
                "target_id": target_id,
                "target": target_id,
                "status": entry.get("status", "ACK"),
                "timestamp": entry.get("timestamp") or _now_iso(),
                "reason": entry.get("reason", "System Action"),
                "latency": int(entry.get("latency", 0)),
            }
        )
    return normalized


def _case_payload(case: dict[str, Any]) -> dict[str, Any]:
    case_id = case.get("case_id", "")
    graph = data_store.get("graphs", {}).get(case_id, {"nodes": [], "edges": []})
    nodes = _normalize_nodes(graph.get("nodes", []))
    edges = _normalize_edges(graph.get("edges", []))
    # Fetch full transaction objects linked to this case
    tx_ids = case.get("transactions", [])
    tx_store = data_store.get("transactions", {})
    transactions = [tx_store[tid] for tid in tx_ids if tid in tx_store]
    evidence_package = collect_evidence_for_case(case_id, data_store)

    return {
        "case_id": case_id,
        "status": case.get("status", "NEW"),
        "primary_tx_id": case.get("primary_tx_id", ""), # Expose primary TX
        "nodes": nodes,
        "edges": edges,
        "transactions": transactions, # Added full objects
        "recoverable_amount": float(case.get("recoverable_amount", 0.0)),
        "recovery_pct": float(case.get("recovery_pct", 0.0)),
        "actionLog": _normalize_action_log(case),
        "risk_level": float(case.get("risk_level", 0.0)),
        "golden_window_minutes": int(case.get("golden_window_minutes", 0)),
        "total_fraud_amount": float(case.get("total_fraud_amount", 0.0)),
        "chain": case.get("chain", []),
        "evidence_package": evidence_package,
    }


class EvidenceRequest(BaseModel):
    target_id: str | None = None
    case_id: str | None = None
    tx_id: str | None = None


class ActionRequest(BaseModel):
    case_id: str
    account_id: str | None = None
    target_id: str | None = None
    reason: str | None = None


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "message": "Sentinel API is healthy"}


@app.post("/transaction")
async def process_tx(request: Request) -> dict[str, Any]:
    tx = await request.json()
    result = run_pipeline(tx, data_store)

    transaction = result.get("transaction") or {}
    tx_event = {
        "event": "tx_scored",
        "tx_id": transaction.get("tx_id", ""),
        "timestamp": transaction.get("timestamp") or _now_iso(),
        "case_id": transaction.get("case_id", ""),
        "risk_score": float(transaction.get("risk_score", 0.0)),
        "amount": float(transaction.get("amount", 0.0)),
        "sender_account": transaction.get("sender_account", "UNKNOWN"),
        "receiver_account": transaction.get("receiver_account", "UNKNOWN"),
        "channel": transaction.get("channel", "UPI"),
        "risk_factors": transaction.get("risk_factors", []),
        "threshold": transaction.get("threshold", "LOW"),
        "reason": transaction.get("reason", "Low risk pattern"),
        "full_reason": transaction.get("full_reason", ""),
        "confidence": transaction.get("confidence", "LOW"),
        "ml_score": transaction.get("ml_score", 0),
        "rule_score": transaction.get("rule_score", 0),
        "ml_feature_importance": transaction.get("ml_feature_importance", {})
    }

    await manager.broadcast(tx_event)

    case = result.get("case")
    if case:
        case_event = {"event": "case_updated", **_case_payload(case)}
        await manager.broadcast(case_event)

    return result


@app.get("/cases")
def get_cases() -> list[dict[str, Any]]:
    return [_case_payload(case) for case in data_store.get("cases", {}).values()]


@app.get("/cases/{case_id}/evidence")
def get_case_evidence(case_id: str) -> dict[str, Any]:
    """
    Returns structured, machine-readable evidence package for a given case.
    """
    return collect_evidence_for_case(case_id, data_store)


@app.get("/transactions/{tx_id}/evidence")
def get_transaction_evidence(tx_id: str) -> dict[str, Any]:
    """
    Returns structured, machine-readable evidence package for a given transaction.
    """
    return collect_evidence_for_transaction(tx_id, data_store)


@app.post("/evidence")
def get_evidence_post(payload: EvidenceRequest) -> dict[str, Any]:
    """
    Universal evidence collection endpoint supporting target_id, case_id, or tx_id.
    """
    target = payload.target_id or payload.case_id or payload.tx_id or ""
    return collect_evidence(target, data_store)


@app.get("/export/sentinel_audit.csv")
def export_csv():
    """
    Generates and streams a CSV audit log from the in-memory store.
    Includes all transactions and investigative actions.
    Browser handles this as a native file download.
    """
    from fastapi.responses import StreamingResponse
    import io, csv
    from datetime import datetime, timezone as _tz

    output = io.StringIO()
    # UTF-8 BOM so Excel opens correctly
    output.write('\ufeff')

    writer = csv.writer(output, lineterminator='\r\n')

    # ── Section 1: Transactions ───────────────────────────────────────────────
    writer.writerow(['SENTINEL AUDIT LOG - TRANSACTION FEED'])
    writer.writerow([
        'Tx ID', 'Timestamp', 'Channel',
        'Sender Account', 'Receiver Account',
        'Amount (INR)', 'Risk Score', 'Risk Level', 'Case ID'
    ])

    tx_store = data_store.get("transactions", {})
    for tx in tx_store.values():
        score = float(tx.get("risk_score", 0))
        level = "HIGH_RISK" if score >= 70 else "MEDIUM" if score >= 40 else "LOW"
        writer.writerow([
            tx.get("tx_id", ""),
            tx.get("timestamp", ""),
            tx.get("channel", ""),
            tx.get("sender_account", ""),
            tx.get("receiver_account", ""),
            tx.get("amount", ""),
            score,
            level,
            tx.get("case_id", "")
        ])

    # ── Section 2: Investigative Actions ─────────────────────────────────────
    all_actions = []
    for case in data_store.get("cases", {}).values():
        all_actions.extend(case.get("actions_taken", []))

    if all_actions:
        writer.writerow([])
        writer.writerow(['INVESTIGATIVE ACTIONS'])
        writer.writerow([
            'Action ID', 'Case ID', 'Action Type',
            'Target Account', 'Status', 'Reason', 'Latency (ms)', 'Timestamp'
        ])
        for a in all_actions:
            writer.writerow([
                a.get("action_id", ""),
                a.get("case_id", ""),
                a.get("action_type", ""),
                a.get("target", a.get("target_id", "GLOBAL")),
                a.get("status", "ACK"),
                a.get("reason", "System Action"),
                a.get("latency", ""),
                a.get("timestamp", "")
            ])

    output.seek(0)
    ts = datetime.now(_tz.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"sentinel_audit_{ts}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


def _record_action(case_id: str, action_type: str, target_id: str, status: str, reason: str | None = None) -> dict[str, Any]:
    case = data_store.get("cases", {}).get(case_id)
    if not case:
        return {}
    entry = {
        "action_id": f"ACT-{uuid4().hex[:10].upper()}",
        "case_id": case_id,
        "action_type": action_type,
        "target_id": target_id,
        "target": target_id,
        "status": "ACK" if status == "SUCCESS" else "NACK",
        "timestamp": _now_iso(),
        "reason": reason or "Operator decision",
        "latency": 0,
    }
    case.setdefault("actions_taken", []).insert(0, entry)
    
    # Status Mapping based on actions
    if entry["status"] == "ACK":
        if action_type in ["FREEZE", "FLAG", "ALERT"]:
            case["status"] = "ACTIONED"
        elif action_type == "MONITOR":
            case["status"] = "MONITORING"
        elif action_type == "CLOSE":
            case["status"] = "CLOSED"
        elif action_type == "CLOSE_FP":
            case["status"] = "CLOSED_FP"
            
    return entry


async def _handle_action(action_name: str, payload: ActionRequest) -> dict[str, Any]:
    case = data_store.get("cases", {}).get(payload.case_id)
    target_id = payload.account_id or payload.target_id or "GLOBAL"
    if not case:
        return {
            "ok": False,
            "event": "action_taken",
            "case_id": payload.case_id,
            "action": action_name,
            "target_id": target_id,
            "status": "NACK",
            "error": "case_not_found",
        }

    if action_name == "freeze":
        api_response = mock_bank_freeze(target_id, case.get("recoverable_amount", 0.0))
        graph = data_store.get("graphs", {}).get(payload.case_id, {})
        edges = graph.get("edges", [])
        
        def get_downstream(start_id):
            downstream = {start_id}
            queue = [start_id]
            while queue:
                curr = queue.pop(0)
                for edge in edges:
                    src = str(edge.get("source") or edge.get("from"))
                    tgt = str(edge.get("target") or edge.get("to"))
                    if src == curr and tgt not in downstream:
                        downstream.add(tgt)
                        queue.append(tgt)
            return downstream

        if target_id == "GLOBAL" or target_id == "SUSPECTS":
            to_freeze = {str(edge.get("target") or edge.get("to")) for edge in edges}
        else:
            to_freeze = get_downstream(str(target_id))

        for node in graph.get("nodes", []):
            acc_id = str(node.get("account_id") or node.get("id") or node.get("accountId"))
            if acc_id in to_freeze:
                node["status"] = "frozen"
    elif action_name == "flag":
        api_response = mock_telecom_flag(target_id)
    elif action_name == "monitor":
        api_response = mock_monitor_account(target_id)
    elif action_name == "close":
        api_response = mock_close_case(payload.case_id, "RESOLVED")
    elif action_name == "close_fp":
        api_response = mock_close_case(payload.case_id, "FALSE_POSITIVE")
    else:
        api_response = mock_police_alert(payload.case_id, {"reason": payload.reason or "Escalation requested"})

    status = api_response.get("status", "FAILED")
    action_entry = _record_action(payload.case_id, action_name.upper(), target_id, status, payload.reason)
    response = {
        "ok": status == "SUCCESS",
        "event": "action_taken",
        "case_id": payload.case_id,
        "action": action_name,
        "target_id": target_id,
        "status": action_entry.get("status", "NACK"),
        "action_id": action_entry.get("action_id"),
        "timestamp": action_entry.get("timestamp", _now_iso()),
    }

    await manager.broadcast(response)
    await manager.broadcast({"event": "case_updated", **_case_payload(case)})
    return response


@app.post("/action/freeze")
async def freeze_action(payload: ActionRequest) -> dict[str, Any]:
    return await _handle_action("freeze", payload)


@app.post("/action/flag")
async def flag_action(payload: ActionRequest) -> dict[str, Any]:
    return await _handle_action("flag", payload)


@app.post("/action/alert")
async def alert_action(payload: ActionRequest) -> dict[str, Any]:
    return await _handle_action("alert", payload)


@app.post("/action/monitor")
async def monitor_action(payload: ActionRequest) -> dict[str, Any]:
    return await _handle_action("monitor", payload)


@app.post("/action/close")
async def close_action(payload: ActionRequest) -> dict[str, Any]:
    return await _handle_action("close", payload)


@app.post("/action/close_fp")
async def close_fp_action(payload: ActionRequest) -> dict[str, Any]:
    return await _handle_action("close_fp", payload)


@app.post("/attack-mode")
async def trigger_attack_mode() -> dict[str, Any]:
    """
    Triggers a burst of 5 high-risk transactions to simulate an active fraud attack.
    Each transaction is injected directly into the pipeline and broadcast via WebSocket.
    """
    import asyncio, random, string, uuid as _uuid
    from datetime import datetime, timezone as _tz

    def _rnd_id():
        return f"TX-{str(_uuid.uuid4())[:8].upper()}"

    def _rnd_acc(prefix):
        sfx = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
        return f"{prefix}-{sfx}-{random.randint(1000,9999)}"

    def _now():
        return datetime.now(_tz.utc).isoformat().replace("+00:00", "Z")

    ATTACK_TEMPLATES = [
        {"is_cross_border": True, "channel": "NEFT",  "amount_range": (200000, 500000)},
        {"is_crypto_related": True, "channel": "IMPS", "amount_range": (300000, 500000)},
        {"device_changed": True, "location_changed": True, "channel": "UPI", "amount_range": (50000, 100000)},
        {"on_active_call": True, "is_scripted": True,  "channel": "CARD", "amount_range": (100000, 200000)},
        {"bulk_transfer_flag": True, "channel": "NEFT", "amount_range": (250000, 500000)},
    ]

    async def _fire_burst():
        for tpl in ATTACK_TEMPLATES:
            amount = round(random.uniform(*tpl["amount_range"]), 2)
            tx = {
                "tx_id": _rnd_id(),
                "timestamp": _now(),
                "sender_account": _rnd_acc("ACC-ATTACK"),
                "receiver_account": _rnd_acc("ACC-DRAIN"),
                "amount": amount,
                "currency": "INR",
                "channel": tpl.get("channel", "NEFT"),
                "hop_number": 0,
            }
            for k, v in tpl.items():
                if k not in ("channel", "amount_range"):
                    tx[k] = v

            result = run_pipeline(tx, data_store)
            transaction = result.get("transaction") or {}
            tx_event = {
                "event": "tx_scored",
                "tx_id": transaction.get("tx_id", ""),
                "timestamp": transaction.get("timestamp") or _now(),
                "case_id": transaction.get("case_id", ""),
                "risk_score": float(transaction.get("risk_score", 0.0)),
                "amount": float(transaction.get("amount", 0.0)),
                "sender_account": transaction.get("sender_account", "UNKNOWN"),
                "receiver_account": transaction.get("receiver_account", "UNKNOWN"),
                "channel": transaction.get("channel", "NEFT"),
                "risk_factors": transaction.get("risk_factors", []),
                "threshold": transaction.get("threshold", "LOW"),
                "reason": transaction.get("reason", "Low risk pattern"),
                "full_reason": transaction.get("full_reason", ""),
                "confidence": transaction.get("confidence", "LOW"),
                "ml_score": transaction.get("ml_score", 0),
                "rule_score": transaction.get("rule_score", 0),
                "ml_feature_importance": transaction.get("ml_feature_importance", {})
            }
            await manager.broadcast(tx_event)
            case = result.get("case")
            if case:
                await manager.broadcast({"event": "case_updated", **_case_payload(case)})
            await asyncio.sleep(0.8)

    asyncio.create_task(_fire_burst())
    return {"ok": True, "message": "Attack mode burst initiated — 5 high-risk transactions injected"}


async def _baseline_loop():
    """
    Launches a continuous background simulation loop on backend startup.
    Generates baseline transactions across low/medium/high risk scenarios.
    """
    await asyncio.sleep(0.5)
    while True:
        try:
            tier = random.choices(["LOW", "MEDIUM", "HIGH"], weights=[60, 25, 15])[0]
            channel = random.choice(["UPI", "IMPS", "NEFT", "CARD"])
            sender = f"ACC-USR-{random.randint(1000, 9999)}"
            receiver = f"ACC-MERCH-{random.randint(1000, 9999)}"
            
            if tier == "LOW":
                amount = round(random.uniform(100, 8000), 2)
                tx = {
                    "tx_id": f"TX-{uuid4().hex[:8].upper()}",
                    "timestamp": _now_iso(),
                    "sender_account": sender,
                    "receiver_account": receiver,
                    "amount": amount,
                    "currency": "INR",
                    "channel": channel
                }
            elif tier == "MEDIUM":
                amount = round(random.uniform(25000, 85000), 2)
                tx = {
                    "tx_id": f"TX-{uuid4().hex[:8].upper()}",
                    "timestamp": _now_iso(),
                    "sender_account": sender,
                    "receiver_account": receiver,
                    "amount": amount,
                    "currency": "INR",
                    "channel": channel,
                    "on_active_call": random.choice([True, False]),
                    "is_scripted": True
                }
            else: # HIGH
                amount = round(random.uniform(150000, 450000), 2)
                tx = {
                    "tx_id": f"TX-{uuid4().hex[:8].upper()}",
                    "timestamp": _now_iso(),
                    "sender_account": f"ACC-VICTIM-{random.randint(1000, 9999)}",
                    "receiver_account": f"ACC-MULE-{random.randint(1000, 9999)}",
                    "amount": amount,
                    "currency": "INR",
                    "channel": channel,
                    "is_cross_border": random.choice([True, False])
                }

            result = run_pipeline(tx, data_store)
            transaction = result.get("transaction") or {}
            tx_event = {
                "event": "tx_scored",
                "tx_id": transaction.get("tx_id", ""),
                "timestamp": transaction.get("timestamp") or _now_iso(),
                "case_id": transaction.get("case_id", ""),
                "risk_score": float(transaction.get("risk_score", 0.0)),
                "amount": float(transaction.get("amount", 0.0)),
                "sender_account": transaction.get("sender_account", "UNKNOWN"),
                "receiver_account": transaction.get("receiver_account", "UNKNOWN"),
                "channel": transaction.get("channel", "UPI"),
                "risk_factors": transaction.get("risk_factors", []),
                "threshold": transaction.get("threshold", "LOW"),
                "reason": transaction.get("reason", "Low risk pattern"),
                "full_reason": transaction.get("full_reason", ""),
                "confidence": transaction.get("confidence", "LOW"),
                "ml_score": transaction.get("ml_score", 0),
                "rule_score": transaction.get("rule_score", 0),
                "ml_feature_importance": transaction.get("ml_feature_importance", {})
            }
            await manager.broadcast(tx_event)
            case = result.get("case")
            if case:
                await manager.broadcast({"event": "case_updated", **_case_payload(case)})

        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[SENTINEL Simulator] Background loop error: {e}")
        
        await asyncio.sleep(random.uniform(5.0, 8.0))



@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        await websocket.send_json({"event": "connected", "status": "LIVE"})

        # Hydrate newly connected WS client with recent transactions
        tx_store = data_store.get("transactions", {})
        recent_txs = list(tx_store.values())[-20:]
        for transaction in recent_txs:
            tx_event = {
                "event": "tx_scored",
                "tx_id": transaction.get("tx_id", ""),
                "timestamp": transaction.get("timestamp") or _now_iso(),
                "case_id": transaction.get("case_id", ""),
                "risk_score": float(transaction.get("risk_score", 0.0)),
                "amount": float(transaction.get("amount", 0.0)),
                "sender_account": transaction.get("sender_account", "UNKNOWN"),
                "receiver_account": transaction.get("receiver_account", "UNKNOWN"),
                "channel": transaction.get("channel", "UPI"),
                "risk_factors": transaction.get("risk_factors", []),
                "threshold": transaction.get("threshold", "LOW"),
                "reason": transaction.get("reason", "Low risk pattern"),
                "full_reason": transaction.get("full_reason", ""),
                "confidence": transaction.get("confidence", "LOW"),
                "ml_score": transaction.get("ml_score", 0),
                "rule_score": transaction.get("rule_score", 0),
                "ml_feature_importance": transaction.get("ml_feature_importance", {})
            }
            await websocket.send_json(tx_event)

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
