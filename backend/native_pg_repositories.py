from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from psycopg.types.json import Jsonb

from native_pg import native_pg_connection

STATUS_EQ = "status = %s"
VENDOR_ID_EQ = "vendor_id = %s"


class BaseNativeRepository:
    table_name: str = ""
    id_column: str = "id"
    default_order_by: str = "created_at DESC"

    def __init__(self, schema: str = "native_app"):
        self.schema = schema

    @property
    def qualified_table(self) -> str:
        return f"{self.schema}.{self.table_name}"

    def get_by_id(self, doc_id: str) -> Optional[dict[str, Any]]:
        sql = f"""
            SELECT *
            FROM {self.qualified_table}
            WHERE {self.id_column} = %s
            ORDER BY {self.default_order_by}
            LIMIT 1
        """
        with native_pg_connection() as conn:
            return conn.execute(sql, (doc_id,)).fetchone()
    
    @staticmethod
    def hydrate_payload(row: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
        if row is None:
            return None
        payload = dict(row.get("payload") or {})
        payload.update({k: v for k, v in row.items() if k != "payload"})
        return payload

    def upsert_row(self, conflict_columns: list[str], row: dict[str, Any]) -> None:
        columns = list(row.keys())
        placeholders = ", ".join(["%s"] * len(columns))
        insert_columns = ", ".join(columns)
        update_columns = ", ".join([f"{col} = EXCLUDED.{col}" for col in columns if col not in conflict_columns])
        sql = f"""
            INSERT INTO {self.qualified_table} ({insert_columns})
            VALUES ({placeholders})
            ON CONFLICT ({', '.join(conflict_columns)}) DO UPDATE SET {update_columns}
        """
        values = [Jsonb(value) if key == "payload" else value for key, value in row.items()]
        with native_pg_connection() as conn:
            conn.execute(sql, values)
            conn.commit()


class PRNativeRepository(BaseNativeRepository):
    table_name = "prs"

    def list_page(self, *, requester_id: Optional[str] = None, status: Optional[str] = None, department_id: Optional[str] = None, page: int = 1, page_size: int = 20, search: Optional[str] = None) -> dict[str, Any]:
        filters: list[str] = []
        params: list[Any] = []
        if requester_id:
            filters.append("requester_id = %s")
            params.append(requester_id)
        if status:
            filters.append(STATUS_EQ)
            params.append(status)
        if department_id:
            filters.append("department_id = %s")
            params.append(department_id)
        if search:
            filters.append("(pr_number ILIKE %s OR payload->>'requester_name' ILIKE %s OR payload->>'notes' ILIKE %s)")
            needle = f"%{search}%"
            params.extend([needle, needle, needle])
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        offset = (page - 1) * page_size
        with native_pg_connection() as conn:
            total = conn.execute(f"SELECT count(*) AS total FROM {self.qualified_table} {where}", params).fetchone()["total"]
            rows = conn.execute(f"SELECT * FROM {self.qualified_table} {where} ORDER BY created_at DESC LIMIT %s OFFSET %s", [*params, page_size, offset]).fetchall()
        return {"items": [self.hydrate_payload(row) for row in rows], "total": total, "page": page, "page_size": page_size, "pages": (total + page_size - 1) // page_size}


class PONativeRepository(BaseNativeRepository):
    table_name = "pos"

    def list_page(self, *, vendor_id: Optional[str] = None, assigned_pic_id: Optional[str] = None, status: Optional[str] = None, po_type: Optional[str] = None, page: int = 1, page_size: int = 20, search: Optional[str] = None) -> dict[str, Any]:
        filters: list[str] = []
        params: list[Any] = []
        if vendor_id:
            filters.append(VENDOR_ID_EQ)
            params.append(vendor_id)
        if assigned_pic_id:
            filters.append("assigned_pic_id = %s")
            params.append(assigned_pic_id)
        if status:
            filters.append(STATUS_EQ)
            params.append(status)
        if po_type:
            filters.append("po_type = %s")
            params.append(po_type)
        if search:
            filters.append("(po_number ILIKE %s OR payload->>'notes' ILIKE %s)")
            needle = f"%{search}%"
            params.extend([needle, needle])
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        offset = (page - 1) * page_size
        with native_pg_connection() as conn:
            total = conn.execute(f"SELECT count(*) AS total FROM {self.qualified_table} {where}", params).fetchone()["total"]
            rows = conn.execute(f"SELECT * FROM {self.qualified_table} {where} ORDER BY created_at DESC LIMIT %s OFFSET %s", [*params, page_size, offset]).fetchall()
        return {"items": [self.hydrate_payload(row) for row in rows], "total": total, "page": page, "page_size": page_size, "pages": (total + page_size - 1) // page_size}


class InvoiceNativeRepository(BaseNativeRepository):
    table_name = "invoices"

    def list_by_vendor(self, vendor_id: str, *, status: Optional[str] = None, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        filters = [VENDOR_ID_EQ]
        params: list[Any] = [vendor_id]
        if status:
            filters.append(STATUS_EQ)
            params.append(status)
        where = f"WHERE {' AND '.join(filters)}"
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        offset = (page - 1) * page_size
        with native_pg_connection() as conn:
            total = conn.execute(f"SELECT count(*) AS total FROM {self.qualified_table} {where}", params).fetchone()["total"]
            rows = conn.execute(f"SELECT * FROM {self.qualified_table} {where} ORDER BY created_at DESC LIMIT %s OFFSET %s", [*params, page_size, offset]).fetchall()
        return {"items": [self.hydrate_payload(row) for row in rows], "total": total, "page": page, "page_size": page_size, "pages": (total + page_size - 1) // page_size}


class ShipmentNativeRepository(BaseNativeRepository):
    table_name = "shipments"

    def list_by_vendor(self, vendor_id: str, *, status: Optional[str] = None, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        filters = [VENDOR_ID_EQ]
        params: list[Any] = [vendor_id]
        if status:
            filters.append(STATUS_EQ)
            params.append(status)
        where = f"WHERE {' AND '.join(filters)}"
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        offset = (page - 1) * page_size
        with native_pg_connection() as conn:
            total = conn.execute(f"SELECT count(*) AS total FROM {self.qualified_table} {where}", params).fetchone()["total"]
            rows = conn.execute(f"SELECT * FROM {self.qualified_table} {where} ORDER BY created_at DESC LIMIT %s OFFSET %s", [*params, page_size, offset]).fetchall()
        return {"items": [self.hydrate_payload(row) for row in rows], "total": total, "page": page, "page_size": page_size, "pages": (total + page_size - 1) // page_size}


class AnalyticsNativeRepository(BaseNativeRepository):
    table_name = "vendors"

    @staticmethod
    def _parse_iso_like(value: Any) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if not isinstance(value, str):
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None

    def vendor_analytics(self) -> list[dict[str, Any]]:
        sql_vendors = f"""
            SELECT id, company_name, status, is_blacklisted, avg_rating, ratings_count
            FROM {self.schema}.vendors
            WHERE status = 'approved'
        """
        sql_po = f"""
            SELECT
                vendor_id,
                count(*) AS po_count,
                count(*) FILTER (WHERE status = 'completed') AS po_completed,
                sum(coalesce(amount_total, 0)) AS total_value
            FROM {self.schema}.pos
            GROUP BY vendor_id
        """
        sql_invoice = f"""
            SELECT
                vendor_id,
                sum(CASE WHEN status = 'paid' THEN coalesce(amount, 0) ELSE 0 END) AS invoice_paid,
                sum(CASE WHEN status = 'outstanding' THEN coalesce(amount, 0) ELSE 0 END) AS invoice_outstanding
            FROM {self.schema}.invoices
            GROUP BY vendor_id
        """
        sql_on_time = f"""
            WITH completed_po AS (
                SELECT
                    p.id,
                    p.vendor_id,
                    NULLIF(p.payload->>'delivery_date', '')::date AS delivery_date
                FROM {self.schema}.pos p
                WHERE p.status = 'completed'
            ),
            latest_receipt AS (
                SELECT
                    gr.po_id,
                    max(gr.created_at)::date AS latest_receipt_date
                FROM {self.schema}.goods_receipts gr
                GROUP BY gr.po_id
            )
            SELECT
                cp.vendor_id,
                count(*) FILTER (WHERE cp.delivery_date IS NOT NULL) AS with_delivery,
                count(*) FILTER (
                    WHERE cp.delivery_date IS NOT NULL
                      AND lr.latest_receipt_date IS NOT NULL
                      AND lr.latest_receipt_date <= cp.delivery_date
                ) AS on_time
            FROM completed_po cp
            LEFT JOIN latest_receipt lr ON lr.po_id = cp.id
            GROUP BY cp.vendor_id
        """

        with native_pg_connection() as conn:
            vendors = conn.execute(sql_vendors).fetchall()
            po_map = {row["vendor_id"]: row for row in conn.execute(sql_po).fetchall()}
            inv_map = {row["vendor_id"]: row for row in conn.execute(sql_invoice).fetchall()}
            on_time_map = {row["vendor_id"]: row for row in conn.execute(sql_on_time).fetchall()}

        result: list[dict[str, Any]] = []
        for vendor in vendors:
            vid = vendor["id"]
            po = po_map.get(vid, {})
            inv = inv_map.get(vid, {})
            ot = on_time_map.get(vid, {})
            with_delivery = int(ot.get("with_delivery") or 0)
            on_time = int(ot.get("on_time") or 0)
            on_time_pct = (on_time / with_delivery * 100.0) if with_delivery else None
            result.append(
                {
                    "vendor_id": vid,
                    "vendor_name": vendor.get("company_name"),
                    "po_count": int(po.get("po_count") or 0),
                    "po_completed": int(po.get("po_completed") or 0),
                    "total_value": float(po.get("total_value") or 0),
                    "avg_rating": float(vendor.get("avg_rating") or 0),
                    "ratings_count": int(vendor.get("ratings_count") or 0),
                    "on_time_pct": round(on_time_pct, 1) if on_time_pct is not None else None,
                    "invoice_paid": float(inv.get("invoice_paid") or 0),
                    "invoice_outstanding": float(inv.get("invoice_outstanding") or 0),
                    "blacklisted": bool(vendor.get("is_blacklisted")),
                }
            )

        result.sort(key=lambda x: -x["total_value"])
        return result

    def branches_comparison(self, year: Optional[int] = None) -> dict[str, Any]:
        target_year = year or datetime.now(timezone.utc).year
        start = datetime(target_year, 1, 1, tzinfo=timezone.utc)
        end = datetime(target_year + 1, 1, 1, tzinfo=timezone.utc)

        with native_pg_connection() as conn:
            depts = conn.execute(
                f"SELECT id, name FROM {self.schema}.departments"
            ).fetchall()
            budget_rows = conn.execute(
                f"""
                SELECT department_id, sum(coalesce(amount, 0)) AS amount
                FROM {self.schema}.budgets
                WHERE period = %s
                GROUP BY department_id
                """,
                (str(target_year),),
            ).fetchall()
            pr_rows = conn.execute(
                f"""
                SELECT id, department_id, created_at
                FROM {self.schema}.prs
                WHERE created_at >= %s AND created_at < %s
                """,
                (start, end),
            ).fetchall()
            po_rows = conn.execute(
                f"""
                SELECT id, status, created_at, amount_total, payload
                FROM {self.schema}.pos
                WHERE created_at >= %s AND created_at < %s
                """,
                (start, end),
            ).fetchall()

        dept_map = {row["id"]: row.get("name") or "-" for row in depts}
        budget_by_dept = {row["department_id"]: float(row.get("amount") or 0) for row in budget_rows}
        pr_by_id = {row["id"]: row for row in pr_rows}

        stats: dict[str, dict[str, Any]] = {}
        for pr in pr_rows:
            did = pr.get("department_id")
            if not did:
                continue
            if did not in stats:
                stats[did] = {
                    "department_id": did,
                    "department_name": dept_map.get(did, "-"),
                    "budget": budget_by_dept.get(did, 0.0),
                    "pr_count": 0,
                    "po_count": 0,
                    "total_spend": 0.0,
                    "cycle_days_sum": 0.0,
                    "cycle_n": 0,
                    "on_time": 0,
                    "late": 0,
                    "savings_from_vendor_reply": 0.0,
                    "duplicate_pr_rate": 0,
                }
            stats[did]["pr_count"] += 1

        for po in po_rows:
            payload = dict(po.get("payload") or {})
            pr_ids = payload.get("pr_ids") or []
            if not isinstance(pr_ids, list):
                continue

            amount_total = float(po.get("amount_total") or 0)
            linked_departments: dict[str, datetime] = {}
            for pr_id in pr_ids:
                pr = pr_by_id.get(pr_id)
                if not pr:
                    continue
                did = pr.get("department_id")
                if not did:
                    continue
                created_at = pr.get("created_at")
                if isinstance(created_at, datetime):
                    linked_departments[did] = created_at

            if not linked_departments:
                continue

            per_dept_amount = amount_total / len(linked_departments)
            for did, pr_created_at in linked_departments.items():
                s = stats.setdefault(
                    did,
                    {
                        "department_id": did,
                        "department_name": dept_map.get(did, "-"),
                        "budget": budget_by_dept.get(did, 0.0),
                        "pr_count": 0,
                        "po_count": 0,
                        "total_spend": 0.0,
                        "cycle_days_sum": 0.0,
                        "cycle_n": 0,
                        "on_time": 0,
                        "late": 0,
                        "savings_from_vendor_reply": 0.0,
                        "duplicate_pr_rate": 0,
                    },
                )
                s["po_count"] += 1
                s["total_spend"] += per_dept_amount
                po_created_at = po.get("created_at")
                if isinstance(po_created_at, datetime):
                    delta = (po_created_at - pr_created_at).days
                    if delta >= 0:
                        s["cycle_days_sum"] += float(delta)
                        s["cycle_n"] += 1
                if po.get("status") == "completed":
                    s["on_time"] += 1
                elif po.get("status") == "partial":
                    s["late"] += 1

                reply = payload.get("vendor_reply") or {}
                reply_items = reply.get("items") or []
                orig_items = payload.get("items") or []
                if isinstance(reply_items, list) and isinstance(orig_items, list):
                    for it_reply, it_orig in zip(reply_items, orig_items):
                        if not isinstance(it_reply, dict) or not isinstance(it_orig, dict):
                            continue
                        orig_price = float(it_orig.get("price") or 0)
                        reply_price = float(it_reply.get("price") or 0)
                        qty = float(it_orig.get("qty") or 0)
                        if reply_price < orig_price:
                            s["savings_from_vendor_reply"] += (orig_price - reply_price) * qty

        branches: list[dict[str, Any]] = []
        for s in stats.values():
            cycle_avg = round(s["cycle_days_sum"] / s["cycle_n"], 1) if s["cycle_n"] else None
            completed = s["on_time"] + s["late"]
            on_time_pct = round(s["on_time"] / completed * 100, 1) if completed else None
            util_pct = round(s["total_spend"] / s["budget"] * 100, 1) if s["budget"] else None
            branches.append(
                {
                    **s,
                    "avg_cycle_days": cycle_avg,
                    "on_time_pct": on_time_pct,
                    "budget_utilization_pct": util_pct,
                }
            )
        branches.sort(key=lambda x: x["total_spend"], reverse=True)

        totals = {
            "total_spend": sum(row["total_spend"] for row in branches),
            "total_savings": sum(row["savings_from_vendor_reply"] for row in branches),
            "total_pr": sum(row["pr_count"] for row in branches),
            "total_po": sum(row["po_count"] for row in branches),
            "branch_count": len(branches),
        }
        return {"year": target_year, "branches": branches, "totals": totals}

    def vendor_suggestions(self, *, product_ids: Optional[str], top: int) -> dict[str, Any]:
        product_set = set((product_ids or "").split(",")) if product_ids else set()
        product_set.discard("")

        with native_pg_connection() as conn:
            vendors = conn.execute(
                f"""
                SELECT id, company_name, avg_rating, ratings_count
                FROM {self.schema}.vendors
                WHERE status = 'approved' AND coalesce(is_blacklisted, false) = false
                """
            ).fetchall()
            pos = conn.execute(
                f"""
                SELECT vendor_id, status, created_at, payload
                FROM {self.schema}.pos
                WHERE status IN ('completed', 'sent', 'partial')
                """
            ).fetchall()
            prs = conn.execute(
                f"""
                SELECT preferred_vendor_id, payload
                FROM {self.schema}.prs
                WHERE preferred_vendor_id IS NOT NULL
                """
            ).fetchall()

        perf: dict[str, dict[str, Any]] = {}
        for po in pos:
            vid = po.get("vendor_id")
            if not vid:
                continue
            stat = perf.setdefault(
                vid,
                {
                    "po_count": 0,
                    "pr_considered": 0,
                    "on_time": 0,
                    "late": 0,
                    "lead_days_sum": 0.0,
                    "lead_n": 0,
                    "product_ids": set(),
                },
            )
            stat["po_count"] += 1
            payload = dict(po.get("payload") or {})
            for item in payload.get("items") or []:
                if isinstance(item, dict) and item.get("product_id"):
                    stat["product_ids"].add(item["product_id"])

            order_dt = self._parse_iso_like(payload.get("order_date")) or po.get("created_at")
            delivery_dt = self._parse_iso_like(payload.get("delivery_date")) if po.get("status") == "completed" else None
            if isinstance(order_dt, datetime) and isinstance(delivery_dt, datetime):
                delta = (delivery_dt - order_dt).days
                if delta >= 0:
                    stat["lead_days_sum"] += float(delta)
                    stat["lead_n"] += 1

            expected = self._parse_iso_like(payload.get("delivery_date"))
            if po.get("status") == "completed" and expected:
                stat["on_time"] += 1
            elif po.get("status") == "partial" and expected:
                stat["late"] += 1

        for pr in prs:
            vid = pr.get("preferred_vendor_id")
            if not vid:
                continue
            stat = perf.setdefault(
                vid,
                {
                    "po_count": 0,
                    "pr_considered": 0,
                    "on_time": 0,
                    "late": 0,
                    "lead_days_sum": 0.0,
                    "lead_n": 0,
                    "product_ids": set(),
                },
            )
            stat["pr_considered"] += 1
            payload = dict(pr.get("payload") or {})
            for item in payload.get("items") or []:
                if isinstance(item, dict) and item.get("product_id"):
                    stat["product_ids"].add(item["product_id"])

        ranked: list[dict[str, Any]] = []
        for vendor in vendors:
            vid = vendor["id"]
            stat = perf.get(
                vid,
                {
                    "po_count": 0,
                    "pr_considered": 0,
                    "on_time": 0,
                    "late": 0,
                    "lead_days_sum": 0.0,
                    "lead_n": 0,
                    "product_ids": set(),
                },
            )
            rating = float(vendor.get("avg_rating") or 0)
            rating_score = min(rating / 5.0, 1.0)
            completed = stat["on_time"] + stat["late"]
            ontime_pct = (stat["on_time"] / completed) if completed else 0.5
            lead_days = (stat["lead_days_sum"] / stat["lead_n"]) if stat["lead_n"] else 30.0
            lead_score = max(0.0, min(1.0, 1.0 - lead_days / 60.0))
            product_match = bool(product_set & stat["product_ids"]) if product_set else False
            product_bonus = 0.10 if product_match else 0.0
            pr_bonus = min(0.05, stat["pr_considered"] * 0.01) if stat["pr_considered"] else 0.0

            score = 0.4 * rating_score + 0.3 * ontime_pct + 0.3 * lead_score + product_bonus + pr_bonus
            reasons: list[str] = []
            if rating >= 4:
                reasons.append(f"⭐ {rating:.1f}/5 rata-rata rating")
            elif stat["po_count"] == 0 and stat["pr_considered"] == 0:
                reasons.append("Vendor baru (belum ada aktivitas)")
            if ontime_pct >= 0.8 and completed > 0:
                reasons.append(f"On-time {ontime_pct * 100:.0f}% dari {completed} PO")
            elif completed > 0:
                reasons.append(f"On-time {ontime_pct * 100:.0f}% (perhatikan)")
            if stat["lead_n"] > 0:
                reasons.append(f"Lead time ~{lead_days:.0f} hari")
            if stat["pr_considered"] > 0:
                reasons.append(f"Pernah dipertimbangkan di {stat['pr_considered']} PR")
            if product_match:
                reasons.append("✓ Pernah supply produk yang sama")

            ranked.append(
                {
                    "vendor_id": vid,
                    "company_name": vendor.get("company_name"),
                    "avg_rating": rating,
                    "po_count": stat["po_count"],
                    "pr_considered": stat["pr_considered"],
                    "on_time_pct": round(ontime_pct * 100, 1) if completed else None,
                    "avg_lead_days": round(lead_days, 1) if stat["lead_n"] else None,
                    "product_match": product_match,
                    "score": round(score * 100, 1),
                    "reasons": reasons,
                }
            )

        ranked.sort(key=lambda row: row["score"], reverse=True)
        return {
            "suggestions": ranked[: max(1, min(int(top), 100))],
            "criteria": "40% rating · 30% on-time · 30% lead time · +10% produk match · +5% PR history",
        }


class ReportingNativeRepository(BaseNativeRepository):
    table_name = "prs"

    def pr_report_rows(self, limit: int = 2000) -> list[list[Any]]:
        sql = f"""
            SELECT
                p.pr_number,
                to_char(p.created_at, 'YYYY-MM-DD') AS created_date,
                coalesce(p.payload->>'requester_name', '') AS requester_name,
                coalesce(d.name, '-') AS department_name,
                coalesce(p.payload->>'procurement_type', '') AS procurement_type,
                CASE WHEN coalesce((p.payload->>'is_bonded')::boolean, false) THEN 'Yes' ELSE 'No' END AS bonded,
                p.status,
                coalesce(p.total, 0) AS total,
                coalesce(p.payload->>'warehouse_status', '-') AS warehouse_status
            FROM {self.schema}.prs p
            LEFT JOIN {self.schema}.departments d ON d.id = p.department_id
            ORDER BY p.created_at DESC
            LIMIT %s
        """
        with native_pg_connection() as conn:
            rows = conn.execute(sql, (max(1, int(limit)),)).fetchall()
        return [
            [
                row["pr_number"],
                row["created_date"],
                row["requester_name"],
                row["department_name"],
                row["procurement_type"],
                row["bonded"],
                row["status"],
                float(row["total"] or 0),
                row["warehouse_status"],
            ]
            for row in rows
        ]

    def po_report_rows(self, limit: int = 2000) -> list[list[Any]]:
        sql = f"""
            SELECT
                p.po_number,
                to_char(p.created_at, 'YYYY-MM-DD') AS created_date,
                p.po_type,
                coalesce(v.company_name, p.vendor_id::text) AS vendor_name,
                p.status,
                p.shipping_status,
                p.invoice_status,
                coalesce(p.amount_total, 0) AS total,
                coalesce(
                    (
                        SELECT string_agg(prid, ', ')
                        FROM jsonb_array_elements_text(coalesce(p.payload->'pr_ids', '[]'::jsonb)) AS prid
                    ),
                    ''
                ) AS pr_ids
            FROM {self.schema}.pos p
            LEFT JOIN {self.schema}.vendors v ON v.id = p.vendor_id
            ORDER BY p.created_at DESC
            LIMIT %s
        """
        with native_pg_connection() as conn:
            rows = conn.execute(sql, (max(1, int(limit)),)).fetchall()
        return [
            [
                row["po_number"],
                row["created_date"],
                row["po_type"],
                row["vendor_name"],
                row["status"],
                row["shipping_status"],
                row["invoice_status"],
                float(row["total"] or 0),
                row["pr_ids"],
            ]
            for row in rows
        ]

    def budget_report_rows(self, limit: int = 2000) -> list[list[Any]]:
        sql = f"""
            SELECT
                coalesce(d.name, '-') AS department_name,
                coalesce(p.name, 'SEMUA') AS product_name,
                b.period,
                coalesce(b.amount, 0) AS amount,
                coalesce(b.used_amount, 0) AS used_amount,
                b.status
            FROM {self.schema}.budgets b
            LEFT JOIN {self.schema}.departments d ON d.id = b.department_id
            LEFT JOIN {self.schema}.products p ON p.id = b.product_id
            ORDER BY b.created_at DESC
            LIMIT %s
        """
        with native_pg_connection() as conn:
            rows = conn.execute(sql, (max(1, int(limit)),)).fetchall()

        data: list[list[Any]] = []
        for row in rows:
            amount = float(row["amount"] or 0)
            used = float(row["used_amount"] or 0)
            pct = (used / amount * 100.0) if amount else 0
            data.append(
                [
                    row["department_name"],
                    row["product_name"],
                    row["period"],
                    amount,
                    used,
                    amount - used,
                    f"{pct:.1f}%",
                    row["status"],
                ]
            )
        return data


class ExplainNativeRepository(BaseNativeRepository):
    table_name = "prs"

    def explain(self, sql: str, params: list[Any]) -> list[str]:
        plan_sql = f"EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT) {sql}"
        with native_pg_connection() as conn:
            rows = conn.execute(plan_sql, params).fetchall()
        return [row["QUERY PLAN"] for row in rows]

    def explain_pr_list(self, *, requester_id: Optional[str], status: Optional[str], department_id: Optional[str], search: Optional[str], page: int, page_size: int) -> dict[str, list[str]]:
        filters: list[str] = []
        params: list[Any] = []
        if requester_id:
            filters.append("requester_id = %s")
            params.append(requester_id)
        if status:
            filters.append(STATUS_EQ)
            params.append(status)
        if department_id:
            filters.append("department_id = %s")
            params.append(department_id)
        if search:
            filters.append("(pr_number ILIKE %s OR payload->>'requester_name' ILIKE %s OR payload->>'notes' ILIKE %s)")
            needle = f"%{search}%"
            params.extend([needle, needle, needle])
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        offset = (page - 1) * page_size

        count_sql = f"SELECT count(*) AS total FROM {self.schema}.prs {where}"
        list_sql = f"SELECT * FROM {self.schema}.prs {where} ORDER BY created_at DESC LIMIT %s OFFSET %s"
        return {
            "count": self.explain(count_sql, params),
            "list": self.explain(list_sql, [*params, page_size, offset]),
        }

    def explain_po_list(self, *, vendor_id: Optional[str], assigned_pic_id: Optional[str], status: Optional[str], po_type: Optional[str], search: Optional[str], page: int, page_size: int) -> dict[str, list[str]]:
        filters: list[str] = []
        params: list[Any] = []
        if vendor_id:
            filters.append(VENDOR_ID_EQ)
            params.append(vendor_id)
        if assigned_pic_id:
            filters.append("assigned_pic_id = %s")
            params.append(assigned_pic_id)
        if status:
            filters.append(STATUS_EQ)
            params.append(status)
        if po_type:
            filters.append("po_type = %s")
            params.append(po_type)
        if search:
            filters.append("(po_number ILIKE %s OR payload->>'notes' ILIKE %s)")
            needle = f"%{search}%"
            params.extend([needle, needle])
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        offset = (page - 1) * page_size

        count_sql = f"SELECT count(*) AS total FROM {self.schema}.pos {where}"
        list_sql = f"SELECT * FROM {self.schema}.pos {where} ORDER BY created_at DESC LIMIT %s OFFSET %s"
        return {
            "count": self.explain(count_sql, params),
            "list": self.explain(list_sql, [*params, page_size, offset]),
        }