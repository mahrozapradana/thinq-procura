"""Shared DB and Pydantic models for e-procurement app."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorClient

_client: Optional[AsyncIOMotorClient] = None
_db = None


def get_db():
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        _db = _client[os.environ["DB_NAME"]]
    return _db


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean(doc: dict) -> dict:
    """Remove Mongo _id from a doc."""
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


def gen_number(prefix: str) -> str:
    """Generate a human-readable number like PR-20260214-XXXX."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"{prefix}-{ts}-{uuid.uuid4().hex[:5].upper()}"


ROLES = [
    "admin",
    "procurement",
    "requester",
    "approver",
    "warehouse",
    "finance",
    "vendor",
]

PR_STATUS = ["draft", "pending_approval", "approved", "rejected", "converted_to_po"]
PO_STATUS = ["draft", "pending_approval", "approved", "sent", "partial", "completed", "cancelled"]
TENDER_STATUS = ["draft", "open", "closed", "awarded"]
BUDGET_STATUS = ["draft", "pending_approval", "approved", "rejected"]
