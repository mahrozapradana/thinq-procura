from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from bson.decimal128 import Decimal128
from pymongo import MongoClient
from psycopg.types.json import Jsonb

from native_pg import apply_native_schema, native_pg_connection


def _mongo_client() -> MongoClient:
    return MongoClient(os.environ["MONGO_URL"])


def _mongo_db_name() -> str:
    return os.environ["DB_NAME"]


def _to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not value:
        return datetime.now(timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _to_decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    if isinstance(value, Decimal128):
        return value.to_decimal()
    return Decimal(str(value))


def _payload(doc: dict[str, Any]) -> Jsonb:
    return Jsonb({k: v for k, v in doc.items() if k != "_id"})


def _uuid_or_none(value: Any) -> Any:
    return str(value) if value not in (None, "") else None


def _sync_cursor(doc: dict[str, Any]) -> datetime:
    return _to_datetime(doc.get("updated_at") or doc.get("created_at"))


SYNC_SPECS: list[dict[str, Any]] = [
    {"source": "users", "table": "users", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "email": d["email"], "name": d.get("name") or d["email"], "role": d.get("role") or "user", "status": d.get("status") or "active", "vendor_id": _uuid_or_none(d.get("vendor_id")), "delegated_to": _uuid_or_none(d.get("delegated_to")), "delegated_until": _to_datetime(d["delegated_until"]) if d.get("delegated_until") else None, "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "vendors", "table": "vendors", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "email": d.get("email"), "code": d.get("code"), "company_name": d.get("company_name") or d.get("name") or d["id"], "status": d.get("status") or "pending", "is_blacklisted": bool(d.get("is_blacklisted") or False), "avg_rating": d.get("avg_rating"), "ratings_count": int(d.get("ratings_count") or 0), "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "departments", "table": "departments", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "name": d.get("name") or d["id"], "payload": _payload(d)}},
    {"source": "categories", "table": "categories", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "name": d.get("name") or d["id"], "payload": _payload(d)}},
    {"source": "hs_codes", "table": "hs_codes", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "code": d.get("code") or d["id"], "description": d.get("description"), "payload": _payload(d)}},
    {"source": "products", "table": "products", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "code": d.get("code"), "name": d.get("name") or d["id"], "category_id": _uuid_or_none(d.get("category_id")), "unit": d.get("unit"), "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "vendor_pricelists", "table": "vendor_pricelists", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "vendor_id": d["vendor_id"], "product_id": d["product_id"], "verified": bool(d.get("verified") or False), "price": _to_decimal(d.get("price")), "currency": d.get("currency") or "IDR", "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "approval_workflows", "table": "approval_workflows", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "name": d.get("name") or d["id"], "applies_to": d.get("applies_to") or "UNKNOWN", "department_id": _uuid_or_none(d.get("department_id")), "created_at": _to_datetime(d.get("created_at")), "payload": _payload(d)}},
    {"source": "budgets", "table": "budgets", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "department_id": d["department_id"], "product_id": _uuid_or_none(d.get("product_id")), "period": str(d.get("period") or ""), "status": d.get("status") or "draft", "amount": _to_decimal(d.get("amount")), "used_amount": _to_decimal(d.get("used_amount")), "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "warehouses", "table": "warehouses", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "name": d.get("name") or d["id"], "is_bonded": bool(d.get("is_bonded") or False), "payload": _payload(d)}},
    {"source": "locations", "table": "locations", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "warehouse_id": d["warehouse_id"], "name": d.get("name") or d["id"], "is_bonded_zone": bool(d.get("is_bonded_zone") or False), "payload": _payload(d)}},
    {"source": "taxes", "table": "taxes", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "code": d.get("code") or d["id"], "name": d.get("name") or d.get("code") or d["id"], "tax_type": d.get("tax_type") or "sales", "rate": _to_decimal(d.get("rate")), "payload": _payload(d)}},
    {"source": "company_settings", "table": "company_settings", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "payload": _payload(d), "updated_at": _to_datetime(d.get("updated_at") or d.get("created_at")) if d.get("updated_at") or d.get("created_at") else None}},
    {"source": "odoo_settings", "table": "odoo_settings", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "payload": _payload(d), "updated_at": _to_datetime(d.get("updated_at") or d.get("created_at")) if d.get("updated_at") or d.get("created_at") else None}},
    {"source": "notification_settings", "table": "notification_settings", "conflict": ["id"], "columns": lambda d: {"id": d["id"], "payload": _payload(d), "updated_at": _to_datetime(d.get("updated_at") or d.get("created_at")) if d.get("updated_at") or d.get("created_at") else None}},
    {"source": "prs", "table": "prs", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d["id"], "pr_number": d["pr_number"], "department_id": d["department_id"], "requester_id": d["requester_id"], "status": d.get("status") or "draft", "preferred_vendor_id": _uuid_or_none(d.get("preferred_vendor_id")), "total": _to_decimal(d.get("total")), "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "pos", "table": "pos", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d["id"], "po_number": d["po_number"], "vendor_id": d["vendor_id"], "assigned_pic_id": _uuid_or_none(d.get("assigned_pic_id")), "created_by": _uuid_or_none(d.get("created_by")), "po_type": d.get("po_type") or "LOCAL", "status": d.get("status") or "draft", "shipping_status": d.get("shipping_status") or "pending", "invoice_status": d.get("invoice_status") or "pending", "amount_total": _to_decimal(d.get("amount_total") or d.get("total")), "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "tenders", "table": "tenders", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d["id"], "tender_number": d["tender_number"], "created_by": _uuid_or_none(d.get("created_by")), "status": d.get("status") or "draft", "awarded_vendor_id": _uuid_or_none(d.get("awarded_vendor_id")), "deadline": _to_datetime(d["deadline"]) if d.get("deadline") else None, "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "goods_receipts", "table": "goods_receipts", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d["id"], "receipt_number": d["receipt_number"], "po_id": d["po_id"], "warehouse_id": _uuid_or_none(d.get("warehouse_id")), "location_id": _uuid_or_none(d.get("location_id")), "customs_doc_id": _uuid_or_none(d.get("customs_doc_id")), "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "goods_returns", "table": "goods_returns", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d["id"], "return_number": d["return_number"], "receipt_id": d["receipt_id"], "reason": d.get("reason"), "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "customs_docs", "table": "customs_docs", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d["id"], "doc_number": d.get("doc_number") or d["id"], "po_id": _uuid_or_none(d.get("po_id")), "vendor_id": _uuid_or_none(d.get("vendor_id")), "status": d.get("status") or "draft", "bc_type": d.get("bc_type"), "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "invoices", "table": "invoices", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d["id"], "invoice_number": d["invoice_number"], "po_id": d["po_id"], "vendor_id": d["vendor_id"], "status": d.get("status") or "outstanding", "due_date": _to_datetime(d["due_date"]) if d.get("due_date") else None, "amount": _to_decimal(d.get("amount")), "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "shipments", "table": "shipments", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d["id"], "shipment_number": d["shipment_number"], "po_id": d["po_id"], "vendor_id": d["vendor_id"], "status": d.get("status") or "in_transit", "tracking_number": d.get("tracking_number"), "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "ls_documents", "table": "ls_documents", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d["id"], "vendor_id": d["vendor_id"], "po_id": _uuid_or_none(d.get("po_id")), "reference_number": d.get("reference_number") or d["id"], "status": d.get("status") or "submitted", "created_at": _to_datetime(d.get("created_at")), "updated_at": _to_datetime(d["updated_at"]) if d.get("updated_at") else None, "payload": _payload(d)}},
    {"source": "notifications", "table": "notifications", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d["id"], "user_id": d["user_id"], "type": d.get("type"), "is_read": bool(d.get("is_read") or False), "created_at": _to_datetime(d.get("created_at")), "read_at": _to_datetime(d["read_at"]) if d.get("read_at") else None, "payload": _payload(d)}},
    {"source": "po_messages", "table": "po_messages", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d["id"], "po_id": d["po_id"], "sender_id": _uuid_or_none(d.get("sender_id") or d.get("created_by")), "created_at": _to_datetime(d.get("created_at")), "payload": _payload(d)}},
    {"source": "bc_audit", "table": "bc_audit", "conflict": ["id", "created_at"], "columns": lambda d: {"id": d.get("id") or d["customs_doc_id"], "customs_doc_id": d["customs_doc_id"], "action": d.get("action") or "unknown", "created_at": _to_datetime(d.get("created_at")), "payload": _payload(d)}},
]


def _upsert_sql(table_name: str, columns: list[str], conflict_columns: list[str]) -> str:
    insert_columns = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    update_columns = ", ".join([f"{column} = EXCLUDED.{column}" for column in columns if column not in conflict_columns])
    return f"INSERT INTO native_app.{table_name} ({insert_columns}) VALUES ({placeholders}) ON CONFLICT ({', '.join(conflict_columns)}) DO UPDATE SET {update_columns}"


def _load_sync_state(collection_name: str) -> datetime | None:
    with native_pg_connection() as conn:
        row = conn.execute(
            "SELECT last_cursor FROM native_app.sync_state WHERE collection_name = %s",
            (collection_name,),
        ).fetchone()
    return row["last_cursor"] if row else None


def _save_sync_state(collection_name: str, *, last_cursor: datetime | None, rows_synced: int, mode: str) -> None:
    with native_pg_connection() as conn:
        conn.execute(
            """
            INSERT INTO native_app.sync_state (collection_name, last_cursor, last_run_at, rows_synced, mode)
            VALUES (%s, %s, now(), %s, %s)
            ON CONFLICT (collection_name) DO UPDATE SET
                last_cursor = EXCLUDED.last_cursor,
                last_run_at = EXCLUDED.last_run_at,
                rows_synced = EXCLUDED.rows_synced,
                mode = EXCLUDED.mode
            """,
            (collection_name, last_cursor, rows_synced, mode),
        )
        conn.commit()


def sync_collection(spec: dict[str, Any], limit: int | None = None, incremental: bool = False) -> int:
    client = _mongo_client()
    try:
        query: dict[str, Any] = {}
        if incremental:
            last_cursor = _load_sync_state(spec["source"])
            if last_cursor is not None:
                last_cursor_iso = last_cursor.isoformat()
                query = {
                    "$or": [
                        {"updated_at": {"$gte": last_cursor_iso}},
                        {"created_at": {"$gte": last_cursor_iso}},
                    ]
                }
        docs = list(client[_mongo_db_name()][spec["source"]].find(query, {"_id": 0}).sort("created_at", 1))
        if limit is not None:
            docs = docs[:limit]
        if not docs:
            if incremental:
                _save_sync_state(spec["source"], last_cursor=_load_sync_state(spec["source"]), rows_synced=0, mode="incremental")
            return 0
        rows = [spec["columns"](doc) for doc in docs]
        sql = _upsert_sql(spec["table"], list(rows[0].keys()), spec["conflict"])
        with native_pg_connection() as conn:
            with conn.cursor() as cur:
                for row in rows:
                    cur.execute(sql, list(row.values()))
            conn.commit()
        _save_sync_state(
            spec["source"],
            last_cursor=max(_sync_cursor(doc) for doc in docs),
            rows_synced=len(rows),
            mode="incremental" if incremental else "full",
        )
        return len(rows)
    finally:
        client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync FerretDB collections into native PostgreSQL schema")
    parser.add_argument("--collection", action="append", help="Specific source collection(s) to sync")
    parser.add_argument("--limit", type=int, default=None, help="Limit rows per collection")
    parser.add_argument("--skip-ddl", action="store_true", help="Skip DDL bootstrap")
    parser.add_argument("--incremental", action="store_true", help="Sync only rows with created_at/updated_at >= last watermark")
    args = parser.parse_args()

    if not args.skip_ddl:
        apply_native_schema()

    wanted = set(args.collection or [])
    specs = [spec for spec in SYNC_SPECS if not wanted or spec["source"] in wanted]
    total = 0
    for spec in specs:
        count = sync_collection(spec, limit=args.limit, incremental=args.incremental)
        print(f"synced {count:>5} rows :: {spec['source']} -> native_app.{spec['table']}")
        total += count
    print(f"done :: total rows processed = {total}")


if __name__ == "__main__":
    main()