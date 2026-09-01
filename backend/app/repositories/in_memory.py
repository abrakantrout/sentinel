"""
In-Memory Case Repository Implementation for SENTINEL (Phase 7).

Satisfies AbstractCaseRepository contract for fast unit testing and dependency injection
without requiring a running PostgreSQL server.
"""

import copy
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from app.repositories.base import AbstractCaseRepository


class InMemoryCaseRepository(AbstractCaseRepository):
    """
    In-Memory persistence implementation satisfying the AbstractCaseRepository contract.
    """

    def __init__(self, store: Optional[Dict[str, Any]] = None):
        self._cases: Dict[str, Dict[str, Any]] = {}
        self._dispositions: Dict[str, List[Dict[str, Any]]] = {}
        self._audit_log: List[Dict[str, Any]] = []
        self._idempotency_index: Dict[str, Dict[str, Any]] = {}
        self._locked_cases: set = set()

        if store is not None:
            self._cases = store.setdefault("cases", {})
            self._dispositions = store.setdefault("dispositions", {})
            self._audit_log = store.setdefault("audit_log", [])

    async def get_case_by_id(self, case_id: str) -> Optional[Dict[str, Any]]:
        case = self._cases.get(case_id)
        return copy.deepcopy(case) if case else None

    async def get_case_for_update(self, case_id: str) -> Optional[Dict[str, Any]]:
        """Simulates pessimistic FOR UPDATE lock by checking case existence."""
        case = self._cases.get(case_id)
        if not case:
            return None
        self._locked_cases.add(case_id)
        return copy.deepcopy(case)

    async def get_disposition_by_idempotency_key(self, idempotency_key: str) -> Optional[Dict[str, Any]]:
        if not idempotency_key:
            return None
        disp = self._idempotency_index.get(idempotency_key)
        return copy.deepcopy(disp) if disp else None

    async def save_disposition_and_audit(
        self,
        case_id: str,
        new_status: str,
        disposition_record: Dict[str, Any],
        audit_event_record: Dict[str, Any]
    ) -> bool:
        case = self._cases.get(case_id)
        if not case:
            return False

        idempotency_key = disposition_record.get("idempotency_key")
        if idempotency_key and idempotency_key in self._idempotency_index:
            raise ValueError(f"Duplicate idempotency_key '{idempotency_key}'")

        # 1. Update Case
        case["status"] = new_status
        case["last_disposition_id"] = disposition_record.get("disposition_id")
        case["last_disposition_code"] = disposition_record.get("action_code")
        case["last_disposition_timestamp"] = disposition_record.get("disposition_timestamp")
        case["version"] = case.get("version", 1) + 1

        # 2. Add Disposition
        disp = copy.deepcopy(disposition_record)
        if case_id not in self._dispositions:
            self._dispositions[case_id] = []
        self._dispositions[case_id].append(disp)

        if idempotency_key:
            self._idempotency_index[idempotency_key] = disp

        # 3. Add Audit Event
        audit = copy.deepcopy(audit_event_record)
        self._audit_log.append(audit)

        if case_id in self._locked_cases:
            self._locked_cases.remove(case_id)

        return True

    async def get_case_history(self, case_id: str) -> Dict[str, Any]:
        case = self._cases.get(case_id)
        if not case:
            return {
                "found": False,
                "case_id": case_id,
                "current_case_status": None,
                "disposition_history": [],
                "audit_history": []
            }

        disps = copy.deepcopy(self._dispositions.get(case_id, []))
        audits = [copy.deepcopy(a) for a in self._audit_log if a.get("case_id") == case_id]

        # Chronological sorting
        disps.sort(key=lambda x: (x.get("disposition_timestamp", ""), x.get("disposition_id", "")))
        audits.sort(key=lambda x: (x.get("timestamp", ""), x.get("audit_id", "")))

        return {
            "found": True,
            "case_id": case_id,
            "current_case_status": case["status"],
            "disposition_history": disps,
            "audit_history": audits
        }

    async def save_case(self, case_record: Dict[str, Any]) -> bool:
        self._cases[case_record["case_id"]] = copy.deepcopy(case_record)
        return True

    async def save_investigation_report(self, report_record: Dict[str, Any]) -> bool:
        # In-memory report index simulated
        return True
