from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4
import asyncio
import random
import string

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Depends, HTTPException

from pydantic import BaseModel

import os
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.repositories.postgres import PostgreSQLCaseRepository
from app.core.data_store import data_store
from app.repositories.base import AbstractCaseRepository
from app.repositories.in_memory import InMemoryCaseRepository
from app.services.mock_apis import mock_bank_freeze, mock_police_alert, mock_telecom_flag, mock_monitor_account, mock_close_case
from app.services.orchestrator import run_pipeline
from app.services.evidence_agent import collect_evidence, collect_evidence_for_case, collect_evidence_for_transaction
from app.services.contextual_agent import investigate_context, investigate_case, investigate_transaction
from app.services.regulatory_agent import assess_regulatory_risk, assess_case_regulatory_risk, assess_transaction_regulatory_risk
from app.services.audit_explanation_agent import generate_audit_explanation, generate_case_audit_explanation, generate_transaction_audit_explanation
from app.services.analyst_agent import generate_analyst_decision_support, generate_case_analyst_decision_support, generate_transaction_analyst_decision_support
from app.services.case_lifecycle_agent import (
    CaseLifecycleService,
    submit_case_disposition as submit_case_disposition_service,
    get_case_disposition_history,
    get_case_audit_history,
)
from app.services.investigation_orchestrator import investigation_orchestrator


from fastapi.middleware.cors import CORSMiddleware


def get_repository(
    session: Optional[AsyncSession] = Depends(get_db_session)
) -> AbstractCaseRepository:
    """
    FastAPI Dependency Provider for AbstractCaseRepository (Phase 8 Step 1).
    - If AsyncSession is active: returns PostgreSQLCaseRepository(session).
    - If AsyncSession is None and in dev/test mode: returns InMemoryCaseRepository(data_store).
    - If in production mode or PostgreSQL configured but session is None: FAILS FAST (raises RuntimeError).
    """
    sentinel_mode = os.getenv("SENTINEL_MODE", "development").lower()
    db_url = os.getenv("DATABASE_URL")
    is_postgres_env = bool(db_url and db_url.startswith("postgresql"))

    if session is not None:
        return PostgreSQLCaseRepository(session)

    if sentinel_mode == "production" or is_postgres_env:
        raise RuntimeError("POSTGRESQL PERSISTENCE FAILURE: Database session unavailable in production mode.")

    return InMemoryCaseRepository(data_store)



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
investigation_orchestrator.broadcast_manager = manager



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
    contextual_investigation = investigate_context(evidence_package)
    regulatory_assessment = assess_regulatory_risk(evidence_package, contextual_investigation)
    audit_explanation = generate_audit_explanation(evidence_package, contextual_investigation, regulatory_assessment)
    analyst_decision_support = generate_analyst_decision_support(evidence_package, contextual_investigation, regulatory_assessment, audit_explanation, case_context=case)

    raw_rl = case.get("risk_level", "LOW")
    try:
        rl_val: Any = float(raw_rl)
    except (ValueError, TypeError):
        rl_val = str(raw_rl)

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
        "risk_level": rl_val,
        "golden_window_minutes": int(case.get("golden_window_minutes", 0)),
        "total_fraud_amount": float(case.get("total_fraud_amount", 0.0)),

        "chain": case.get("chain", []),
        "evidence_package": evidence_package,
        "contextual_investigation": contextual_investigation,
        "regulatory_assessment": regulatory_assessment,
        "audit_explanation": audit_explanation,
        "analyst_decision_support": analyst_decision_support,
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


class DispositionRequest(BaseModel):
    case_id: str | None = None
    action_code: str
    analyst_notes: str | None = None
    analyst_id: str | None = "ANALYST-001"
    analyst_role: str | None = "COMPLIANCE_ANALYST"
    risk_acknowledged: bool = False
    idempotency_key: str | None = None



@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "message": "Sentinel API is healthy"}


async def _run_background_investigation(case_id: str, store: dict):
    """
    Executes the automated investigation in a dedicated, isolated database session
    without holding or sharing the HTTP request's session.
    """
    db_url = os.getenv("DATABASE_URL")
    if db_url or os.getenv("SENTINEL_MODE") == "production":
        try:
            async for session in get_db_session():
                repo = PostgreSQLCaseRepository(session)
                try:
                    await investigation_orchestrator.run_investigation(case_id, repo=repo, store=store)
                    await session.commit()
                except Exception as e:
                    await session.rollback()
                    print(f"[Background Investigation Error] {e}")
                break
        except Exception as e:
            print(f"[Background Session Error] {e}")
    else:
        repo = InMemoryCaseRepository(store)
        await investigation_orchestrator.run_investigation(case_id, repo=repo, store=store)


@app.post("/transaction")
async def process_tx(
    request: Request,
    repo: AbstractCaseRepository = Depends(get_repository)
) -> dict[str, Any]:
    try:
        tx = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    if not isinstance(tx, dict) or not tx.get("tx_id"):
        raise HTTPException(status_code=400, detail="Invalid transaction payload structure")

    result = run_pipeline(tx, data_store)

    transaction = result.get("transaction") or {}
    case = result.get("case")

    sender_id = transaction.get("sender_account")
    receiver_id = transaction.get("receiver_account")
    accounts_to_save = []

    if sender_id:
        acc_s = data_store.get("accounts", {}).get(sender_id) or {"account_id": sender_id}
        accounts_to_save.append(acc_s)
    if receiver_id and receiver_id != sender_id:
        acc_r = data_store.get("accounts", {}).get(receiver_id) or {"account_id": receiver_id}
        accounts_to_save.append(acc_r)

    await repo.save_transaction_and_case(accounts_to_save, transaction, case)

    if isinstance(repo, PostgreSQLCaseRepository):
        await repo.session.commit()

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

    if case:
        case_id = case.get("case_id")
        if case_id:
            sync_env = os.getenv("SENTINEL_SYNC_INVESTIGATION")
            if sync_env is not None:
                is_sync = (sync_env == "1")
            else:
                is_sync = not (os.getenv("SENTINEL_MODE") == "production" or os.getenv("DATABASE_URL"))

            if is_sync:
                await investigation_orchestrator.run_investigation(case_id, repo=repo, store=data_store)
            else:
                asyncio.create_task(_run_background_investigation(case_id, data_store))
        case_event = {"event": "case_updated", **_case_payload(case)}
        await manager.broadcast(case_event)


    if isinstance(repo, PostgreSQLCaseRepository):
        await repo.session.commit()

    return result






@app.get("/cases")
async def get_cases(
    repo: AbstractCaseRepository = Depends(get_repository)
) -> list[dict[str, Any]]:
    case_list = await repo.get_cases()
    return [_case_payload(c) for c in case_list]


@app.post("/cases/{case_id}/investigate")
async def trigger_case_investigation(
    case_id: str,
    repo: AbstractCaseRepository = Depends(get_repository)
) -> dict[str, Any]:
    """
    Triggers/re-runs the Phase 9 automated end-to-end investigation pipeline for a given case_id.
    """
    record = await investigation_orchestrator.run_investigation(case_id, repo=repo, store=data_store, force_rerun=True)
    if isinstance(repo, PostgreSQLCaseRepository):
        await repo.session.commit()
    return record


@app.get("/cases/{case_id}/investigation-status")
async def get_investigation_status(
    case_id: str,
    repo: AbstractCaseRepository = Depends(get_repository)
) -> dict[str, Any]:
    """
    Returns current Phase 9 automated investigation status and stage execution metrics.
    """
    if case_id in investigation_orchestrator._active_investigations:
        return investigation_orchestrator._active_investigations[case_id]

    rpt = await repo.get_investigation_report(case_id, "DECISION_SUPPORT")
    if rpt and isinstance(rpt.get("report_data"), dict):
        return rpt["report_data"]

    raise HTTPException(status_code=404, detail=f"No investigation record found for case '{case_id}'")




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


async def _build_investigation_read_model(case_id: str, repo: AbstractCaseRepository) -> dict[str, Any]:
    run = await repo.get_active_investigation_run(case_id) or await repo.get_latest_investigation_run(case_id)

    stage_types = ["EVIDENCE", "CONTEXTUAL", "REGULATORY", "AUDIT_EXPLANATION", "DECISION_SUPPORT"]

    stages_output = []
    completed_count = 0
    failed_count = 0
    skipped_count = 0
    degraded_reasons = []

    stage_states = run.get("stages", {}) if run else {}

    for stg in stage_types:
        stg_info = stage_states.get(stg, {})
        stg_status = stg_info.get("status", "PENDING")
        stg_start = stg_info.get("started_at")
        stg_comp = stg_info.get("completed_at")
        stg_err = stg_info.get("error")

        duration_ms = None
        if stg_start and stg_comp:
            try:
                dt_s = datetime.fromisoformat(stg_start.replace("Z", "+00:00"))
                dt_c = datetime.fromisoformat(stg_comp.replace("Z", "+00:00"))
                duration_ms = int((dt_c - dt_s).total_seconds() * 1000)
            except Exception:
                pass

        rpt = None
        rpt_id = None
        if stg_status == "COMPLETED":
            completed_count += 1
            rpt_obj = await repo.get_investigation_report(case_id, stg)
            if rpt_obj:
                rpt_id = rpt_obj.get("report_id")
                rpt = rpt_obj.get("report_data")
        elif stg_status == "FAILED":
            failed_count += 1
            if stg_err:
                degraded_reasons.append(f"{stg}_STAGE_FAILED: {stg_err}")
        elif stg_status == "SKIPPED":
            skipped_count += 1

        stages_output.append({
            "stage": stg,
            "status": stg_status,
            "started_at": stg_start,
            "completed_at": stg_comp,
            "duration_ms": duration_ms,
            "report_id": rpt_id,
            "output": rpt,
            "error": stg_err
        })

    ds_rpt_obj = await repo.get_investigation_report(case_id, "DECISION_SUPPORT")
    ds_output = ds_rpt_obj.get("report_data") if ds_rpt_obj else None

    run_status = run.get("status", "NONE") if run else "NONE"
    is_degraded = (run_status == "DEGRADED") or (failed_count > 0)

    sum_dict = run.get("summary", {}) if run else {}
    degraded_reasons = sum_dict.get("degraded_reasons") or degraded_reasons

    return {
        "case_id": case_id,
        "run_id": run.get("run_id") if run else None,
        "status": run_status,
        "started_at": run.get("started_at") if run else None,
        "completed_at": run.get("completed_at") if run else None,
        "current_stage": run.get("current_stage", "NONE") if run else "NONE",
        "stages": stages_output,
        "summary": {
            "completed_stages": completed_count,
            "failed_stages": failed_count,
            "skipped_stages": skipped_count,
            "degraded": is_degraded,
            "degraded_reasons": degraded_reasons,
            "review_priority": sum_dict.get("review_priority", "UNKNOWN"),
            "regulatory_severity": sum_dict.get("regulatory_severity", "UNKNOWN"),
            "recommended_action": sum_dict.get("recommended_action", "NO_RECOMMENDATION")
        },
        "decision_support": ds_output,
        "human_approval_boundary": {
            "autonomous_execution": False,
            "required_role": "COMPLIANCE_ANALYST"
        }
    }


@app.get("/cases/{case_id}/investigation")
async def get_case_investigation(
    case_id: str,
    repo: AbstractCaseRepository = Depends(get_repository)
) -> dict[str, Any]:
    """
    Returns Phase 10 read-oriented comprehensive investigation representation for a given case.
    """
    return await _build_investigation_read_model(case_id, repo)


@app.get("/cases/{case_id}/reports/{report_type}")
async def get_case_stage_report(
    case_id: str,
    report_type: str,
    repo: AbstractCaseRepository = Depends(get_repository)
) -> dict[str, Any]:
    """
    Retrieves historical, immutable persisted investigation report for a given stage.
    """
    valid_types = {"EVIDENCE", "CONTEXTUAL", "REGULATORY", "AUDIT_EXPLANATION", "DECISION_SUPPORT"}
    clean_type = report_type.upper()
    if clean_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid report_type '{report_type}'. Must be one of {valid_types}")

    rpt = await repo.get_investigation_report(case_id, clean_type)
    if not rpt or not rpt.get("report_data"):
        raise HTTPException(status_code=404, detail=f"Report '{clean_type}' not found or stage failed for case '{case_id}'")

    return rpt


@app.get("/cases/{case_id}/investigation-runs")
async def get_case_investigation_runs(
    case_id: str,
    repo: AbstractCaseRepository = Depends(get_repository)
) -> list[dict[str, Any]]:
    """
    Returns all historical durable InvestigationRun records for a given case_id.
    """
    return await repo.get_investigation_runs_for_case(case_id)


@app.get("/cases/{case_id}/investigation-runs/{run_id}")
async def get_specific_investigation_run(
    case_id: str,
    run_id: str,
    repo: AbstractCaseRepository = Depends(get_repository)
) -> dict[str, Any]:
    """
    Returns specific historical InvestigationRun record by run_id.
    """
    run = await repo.get_investigation_run(run_id)
    if not run or run.get("case_id") != case_id:
        raise HTTPException(status_code=404, detail=f"Investigation run '{run_id}' not found for case '{case_id}'")
    return run



@app.get("/transactions/{tx_id}/investigation")
def get_transaction_investigation(tx_id: str) -> dict[str, Any]:
    """
    Returns Phase 2 Contextual Investigation Report for a given transaction.
    """
    return investigate_transaction(tx_id, data_store)



@app.post("/investigation")
def get_investigation_post(payload: EvidenceRequest) -> dict[str, Any]:
    """
    Universal investigation endpoint supporting target_id, case_id, or tx_id.
    """
    target = payload.target_id or payload.case_id or payload.tx_id or ""
    evidence_pkg = collect_evidence(target, data_store)
    return investigate_context(evidence_pkg)


@app.get("/cases/{case_id}/regulatory-assessment")
def get_case_regulatory_assessment(case_id: str) -> dict[str, Any]:
    """
    Returns Phase 3 Regulatory Risk Assessment Report for a given case.
    """
    return assess_case_regulatory_risk(case_id, data_store)


@app.get("/transactions/{tx_id}/regulatory-assessment")
def get_transaction_regulatory_assessment(tx_id: str) -> dict[str, Any]:
    """
    Returns Phase 3 Regulatory Risk Assessment Report for a given transaction.
    """
    return assess_transaction_regulatory_risk(tx_id, data_store)


@app.post("/regulatory-assessment")
def get_regulatory_assessment_post(payload: EvidenceRequest) -> dict[str, Any]:
    """
    Universal regulatory assessment endpoint supporting target_id, case_id, or tx_id.
    """
    target = payload.target_id or payload.case_id or payload.tx_id or ""
    evidence_pkg = collect_evidence(target, data_store)
    contextual_rpt = investigate_context(evidence_pkg)
    return assess_regulatory_risk(evidence_pkg, contextual_rpt)


@app.get("/cases/{case_id}/audit-explanation")
def get_case_audit_explanation(case_id: str) -> dict[str, Any]:
    """
    Returns Phase 4 Audit Explanation Report for a given case.
    """
    return generate_case_audit_explanation(case_id, data_store)


@app.get("/transactions/{tx_id}/audit-explanation")
def get_transaction_audit_explanation(tx_id: str) -> dict[str, Any]:
    """
    Returns Phase 4 Audit Explanation Report for a given transaction.
    """
    return generate_transaction_audit_explanation(tx_id, data_store)


@app.post("/audit-explanation")
def get_audit_explanation_post(payload: EvidenceRequest) -> dict[str, Any]:
    """
    Universal audit explanation endpoint supporting target_id, case_id, or tx_id.
    """
    target = payload.target_id or payload.case_id or payload.tx_id or ""
    evidence_pkg = collect_evidence(target, data_store)
    contextual_rpt = investigate_context(evidence_pkg)
    regulatory_rpt = assess_regulatory_risk(evidence_pkg, contextual_rpt)
    return generate_audit_explanation(evidence_pkg, contextual_rpt, regulatory_rpt)


@app.get("/cases/{case_id}/decision-support")
def get_case_decision_support(case_id: str) -> dict[str, Any]:
    """
    Returns Phase 5 Analyst Decision Support Report for a given case.
    """
    return generate_case_analyst_decision_support(case_id, data_store)


@app.get("/transactions/{tx_id}/decision-support")
def get_transaction_decision_support(tx_id: str) -> dict[str, Any]:
    """
    Returns Phase 5 Analyst Decision Support Report for a given transaction.
    """
    return generate_transaction_analyst_decision_support(tx_id, data_store)


@app.post("/decision-support")
def get_decision_support_post(payload: EvidenceRequest) -> dict[str, Any]:
    """
    Universal decision support endpoint supporting target_id, case_id, or tx_id.
    Validates scope matching if both case_id and tx_id are provided.
    """
    target = payload.target_id or payload.case_id or payload.tx_id or ""
    if payload.case_id and payload.tx_id:
        tx_obj = data_store.get("transactions", {}).get(payload.tx_id)
        if tx_obj and tx_obj.get("case_id") and tx_obj.get("case_id") != payload.case_id:
            return {
                "found": False,
                "status": "INVALID_INPUT",
                "target_id": target,
                "case_id": payload.case_id,
                "primary_tx_id": payload.tx_id,
                "generated_at": _now_iso(),
                "summary": {
                    "review_priority": "UNKNOWN",
                    "regulatory_severity": "UNKNOWN",
                    "assessment_heuristic_index": 0.0,
                    "recommended_step_count": 0,
                    "requires_human_approval": True
                },
                "analyst_executive_brief": f"Decision support failed: Mismatched case_id ({payload.case_id}) and primary_tx_id ({payload.tx_id}).",
                "review_priority": "UNKNOWN",
                "priority_rationale": "Case and transaction ID scope mismatch.",
                "recommended_review_steps": [],
                "disposition_options": [],
                "uncertainties": ["Input payload contains conflicting case_id and tx_id."],
                "data_gaps": ["Scope mismatch between case_id and tx_id."],
                "human_approval_boundary": {
                    "autonomous_execution": False,
                    "required_role": "COMPLIANCE_ANALYST"
                },
                "audit_trail": {
                    "source_stages": [],
                    "input_case_id": payload.case_id,
                    "input_transaction_id": payload.tx_id,
                    "generator": "analyst_decision_support_agent",
                    "generator_version": "phase5-v1",
                    "deterministic": True
                }
            }

    if payload.case_id:
        return generate_case_analyst_decision_support(payload.case_id, data_store)
    elif payload.tx_id:
        return generate_transaction_analyst_decision_support(payload.tx_id, data_store)
    else:
        evidence_pkg = collect_evidence(target, data_store)
        contextual_rpt = investigate_context(evidence_pkg)
        regulatory_rpt = assess_regulatory_risk(evidence_pkg, contextual_rpt)
        audit_exp = generate_audit_explanation(evidence_pkg, contextual_rpt, regulatory_rpt)
        return generate_analyst_decision_support(evidence_pkg, contextual_rpt, regulatory_rpt, audit_exp)


async def _ensure_pg_case_seeded(session: AsyncSession, case_dict: dict[str, Any]) -> None:
    if not case_dict or not isinstance(case_dict, dict):
        return
    case_id = case_dict.get("case_id")
    if not case_id:
        return
    from sqlalchemy import select
    from app.models.case import Case
    from app.models.account import Account
    from app.models.transaction import Transaction

    res = await session.execute(select(Case).filter(Case.case_id == case_id))
    case_obj = res.scalar_one_or_none()
    if case_obj:
        target_status = case_dict.get("status", "NEW")
        if case_obj.status != target_status:
            case_obj.status = target_status
            await session.flush()
        return

    now = datetime.now(timezone.utc)
    primary_tx_id = case_dict.get("primary_tx_id") or f"TX-SEED-{case_id}"
    acc1_id = case_dict.get("sender_account") or f"ACC-SND-{case_id}"
    acc2_id = case_dict.get("receiver_account") or f"ACC-RCV-{case_id}"

    for acc_id in [acc1_id, acc2_id]:
        acc_res = await session.execute(select(Account).filter(Account.account_id == acc_id))
        if not acc_res.scalar_one_or_none():
            session.add(Account(account_id=acc_id, created_at=now, updated_at=now))

    tx_res = await session.execute(select(Transaction).filter(Transaction.tx_id == primary_tx_id))
    if not tx_res.scalar_one_or_none():
        session.add(Transaction(
            tx_id=primary_tx_id,
            sender_account_id=acc1_id,
            receiver_account_id=acc2_id,
            amount=float(case_dict.get("total_fraud_amount", 1000.0)),
            channel="UPI",
            timestamp=now,
            raw_payload={},
            created_at=now
        ))

    session.add(Case(
        case_id=case_id,
        primary_tx_id=primary_tx_id,
        status=case_dict.get("status", "NEW"),
        risk_level=str(case_dict.get("risk_level", "LOW")),
        golden_window_minutes=int(case_dict.get("golden_window_minutes", 30)),
        total_fraud_amount=float(case_dict.get("total_fraud_amount", 0.0)),
        recoverable_amount=float(case_dict.get("recoverable_amount", 0.0)),
        created_at=now,
        updated_at=now
    ))
    await session.flush()



@app.post("/cases/{case_id}/disposition")
async def submit_case_disposition(
    case_id: str,
    payload: DispositionRequest,
    repo: AbstractCaseRepository = Depends(get_repository)
) -> dict[str, Any]:
    """
    Stateful Case Lifecycle Disposition Endpoint (Phase 7 Repository Adapter / Phase 8 Step 1 DI).
    """
    case_dict = None
    if isinstance(repo, PostgreSQLCaseRepository):
        case_dict = await repo.get_case_by_id(case_id)
    if not case_dict:
        case_dict = data_store.get("cases", {}).get(case_id)
        if case_dict and isinstance(repo, PostgreSQLCaseRepository):
            await _ensure_pg_case_seeded(repo.session, case_dict)

    if not case_dict:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Case '{case_id}' not found.",
            "acknowledged": False
        }

    if payload.case_id and payload.case_id != case_id:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Payload case_id '{payload.case_id}' does not match path case_id '{case_id}'.",
            "acknowledged": False
        }

    forbidden_codes = {"FREEZE", "BLOCK", "FILE_STR", "CLOSE_ACCOUNT", "REJECT_TRANSACTION"}
    if payload.action_code and payload.action_code.upper() in forbidden_codes:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Forbidden action code '{payload.action_code}'. Phase 7 does not execute autonomous enforcement actions.",
            "acknowledged": False
        }

    # Resolve Phase 5 decision support report
    ds_report = generate_case_analyst_decision_support(case_id, data_store)

    # Invoke repository-backed stateful disposition service directly (async)
    service = CaseLifecycleService(repo)
    res = await service.submit_case_disposition(
        case_id=case_id,
        action_code=payload.action_code,
        analyst_notes=payload.analyst_notes or "",
        decision_support_report=ds_report,
        analyst_id=payload.analyst_id or "ANALYST-001",
        analyst_role=payload.analyst_role or "COMPLIANCE_ANALYST",
        risk_acknowledged=payload.risk_acknowledged,
        idempotency_key=payload.idempotency_key
    )


    if res.get("ok"):
        c_ds = data_store.get("cases", {}).get(case_id)
        if c_ds and res.get("new_case_status"):
            c_ds["status"] = res["new_case_status"]
            if res.get("disposition"):
                c_ds.setdefault("actions_taken", []).insert(0, res["disposition"])

        if isinstance(repo, PostgreSQLCaseRepository):
            await repo.session.commit()

    return res


@app.get("/cases/{case_id}/history")
async def get_case_history_endpoint(
    case_id: str,
    repo: AbstractCaseRepository = Depends(get_repository)
) -> dict[str, Any]:
    """
    Returns complete chronological lifecycle and disposition audit history for a given case via repository.
    """
    case_dict = None
    if isinstance(repo, PostgreSQLCaseRepository):
        case_dict = await repo.get_case_by_id(case_id)
    if not case_dict:
        case_dict = data_store.get("cases", {}).get(case_id)
        if case_dict and isinstance(repo, PostgreSQLCaseRepository):
            await _ensure_pg_case_seeded(repo.session, case_dict)

    if not case_dict:
        return {
            "found": False,
            "status": "INSUFFICIENT_DATA",
            "error": f"Case '{case_id}' not found.",
            "case_id": case_id,
            "disposition_history": [],
            "audit_history": []
        }

    service = CaseLifecycleService(repo)
    hist = await service.get_case_history(case_id)

    dispositions = hist.get("disposition_history", [])
    audit_log = hist.get("audit_history", [])

    return {
        "found": True,
        "status": "SUCCESS",
        "case_id": case_id,
        "primary_tx_id": case_dict.get("primary_tx_id"),
        "current_case_status": case_dict.get("status", "NEW"),
        "disposition_count": len(dispositions),
        "audit_count": len(audit_log),
        "disposition_history": dispositions,
        "audit_history": audit_log
    }




def _sanitize_csv_field(val: Any) -> str:
    """Escapes leading formula injection characters for CSV security."""
    if val is None:
        return ""
    s = str(val)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{s}"
    return s


@app.get("/export/sentinel_audit.csv")
async def export_csv(
    repo: AbstractCaseRepository = Depends(get_repository)
):
    """
    Generates and streams a CSV audit log from authoritative repository store.
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

    tx_list = await repo.get_all_transactions()
    for tx in tx_list:
        score = float(tx.get("risk_score", 0))
        level = "HIGH_RISK" if score >= 70 else "MEDIUM" if score >= 40 else "LOW"
        writer.writerow([
            _sanitize_csv_field(tx.get("tx_id", "")),
            _sanitize_csv_field(tx.get("timestamp", "")),
            _sanitize_csv_field(tx.get("channel", "")),
            _sanitize_csv_field(tx.get("sender_account") or tx.get("sender_account_id") or ""),
            _sanitize_csv_field(tx.get("receiver_account") or tx.get("receiver_account_id") or ""),
            tx.get("amount", 0.0),
            score,
            level,
            _sanitize_csv_field(tx.get("case_id", ""))
        ])

    # ── Section 2: Investigative Actions ─────────────────────────────────────
    all_actions = []
    cases = await repo.get_cases()
    for c in cases:
        c_hist = await repo.get_case_history(c.get("case_id", ""))
        c_actions = c_hist.get("disposition_history", []) if isinstance(c_hist, dict) else []
        all_actions.extend(c_actions)


    if not all_actions:
        audit_events = await repo.get_all_audit_events()
        all_actions = audit_events

    if all_actions:
        writer.writerow([])
        writer.writerow(['INVESTIGATIVE ACTIONS'])
        writer.writerow([
            'Action ID', 'Case ID', 'Action Type',
            'Target Account', 'Status', 'Reason', 'Latency (ms)', 'Timestamp'
        ])
        for a in all_actions:
            writer.writerow([
                _sanitize_csv_field(a.get("disposition_id") or a.get("audit_id") or a.get("action_id", "")),
                _sanitize_csv_field(a.get("case_id", "")),
                _sanitize_csv_field(a.get("action_code") or a.get("event_type") or a.get("action_type", "")),
                _sanitize_csv_field(a.get("target") or a.get("analyst_id") or "GLOBAL"),
                _sanitize_csv_field(a.get("new_case_status") or a.get("status", "ACK")),
                _sanitize_csv_field(a.get("analyst_notes") or a.get("reason", "System Action")),
                a.get("latency", 0),
                _sanitize_csv_field(a.get("disposition_timestamp") or a.get("timestamp", ""))
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

        # Hydrate newly connected WS client with recent transactions using short-lived DB session
        recent_txs = []
        try:
            async for session in get_db_session():
                repo = get_repository(session=session)
                recent_txs = await repo.get_recent_transactions(limit=20)
                break
        except Exception:
            recent_txs = list(data_store.get("transactions", {}).values())[-20:]

        for transaction in recent_txs:
            tx_event = {
                "event": "tx_scored",
                "tx_id": transaction.get("tx_id", ""),
                "timestamp": transaction.get("timestamp") or _now_iso(),
                "case_id": transaction.get("case_id", ""),
                "risk_score": float(transaction.get("risk_score", 0.0)),
                "amount": float(transaction.get("amount", 0.0)),
                "sender_account": transaction.get("sender_account") or transaction.get("sender_account_id") or "UNKNOWN",
                "receiver_account": transaction.get("receiver_account") or transaction.get("receiver_account_id") or "UNKNOWN",
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
