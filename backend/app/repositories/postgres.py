"""
PostgreSQL Case Repository Implementation for SENTINEL (Phase 7).
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.models.case import Case
from app.models.disposition import Disposition
from app.models.audit_event import AuditEvent
from app.models.investigation_report import InvestigationReport
from app.repositories.base import AbstractCaseRepository


def _parse_iso(val: Any) -> Optional[datetime]:
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except Exception:
            return datetime.now(timezone.utc)
    return None


def _case_to_dict(c: Case) -> Dict[str, Any]:
    return {
        "case_id": c.case_id,
        "primary_tx_id": c.primary_tx_id,
        "status": c.status,
        "risk_level": c.risk_level,
        "golden_window_minutes": c.golden_window_minutes,
        "total_fraud_amount": float(c.total_fraud_amount or 0.0),
        "recoverable_amount": float(c.recoverable_amount or 0.0),
        "last_disposition_id": c.last_disposition_id,
        "last_disposition_code": c.last_disposition_code,
        "last_disposition_timestamp": c.last_disposition_timestamp.isoformat() if c.last_disposition_timestamp else None,
        "version": c.version,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None
    }


def _disposition_to_dict(d: Disposition) -> Dict[str, Any]:
    return {
        "disposition_id": d.disposition_id,
        "case_id": d.case_id,
        "primary_tx_id": d.primary_tx_id,
        "action_code": d.action_code,
        "label": d.label,
        "analyst_notes": d.analyst_notes,
        "analyst_id": d.analyst_id,
        "analyst_role": d.analyst_role,
        "risk_acknowledged": d.risk_acknowledged,
        "previous_case_status": d.previous_case_status,
        "new_case_status": d.new_case_status,
        "idempotency_key": d.idempotency_key,
        "disposition_timestamp": d.timestamp.isoformat() if d.timestamp else None
    }


def _audit_to_dict(a: AuditEvent) -> Dict[str, Any]:
    return {
        "audit_id": a.audit_id,
        "event_type": a.event_type,
        "timestamp": a.timestamp.isoformat() if a.timestamp else None,
        "case_id": a.case_id,
        "primary_tx_id": a.primary_tx_id,
        "analyst_id": a.analyst_id,
        "analyst_role": a.analyst_role,
        "action_code": a.action_code,
        "previous_case_status": a.previous_case_status,
        "new_case_status": a.new_case_status,
        "analyst_notes": a.analyst_notes,
        "risk_acknowledged": a.risk_acknowledged,
        "decision_support_summary": a.decision_support_summary or {},
        "traceability_chain": a.traceability_chain or {}
    }


class PostgreSQLCaseRepository(AbstractCaseRepository):
    """
    PostgreSQL persistence repository implementing pessimistic FOR UPDATE row locking,
    atomic multi-statement transactions, idempotency handling, and append-only audit tracking.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_case_by_id(self, case_id: str) -> Optional[Dict[str, Any]]:
        stmt = select(Case).filter(Case.case_id == case_id)
        res = await self.session.execute(stmt)
        case_obj = res.scalar_one_or_none()
        return _case_to_dict(case_obj) if case_obj else None

    async def get_case_for_update(self, case_id: str) -> Optional[Dict[str, Any]]:
        """
        Executes SELECT * FROM cases WHERE case_id = :case_id FOR UPDATE.
        Pessimistic row lock remains held on the session until commit/rollback.
        """
        stmt = select(Case).filter(Case.case_id == case_id).with_for_update()
        res = await self.session.execute(stmt)
        case_obj = res.scalar_one_or_none()
        return _case_to_dict(case_obj) if case_obj else None

    async def get_disposition_by_idempotency_key(self, idempotency_key: str) -> Optional[Dict[str, Any]]:
        if not idempotency_key:
            return None
        stmt = select(Disposition).filter(Disposition.idempotency_key == idempotency_key)
        res = await self.session.execute(stmt)
        disp_obj = res.scalar_one_or_none()
        return _disposition_to_dict(disp_obj) if disp_obj else None

    async def save_disposition_and_audit(
        self,
        case_id: str,
        new_status: str,
        disposition_record: Dict[str, Any],
        audit_event_record: Dict[str, Any]
    ) -> bool:
        """
        Atomically executes disposition INSERT, case status UPDATE, and audit_event INSERT.
        If any statement fails, exception propagates to cause transaction rollback.
        """
        try:
            # 1. Fetch case for update
            stmt = select(Case).filter(Case.case_id == case_id).with_for_update()
            res = await self.session.execute(stmt)
            case_obj = res.scalar_one_or_none()
            if not case_obj:
                return False

            ts_dt = _parse_iso(disposition_record.get("disposition_timestamp")) or datetime.now(timezone.utc)
            audit_ts_dt = _parse_iso(audit_event_record.get("timestamp")) or datetime.now(timezone.utc)

            # 2. Update case entity
            case_obj.status = new_status
            case_obj.last_disposition_id = disposition_record.get("disposition_id")
            case_obj.last_disposition_code = disposition_record.get("action_code")
            case_obj.last_disposition_timestamp = ts_dt
            case_obj.updated_at = datetime.now(timezone.utc)
            case_obj.version += 1

            # 3. Create Disposition entity
            disp_obj = Disposition(
                disposition_id=disposition_record.get("disposition_id"),
                case_id=case_id,
                primary_tx_id=disposition_record.get("primary_tx_id"),
                action_code=disposition_record.get("action_code"),
                label=disposition_record.get("label", disposition_record.get("action_code")),
                analyst_notes=disposition_record.get("analyst_notes", ""),
                analyst_id=disposition_record.get("analyst_id"),
                analyst_role=disposition_record.get("analyst_role"),
                risk_acknowledged=bool(disposition_record.get("risk_acknowledged", False)),
                previous_case_status=disposition_record.get("previous_case_status"),
                new_case_status=new_status,
                idempotency_key=disposition_record.get("idempotency_key"),
                timestamp=ts_dt
            )
            self.session.add(disp_obj)

            # 4. Create AuditEvent entity
            audit_obj = AuditEvent(
                audit_id=audit_event_record.get("audit_id"),
                event_type=audit_event_record.get("event_type", "CASE_DISPOSITION_MUTATION"),
                case_id=case_id,
                primary_tx_id=audit_event_record.get("primary_tx_id"),
                analyst_id=audit_event_record.get("analyst_id"),
                analyst_role=audit_event_record.get("analyst_role"),
                action_code=audit_event_record.get("action_code"),
                previous_case_status=audit_event_record.get("previous_case_status"),
                new_case_status=new_status,
                analyst_notes=audit_event_record.get("analyst_notes", ""),
                risk_acknowledged=bool(audit_event_record.get("risk_acknowledged", False)),
                decision_support_summary=audit_event_record.get("decision_support_summary", {}),
                traceability_chain=audit_event_record.get("traceability_chain", {}),
                timestamp=audit_ts_dt
            )
            self.session.add(audit_obj)

            await self.session.flush()
            return True
        except IntegrityError:
            await self.session.rollback()
            raise

    async def get_case_history(self, case_id: str) -> Dict[str, Any]:
        case_dict = await self.get_case_by_id(case_id)
        if not case_dict:
            return {
                "found": False,
                "case_id": case_id,
                "current_case_status": None,
                "disposition_history": [],
                "audit_history": []
            }

        # Chronological dispositions query
        disp_stmt = select(Disposition).filter(Disposition.case_id == case_id).order_by(
            Disposition.timestamp.asc(),
            Disposition.created_at.asc(),
            Disposition.disposition_id.asc()
        )
        disp_res = await self.session.execute(disp_stmt)
        dispositions = [_disposition_to_dict(d) for d in disp_res.scalars().all()]

        # Chronological audit events query
        audit_stmt = select(AuditEvent).filter(AuditEvent.case_id == case_id).order_by(
            AuditEvent.timestamp.asc(),
            AuditEvent.created_at.asc(),
            AuditEvent.audit_id.asc()
        )
        audit_res = await self.session.execute(audit_stmt)
        audit_log = [_audit_to_dict(a) for a in audit_res.scalars().all()]

        return {
            "found": True,
            "case_id": case_id,
            "current_case_status": case_dict["status"],
            "disposition_history": dispositions,
            "audit_history": audit_log
        }

    async def save_case(self, case_record: Dict[str, Any]) -> bool:
        created_dt = _parse_iso(case_record.get("created_at")) or datetime.now(timezone.utc)
        case_obj = Case(
            case_id=case_record["case_id"],
            primary_tx_id=case_record["primary_tx_id"],
            status=case_record.get("status", "NEW"),
            risk_level=case_record.get("risk_level", "LOW"),
            golden_window_minutes=int(case_record.get("golden_window_minutes", 30)),
            total_fraud_amount=float(case_record.get("total_fraud_amount", 0.0)),
            recoverable_amount=float(case_record.get("recoverable_amount", 0.0)),
            created_at=created_dt,
            updated_at=created_dt
        )
        self.session.add(case_obj)
        await self.session.flush()
        return True

    async def save_investigation_report(self, report_record: Dict[str, Any]) -> bool:
        created_dt = _parse_iso(report_record.get("created_at")) or datetime.now(timezone.utc)
        rpt_obj = InvestigationReport(
            report_id=report_record["report_id"],
            case_id=report_record["case_id"],
            report_type=report_record["report_type"],
            report_data=report_record["report_data"],
            created_at=created_dt
        )
        self.session.add(rpt_obj)
        await self.session.flush()
        return True
