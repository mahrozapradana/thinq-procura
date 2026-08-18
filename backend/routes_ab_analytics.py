"""Tenant-scoped branch comparison analytics (A/B dashboard).

Compares procurement KPIs (spend, avg PR-to-PO cycle, on-time %, savings via vendor reply)
per department (treated as branch/cost-center).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from auth_utils import get_current_active_user
from db_models import get_db

router = APIRouter(prefix="/api/analytics")


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


@router.get("/branches-comparison")
async def branches_comparison(
    year: Optional[int] = None,
    user=Depends(get_current_active_user),
):
    if user["role"] not in ("admin", "procurement", "finance"):
        raise HTTPException(403, "Not allowed")
    db = get_db()

    year = year or datetime.now(timezone.utc).year
    start = f"{year:04d}-01-01"
    end = f"{year+1:04d}-01-01"

    depts = await db.departments.find({}, {"_id": 0}).to_list(500)
    dept_map = {d["id"]: d.get("name", "-") for d in depts}
    budgets = await db.budgets.find({"period": str(year)}, {"_id": 0}).to_list(500)
    budget_by_dept: dict[str, float] = {}
    for b in budgets:
        budget_by_dept[b.get("department_id")] = budget_by_dept.get(b.get("department_id"), 0) + float(b.get("amount") or 0)

    prs = await db.prs.find({"created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(5000)
    pos = await db.pos.find({"created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(5000)
    pos_by_prs: dict[str, dict] = {}
    for p in pos:
        for prid in (p.get("pr_ids") or []):
            pos_by_prs[prid] = p

    stats: dict[str, dict] = {}
    for pr in prs:
        did = pr.get("department_id")
        if not did:
            continue
        s = stats.setdefault(did, {
            "department_id": did,
            "department_name": dept_map.get(did, "-"),
            "budget": budget_by_dept.get(did, 0),
            "pr_count": 0,
            "po_count": 0,
            "total_spend": 0.0,
            "cycle_days_sum": 0.0,
            "cycle_n": 0,
            "on_time": 0,
            "late": 0,
            "savings_from_vendor_reply": 0.0,
            "duplicate_pr_rate": 0,
        })
        s["pr_count"] += 1
        # cycle: PR created → PO created
        po = pos_by_prs.get(pr["id"])
        if po:
            s["po_count"] += 1
            s["total_spend"] += float(po.get("amount_total") or po.get("total") or 0)
            pd = _parse_iso(pr.get("created_at"))
            od = _parse_iso(po.get("created_at"))
            if pd and od:
                d = (od - pd).days
                if d >= 0:
                    s["cycle_days_sum"] += d
                    s["cycle_n"] += 1
            # on-time detection
            if po.get("status") == "completed":
                s["on_time"] += 1
            elif po.get("status") == "partial":
                s["late"] += 1
            # Savings: vendor_reply lowered price
            reply = po.get("vendor_reply") or {}
            for it_reply, it_orig in zip(reply.get("items") or [], po.get("items") or []):
                orig_price = float(it_orig.get("price") or 0)
                reply_price = float(it_reply.get("price") or 0)
                qty = float(it_orig.get("qty") or 0)
                if reply_price < orig_price:
                    s["savings_from_vendor_reply"] += (orig_price - reply_price) * qty

    # Compute derived metrics
    rows = []
    for s in stats.values():
        cycle_avg = round(s["cycle_days_sum"] / s["cycle_n"], 1) if s["cycle_n"] else None
        completed = s["on_time"] + s["late"]
        on_time_pct = round(s["on_time"] / completed * 100, 1) if completed else None
        util_pct = round(s["total_spend"] / s["budget"] * 100, 1) if s["budget"] else None
        rows.append({
            **s,
            "avg_cycle_days": cycle_avg,
            "on_time_pct": on_time_pct,
            "budget_utilization_pct": util_pct,
        })
    rows.sort(key=lambda x: x["total_spend"], reverse=True)

    # Aggregate totals
    totals = {
        "total_spend": sum(r["total_spend"] for r in rows),
        "total_savings": sum(r["savings_from_vendor_reply"] for r in rows),
        "total_pr": sum(r["pr_count"] for r in rows),
        "total_po": sum(r["po_count"] for r in rows),
        "branch_count": len(rows),
    }
    return {"year": year, "branches": rows, "totals": totals}
