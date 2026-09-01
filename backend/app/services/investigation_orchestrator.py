"""
Investigation Orchestrator Service for SENTINEL (Phase 9).

Coordinates the end-to-end automated investigation pipeline asynchronously across dependency-ordered analytical stages:
1. Evidence Collection Agent (EVIDENCE)
2. Contextual Investigation Agent (CONTEXTUAL)
3. Regulatory Risk Assessment Agent (REGULATORY)
4. Analyst Decision Support Agent (DECISION_SUPPORT)
5. Audit Explanation Agent (AUDIT_EXPLANATION)

Features:
- Asynchronous execution with explicit stage input/output contracts.
- Granular stage metrics (status, start_time, completion_time, error).
- Deterministic investigation status: PENDING -> RUNNING -> COMPLETED / DEGRADED / FAILED.
- Strict deduplication / idempotency per case_id.
- Real-time status broadcasting over WebSockets.
- Complete persistence to PostgreSQL via AbstractCaseRepository interface.
- Zero autonomous financial execution (preserves human analyst disposition authority).
"""

import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from uuid import uuid4

from app.repositories.base import AbstractCaseRepository
from app.services.evidence_agent import collect_evidence_for_case
from app.services.contextual_agent import investigate_context
from app.services.regulatory_agent import assess_regulatory_risk
from app.services.audit_explanation_agent import generate_audit_explanation
from app.services.analyst_agent import generate_analyst_decision_support


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class InvestigationOrchestrator:
    """
    Asynchronous End-to-End Investigation Pipeline Orchestrator.
    """

    def __init__(self, broadcast_manager: Optional[Any] = None):
        self.broadcast_manager = broadcast_manager
        self._active_investigations: Dict[str, Dict[str, Any]] = {}

    async def _emit_event(self, event_type: str, payload: Dict[str, Any]) -> None:
        """Emits real-time status event to connected WebSocket clients if manager is available."""
        if not self.broadcast_manager:
            return
        event = {"event": event_type, **payload}
        try:
            await self.broadcast_manager.broadcast(event)
        except Exception as e:
            # Socket emission failures do not disrupt pipeline execution
            print(f"[Orchestrator WS] Broadcast warning: {e}")

    async def run_investigation(
        self,
        case_id: str,
        repo: AbstractCaseRepository,
        store: Optional[Dict[str, Any]] = None,
        force_rerun: bool = False
    ) -> Dict[str, Any]:
        """
        Executes the 5-stage automated investigation lifecycle for a given case_id.
        """
        # 1. Check active in-memory deduplication registry
        if not force_rerun and case_id in self._active_investigations:
            existing = self._active_investigations[case_id]
            if existing.get("status") in ("RUNNING", "COMPLETED"):
                return existing

        # 2. Check persistent repository for completed investigation report
        if not force_rerun:
            try:
                existing_rpt = await repo.get_investigation_report(case_id, "DECISION_SUPPORT")
                if existing_rpt and existing_rpt.get("report_data"):
                    r_data = existing_rpt["report_data"]
                    if isinstance(r_data, dict) and r_data.get("investigation_id"):
                        self._active_investigations[case_id] = r_data
                        return r_data
            except Exception:
                pass

        inv_id = f"INV-{case_id}-{uuid4().hex[:8]}"

        record: Dict[str, Any] = {
            "investigation_id": inv_id,
            "case_id": case_id,
            "status": "RUNNING",
            "started_at": _now_iso(),
            "completed_at": None,
            "stages": {
                "EVIDENCE": {"status": "PENDING", "started_at": None, "completed_at": None, "error": None, "output": None},
                "CONTEXTUAL": {"status": "PENDING", "started_at": None, "completed_at": None, "error": None, "output": None},
                "REGULATORY": {"status": "PENDING", "started_at": None, "completed_at": None, "error": None, "output": None},
                "DECISION_SUPPORT": {"status": "PENDING", "started_at": None, "completed_at": None, "error": None, "output": None},
                "AUDIT_EXPLANATION": {"status": "PENDING", "started_at": None, "completed_at": None, "error": None, "output": None},
            },
            "summary": {
                "review_priority": "UNKNOWN",
                "regulatory_severity": "UNKNOWN",
                "recommended_action": "NO_RECOMMENDATION",
                "degraded_reasons": []
            }
        }

        self._active_investigations[case_id] = record
        await self._emit_event("investigation.started", {"case_id": case_id, "investigation_id": inv_id})

        # Retrieve case metadata from repository or store
        case_record = await repo.get_case_by_id(case_id)
        if not case_record and store:
            case_record = store.get("cases", {}).get(case_id)
            if case_record:
                try:
                    await repo.save_case(case_record)
                except Exception:
                    pass


        evidence_pkg: Optional[Dict[str, Any]] = None
        contextual_rpt: Optional[Dict[str, Any]] = None
        regulatory_rpt: Optional[Dict[str, Any]] = None
        decision_support_rpt: Optional[Dict[str, Any]] = None
        audit_explanation_rpt: Optional[Dict[str, Any]] = None
        is_degraded = False

        # ── STAGE 1: EVIDENCE COLLECTION ──────────────────────────────────────
        stg_ev = record["stages"]["EVIDENCE"]
        stg_ev["status"] = "RUNNING"
        stg_ev["started_at"] = _now_iso()
        await self._emit_event("investigation.stage.started", {"case_id": case_id, "stage": "EVIDENCE"})

        try:
            evidence_pkg = collect_evidence_for_case(case_id, store=store)
            stg_ev["status"] = "COMPLETED"
            stg_ev["completed_at"] = _now_iso()
            stg_ev["output"] = evidence_pkg
            await self._emit_event("investigation.stage.completed", {"case_id": case_id, "stage": "EVIDENCE"})
            await repo.save_investigation_report({
                "report_id": f"RPT-EVD-{case_id}",
                "case_id": case_id,
                "report_type": "EVIDENCE",
                "report_data": evidence_pkg,
                "created_at": stg_ev["completed_at"]
            })
        except Exception as e:
            stg_ev["status"] = "FAILED"
            stg_ev["completed_at"] = _now_iso()
            stg_ev["error"] = str(e)
            record["status"] = "FAILED"
            record["summary"]["degraded_reasons"].append(f"EVIDENCE_STAGE_FAILED: {e}")
            await self._emit_event("investigation.stage.failed", {"case_id": case_id, "stage": "EVIDENCE", "error": str(e)})
            return record

        # ── STAGE 2: CONTEXTUAL INVESTIGATION ─────────────────────────────────
        stg_ctx = record["stages"]["CONTEXTUAL"]
        stg_ctx["status"] = "RUNNING"
        stg_ctx["started_at"] = _now_iso()
        await self._emit_event("investigation.stage.started", {"case_id": case_id, "stage": "CONTEXTUAL"})

        try:
            contextual_rpt = investigate_context(evidence_pkg)
            stg_ctx["status"] = "COMPLETED"
            stg_ctx["completed_at"] = _now_iso()
            stg_ctx["output"] = contextual_rpt
            await self._emit_event("investigation.stage.completed", {"case_id": case_id, "stage": "CONTEXTUAL"})
            await repo.save_investigation_report({
                "report_id": f"RPT-CTX-{case_id}",
                "case_id": case_id,
                "report_type": "CONTEXTUAL",
                "report_data": contextual_rpt,
                "created_at": stg_ctx["completed_at"]
            })
        except Exception as e:
            stg_ctx["status"] = "FAILED"
            stg_ctx["completed_at"] = _now_iso()
            stg_ctx["error"] = str(e)
            is_degraded = True
            record["summary"]["degraded_reasons"].append(f"CONTEXTUAL_STAGE_FAILED: {e}")
            await self._emit_event("investigation.stage.failed", {"case_id": case_id, "stage": "CONTEXTUAL", "error": str(e)})

        # ── STAGE 3: REGULATORY RISK ASSESSMENT ──────────────────────────────
        stg_reg = record["stages"]["REGULATORY"]
        stg_reg["status"] = "RUNNING"
        stg_reg["started_at"] = _now_iso()
        await self._emit_event("investigation.stage.started", {"case_id": case_id, "stage": "REGULATORY"})

        try:
            regulatory_rpt = assess_regulatory_risk(evidence_pkg, contextual_rpt)
            stg_reg["status"] = "COMPLETED"
            stg_reg["completed_at"] = _now_iso()
            stg_reg["output"] = regulatory_rpt
            await self._emit_event("investigation.stage.completed", {"case_id": case_id, "stage": "REGULATORY"})
            await repo.save_investigation_report({
                "report_id": f"RPT-REG-{case_id}",
                "case_id": case_id,
                "report_type": "REGULATORY",
                "report_data": regulatory_rpt,
                "created_at": stg_reg["completed_at"]
            })
        except Exception as e:
            stg_reg["status"] = "FAILED"
            stg_reg["completed_at"] = _now_iso()
            stg_reg["error"] = str(e)
            is_degraded = True
            record["summary"]["degraded_reasons"].append(f"REGULATORY_STAGE_FAILED: {e}")
            await self._emit_event("investigation.stage.failed", {"case_id": case_id, "stage": "REGULATORY", "error": str(e)})

        # ── STAGE 4: AUDIT EXPLANATION ────────────────────────────────────────
        stg_aud = record["stages"]["AUDIT_EXPLANATION"]
        stg_aud["status"] = "RUNNING"
        stg_aud["started_at"] = _now_iso()
        await self._emit_event("investigation.stage.started", {"case_id": case_id, "stage": "AUDIT_EXPLANATION"})

        try:
            audit_explanation_rpt = generate_audit_explanation(
                evidence_package=evidence_pkg,
                contextual_report=contextual_rpt,
                regulatory_assessment=regulatory_rpt
            )

            stg_aud["status"] = "COMPLETED"
            stg_aud["completed_at"] = _now_iso()
            stg_aud["output"] = audit_explanation_rpt
            await self._emit_event("investigation.stage.completed", {"case_id": case_id, "stage": "AUDIT_EXPLANATION"})
            await repo.save_investigation_report({
                "report_id": f"RPT-AUD-{case_id}",
                "case_id": case_id,
                "report_type": "AUDIT_EXPLANATION",
                "report_data": audit_explanation_rpt,
                "created_at": stg_aud["completed_at"]
            })
        except Exception as e:
            stg_aud["status"] = "FAILED"
            stg_aud["completed_at"] = _now_iso()
            stg_aud["error"] = str(e)
            is_degraded = True
            record["summary"]["degraded_reasons"].append(f"AUDIT_EXPLANATION_STAGE_FAILED: {e}")
            await self._emit_event("investigation.stage.failed", {"case_id": case_id, "stage": "AUDIT_EXPLANATION", "error": str(e)})

        # ── STAGE 5: ANALYST DECISION SUPPORT ────────────────────────────────
        stg_ds = record["stages"]["DECISION_SUPPORT"]
        stg_ds["status"] = "RUNNING"
        stg_ds["started_at"] = _now_iso()
        await self._emit_event("investigation.stage.started", {"case_id": case_id, "stage": "DECISION_SUPPORT"})

        try:
            decision_support_rpt = generate_analyst_decision_support(
                evidence_package=evidence_pkg,
                contextual_report=contextual_rpt,
                regulatory_assessment=regulatory_rpt,
                audit_explanation=audit_explanation_rpt,
                case_context=case_record
            )
            stg_ds["status"] = "COMPLETED"
            stg_ds["completed_at"] = _now_iso()
            stg_ds["output"] = decision_support_rpt
            await self._emit_event("investigation.stage.completed", {"case_id": case_id, "stage": "DECISION_SUPPORT"})
            await repo.save_investigation_report({
                "report_id": f"RPT-DS-{case_id}",
                "case_id": case_id,
                "report_type": "DECISION_SUPPORT",
                "report_data": decision_support_rpt,
                "created_at": stg_ds["completed_at"]
            })
        except Exception as e:
            stg_ds["status"] = "FAILED"
            stg_ds["completed_at"] = _now_iso()
            stg_ds["error"] = str(e)
            is_degraded = True
            record["summary"]["degraded_reasons"].append(f"DECISION_SUPPORT_STAGE_FAILED: {e}")
            await self._emit_event("investigation.stage.failed", {"case_id": case_id, "stage": "DECISION_SUPPORT", "error": str(e)})


        # ── FINALIZATION ──────────────────────────────────────────────────────
        record["completed_at"] = _now_iso()
        if is_degraded:
            record["status"] = "DEGRADED"
        else:
            record["status"] = "COMPLETED"

        # Populate high-level investigation summary
        if decision_support_rpt and isinstance(decision_support_rpt, dict):
            ds_sum = decision_support_rpt.get("summary", {})
            record["summary"]["review_priority"] = ds_sum.get("review_priority", "UNKNOWN")
            record["summary"]["regulatory_severity"] = ds_sum.get("regulatory_severity", "UNKNOWN")
            recommendations = decision_support_rpt.get("recommendations", [])
            if recommendations and isinstance(recommendations, list):
                rec_action = recommendations[0].get("action_code") if isinstance(recommendations[0], dict) else "NO_RECOMMENDATION"
                record["summary"]["recommended_action"] = rec_action

        # Broadcast overall completion / degradation event
        if record["status"] == "COMPLETED":
            await self._emit_event("investigation.completed", {
                "case_id": case_id,
                "investigation_id": inv_id,
                "summary": record["summary"]
            })
        else:
            await self._emit_event("investigation.degraded", {
                "case_id": case_id,
                "investigation_id": inv_id,
                "reasons": record["summary"]["degraded_reasons"]
            })

        return record


# Global default instance
investigation_orchestrator = InvestigationOrchestrator()
