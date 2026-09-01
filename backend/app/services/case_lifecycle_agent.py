"""
Case Lifecycle & Audit Persistence Agent for SENTINEL (Phase 6).

Responsibility:
- Implements a central Case Lifecycle State Machine (NEW -> UNDER_REVIEW -> CDD_PENDING -> ESCALATED -> RESOLVED_DISMISSED / RESOLVED_APPROVED).
- Consumes validated Phase 5 Decision Support reports and analyst disposition requests.
- Validates identity context (analyst_id, analyst_role), action authorization, state transitions, and multi-tier ID traceability.
- Strictly enforces atomicity: ANY validation failure causes ZERO state mutation.
- Strictly rejects autonomous enforcement action codes (FREEZE, BLOCK, FILE_STR, CLOSE_ACCOUNT, REJECT_TRANSACTION).
- Persists stateful disposition records to data_store["dispositions"] and immutable audit events to data_store["audit_log"].
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Set
from uuid import uuid4

# Defined Lifecycle States
STATE_NEW = "NEW"
STATE_UNDER_REVIEW = "UNDER_REVIEW"
STATE_CDD_PENDING = "CDD_PENDING"
STATE_ESCALATED = "ESCALATED"
STATE_RESOLVED_DISMISSED = "RESOLVED_DISMISSED"
STATE_RESOLVED_APPROVED = "RESOLVED_APPROVED"

VALID_STATES = {
    STATE_NEW,
    STATE_UNDER_REVIEW,
    STATE_CDD_PENDING,
    STATE_ESCALATED,
    STATE_RESOLVED_DISMISSED,
    STATE_RESOLVED_APPROVED,
}

# Allowed State Transitions Engine
ALLOWED_TRANSITIONS: Dict[str, Set[str]] = {
    STATE_NEW: {
        STATE_UNDER_REVIEW,
        STATE_CDD_PENDING,
        STATE_ESCALATED,
        STATE_RESOLVED_DISMISSED,
        STATE_RESOLVED_APPROVED,
    },
    STATE_UNDER_REVIEW: {
        STATE_CDD_PENDING,
        STATE_ESCALATED,
        STATE_RESOLVED_DISMISSED,
        STATE_RESOLVED_APPROVED,
    },
    STATE_CDD_PENDING: {
        STATE_UNDER_REVIEW,
        STATE_ESCALATED,
        STATE_RESOLVED_DISMISSED,
        STATE_RESOLVED_APPROVED,
    },
    STATE_ESCALATED: {
        STATE_UNDER_REVIEW,
        STATE_CDD_PENDING,
        STATE_RESOLVED_DISMISSED,
        STATE_RESOLVED_APPROVED,
    },
    STATE_RESOLVED_DISMISSED: set(),  # Terminal state
    STATE_RESOLVED_APPROVED: set(),   # Terminal state
}

# Action-to-State Mapping
ACTION_STATE_MAP: Dict[str, str] = {
    "DISMISS_CASE": STATE_RESOLVED_DISMISSED,
    "APPROVE_TRANSACTION": STATE_RESOLVED_APPROVED,
    "REQUEST_CUSTOMER_CDD": STATE_CDD_PENDING,
    "ESCALATE_SENIOR_COMPLIANCE": STATE_ESCALATED,
}

# Forbidden Autonomous Action Codes
FORBIDDEN_ACTIONS: Set[str] = {
    "FREEZE",
    "BLOCK",
    "FILE_STR",
    "CLOSE_ACCOUNT",
    "REJECT_TRANSACTION",
}

# Allowed Analyst Roles
ALLOWED_ROLES: Set[str] = {
    "COMPLIANCE_ANALYST",
    "SENIOR_COMPLIANCE_OFFICER",
    "MLRO",
    "COMPLIANCE_OFFICER",
    "ADMIN",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_state_transition(current_state: str, target_state: str) -> bool:
    """
    Returns True if current_state -> target_state is a valid, allowed transition.
    """
    if current_state not in VALID_STATES or target_state not in VALID_STATES:
        return False
    allowed = ALLOWED_TRANSITIONS.get(current_state, set())
    return target_state in allowed


def submit_case_disposition(
    case_id: str,
    action_code: str,
    analyst_notes: str,
    decision_support_report: Dict[str, Any],
    analyst_id: str = "ANALYST-001",
    analyst_role: str = "COMPLIANCE_ANALYST",
    risk_acknowledged: bool = False,
    store: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Stateful Disposition Execution & Audit Persistence Entrypoint.
    
    ATOMICITY GUARANTEE:
    Validates identity, action authorization, decision support offerings, boundary consistency,
    state transitions, and traceability. If ANY validation fails, zero mutation occurs.
    Only after 100% validation success:
    1. Updates case status in store
    2. Appends disposition record to store["dispositions"]
    3. Appends immutable audit event to store["audit_log"]
    """
    from app.core.data_store import data_store

    s = store if store is not None else data_store

    # Ensure required collections exist in store
    if "cases" not in s or not isinstance(s["cases"], dict):
        s["cases"] = {}
    if "dispositions" not in s or not isinstance(s["dispositions"], dict):
        s["dispositions"] = {}
    if "audit_log" not in s or not isinstance(s["audit_log"], list):
        s["audit_log"] = []

    # 1. Identity Context Validation
    clean_analyst_id = (analyst_id or "").strip()
    clean_analyst_role = (analyst_role or "").strip().upper()

    if not clean_analyst_id or not clean_analyst_role:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": "Missing required analyst identity context (analyst_id or analyst_role).",
            "acknowledged": False
        }

    if clean_analyst_role not in ALLOWED_ROLES:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Invalid analyst role '{analyst_role}'. Must be one of {sorted(list(ALLOWED_ROLES))}.",
            "acknowledged": False
        }

    # 2. Action Authorization & Code Validation
    clean_action_code = (action_code or "").strip().upper()

    if not clean_action_code:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": "Missing action_code.",
            "acknowledged": False
        }

    if clean_action_code in FORBIDDEN_ACTIONS:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Forbidden action code '{action_code}'. Phase 6 does not execute autonomous enforcement actions.",
            "acknowledged": False
        }

    if clean_action_code not in ACTION_STATE_MAP:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Unknown or unmapped action code '{action_code}'.",
            "acknowledged": False
        }

    target_status = ACTION_STATE_MAP[clean_action_code]

    # 3. Decision Support Report & Offering Validation
    if not decision_support_report or not isinstance(decision_support_report, dict) or not decision_support_report.get("found"):
        return {
            "ok": False,
            "status": "INSUFFICIENT_DATA",
            "error": "Phase 5 decision support report is missing, invalid, or incomplete.",
            "acknowledged": False
        }

    ds_status = decision_support_report.get("status")
    if ds_status == "INCOMPLETE_TRACEABILITY":
        unres = decision_support_report.get("unresolved_references", [])
        return {
            "ok": False,
            "status": "INCOMPLETE_TRACEABILITY",
            "error": f"Decision support report contains incomplete traceability. Unresolved references: {unres}",
            "acknowledged": False
        }

    if ds_status != "SUCCESS":
        return {
            "ok": False,
            "status": ds_status or "INVALID_INPUT",
            "error": f"Decision support report status is '{ds_status}'. Cannot process disposition.",
            "acknowledged": False
        }

    offered_options = decision_support_report.get("disposition_options", [])
    if not isinstance(offered_options, list):
        offered_options = []

    matched_opt = next((o for o in offered_options if isinstance(o, dict) and o.get("action_code") == clean_action_code), None)
    if not matched_opt:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Action code '{action_code}' is not offered by Phase 5 decision support for this investigation.",
            "acknowledged": False
        }

    clean_notes = (analyst_notes or "").strip()
    if matched_opt.get("requires_reason_note") and not clean_notes:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Action '{clean_action_code}' requires a non-empty analyst note.",
            "acknowledged": False
        }

    if matched_opt.get("requires_risk_acknowledgement") and not risk_acknowledged:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Action '{clean_action_code}' requires risk_acknowledged = True.",
            "acknowledged": False
        }

    # 4. Strict Case & Transaction Boundary Validation
    clean_case_id = (case_id or "").strip()
    if not clean_case_id:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": "Missing case_id.",
            "acknowledged": False
        }

    ds_case_id = (decision_support_report.get("case_id") or "").strip()
    ds_tx_id = (decision_support_report.get("primary_tx_id") or "").strip()

    if ds_case_id and clean_case_id != ds_case_id:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Scope mismatch: Payload case_id '{clean_case_id}' does not match decision support case_id '{ds_case_id}'.",
            "acknowledged": False
        }

    case_obj = s["cases"].get(clean_case_id)
    if not case_obj or not isinstance(case_obj, dict):
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Case '{clean_case_id}' not found in data store.",
            "acknowledged": False
        }

    case_tx_id = (case_obj.get("primary_tx_id") or "").strip()
    if case_tx_id and ds_tx_id and case_tx_id != ds_tx_id:
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Scope mismatch: Case transaction '{case_tx_id}' does not match decision support transaction '{ds_tx_id}'.",
            "acknowledged": False
        }

    primary_tx_id = ds_tx_id or case_tx_id or ""

    # 5. State Machine Transition Validation
    current_status = case_obj.get("status", STATE_NEW)
    if current_status not in VALID_STATES:
        current_status = STATE_NEW

    if not validate_state_transition(current_status, target_status):
        return {
            "ok": False,
            "status": "INVALID_INPUT",
            "error": f"Invalid state transition from '{current_status}' to '{target_status}'. Transition is not permitted.",
            "acknowledged": False
        }

    # 6. Extract Traceability Chain from Decision Support
    steps = decision_support_report.get("recommended_review_steps", [])
    supp_reg_ids: Set[str] = set()
    supp_ctx_finding_ids: Set[str] = set()
    supp_ctx_pattern_ids: Set[str] = set()
    supp_ev_ids: Set[str] = set()

    if isinstance(steps, list):
        for step in steps:
            if isinstance(step, dict):
                for rid in step.get("supporting_regulatory_ids", []):
                    supp_reg_ids.add(rid)
                for fid in step.get("supporting_context_finding_ids", []):
                    supp_ctx_finding_ids.add(fid)
                for pid in step.get("supporting_context_pattern_ids", []):
                    supp_ctx_pattern_ids.add(pid)
                for eid in step.get("supporting_evidence_ids", []):
                    supp_ev_ids.add(eid)

    ds_summary = decision_support_report.get("summary", {})
    if not isinstance(ds_summary, dict):
        ds_summary = {}

    timestamp = _now_iso()
    disp_id = f"DSP-{uuid4().hex[:8].upper()}"
    audit_id = f"AUD-{uuid4().hex[:8].upper()}"

    # Construct Disposition Record
    disposition_record = {
        "disposition_id": disp_id,
        "case_id": clean_case_id,
        "primary_tx_id": primary_tx_id,
        "action_code": clean_action_code,
        "label": matched_opt.get("label", clean_action_code),
        "analyst_notes": clean_notes,
        "analyst_id": clean_analyst_id,
        "analyst_role": clean_analyst_role,
        "risk_acknowledged": risk_acknowledged,
        "previous_case_status": current_status,
        "new_case_status": target_status,
        "disposition_timestamp": timestamp
    }

    # Construct Audit Event Record
    audit_event = {
        "audit_id": audit_id,
        "event_type": "CASE_DISPOSITION_MUTATION",
        "timestamp": timestamp,
        "case_id": clean_case_id,
        "primary_tx_id": primary_tx_id,
        "analyst_id": clean_analyst_id,
        "analyst_role": clean_analyst_role,
        "action_code": clean_action_code,
        "previous_case_status": current_status,
        "new_case_status": target_status,
        "analyst_notes": clean_notes,
        "risk_acknowledged": risk_acknowledged,
        "decision_support_summary": {
            "review_priority": ds_summary.get("review_priority", "UNKNOWN"),
            "regulatory_severity": ds_summary.get("regulatory_severity", "UNKNOWN"),
            "heuristic_index": float(ds_summary.get("assessment_heuristic_index", 0.0))
        },
        "traceability_chain": {
            "supporting_regulatory_ids": sorted(list(supp_reg_ids)),
            "supporting_context_finding_ids": sorted(list(supp_ctx_finding_ids)),
            "supporting_context_pattern_ids": sorted(list(supp_ctx_pattern_ids)),
            "supporting_evidence_ids": sorted(list(supp_ev_ids))
        }
    }

    # ── ATOMIC STATEFUL MUTATION (Executed only after all checks pass) ──
    # 1. Update Case Object
    case_obj["status"] = target_status
    case_obj["last_disposition_id"] = disp_id
    case_obj["last_disposition_code"] = clean_action_code
    case_obj["last_disposition_timestamp"] = timestamp

    # 2. Append Disposition Record to data_store["dispositions"]
    if clean_case_id not in s["dispositions"]:
        s["dispositions"][clean_case_id] = []
    s["dispositions"][clean_case_id].append(disposition_record)

    # 3. Append Immutable Audit Event to data_store["audit_log"]
    s["audit_log"].append(audit_event)

    return {
        "ok": True,
        "status": "SUCCESS",
        "acknowledged": True,
        "case_id": clean_case_id,
        "previous_case_status": current_status,
        "new_case_status": target_status,
        "disposition": disposition_record,
        "audit_entry": audit_event,
        "message": f"Case '{clean_case_id}' successfully transitioned from '{current_status}' to '{target_status}'."
    }


def get_case_disposition_history(case_id: str, store: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Returns complete chronological list of disposition records for a given case.
    """
    from app.core.data_store import data_store

    s = store if store is not None else data_store
    disps = s.get("dispositions", {}).get(case_id, [])
    if isinstance(disps, list):
        return [dict(d) for d in disps]
    return []


def get_case_audit_history(case_id: str, store: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Returns complete chronological list of audit log entries for a given case.
    """
    from app.core.data_store import data_store

    s = store if store is not None else data_store
    audit_log = s.get("audit_log", [])
    if isinstance(audit_log, list):
        return [dict(a) for a in audit_log if isinstance(a, dict) and a.get("case_id") == case_id]
    return []
