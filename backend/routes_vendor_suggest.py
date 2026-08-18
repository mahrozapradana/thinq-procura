"""Vendor auto-suggest based on historical performance (rating + on-time + lead time)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends

from auth_utils import get_current_active_user
from db_models import get_db

router = APIRouter(prefix="/api")


def _parse_iso(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


@router.get("/vendor-suggestions")
async def suggest_vendors(product_ids: Optional[str] = None, top: int = 5, user=Depends(get_current_active_user)):
    """Ranked vendor recommendation. Score = 0.4*rating_score + 0.3*ontime_score + 0.3*leadtime_score."""
    db = get_db()
    vendors = await db.vendors.find({"status": "approved", "is_blacklisted": {"$ne": True}}, {"_id": 0}).to_list(500)
    product_set = set((product_ids or "").split(",")) if product_ids else set()
    product_set.discard("")

    # Aggregate historical PR + PO performance per vendor
    pos = await db.pos.find({"status": {"$in": ["completed", "sent", "partial"]}}, {"_id": 0}).to_list(5000)
    # PRs with preferred_vendor_id (consideration signal even if never converted to PO)
    prs = await db.prs.find({"preferred_vendor_id": {"$exists": True, "$ne": None}}, {"_id": 0}).to_list(5000)
    perf: dict[str, dict] = {}
    for p in pos:
        vid = p.get("vendor_id")
        if not vid:
            continue
        stat = perf.setdefault(vid, {"po_count": 0, "pr_considered": 0, "on_time": 0, "late": 0, "lead_days_sum": 0.0, "lead_n": 0, "product_ids": set()})
        stat["po_count"] += 1
        for it in (p.get("items") or []):
            if it.get("product_id"):
                stat["product_ids"].add(it["product_id"])
        od = _parse_iso(p.get("order_date") or p.get("created_at"))
        rd = _parse_iso(p.get("delivery_date")) if p.get("status") == "completed" else None
        if od and rd:
            days = (rd - od).days
            if days >= 0:
                stat["lead_days_sum"] += days
                stat["lead_n"] += 1
        exp = _parse_iso(p.get("delivery_date"))
        if p.get("status") == "completed" and exp:
            stat["on_time"] += 1
        elif p.get("status") == "partial" and exp:
            stat["late"] += 1
    # PR consideration signal
    for pr in prs:
        vid = pr.get("preferred_vendor_id")
        if not vid:
            continue
        stat = perf.setdefault(vid, {"po_count": 0, "pr_considered": 0, "on_time": 0, "late": 0, "lead_days_sum": 0.0, "lead_n": 0, "product_ids": set()})
        stat["pr_considered"] += 1
        for it in (pr.get("items") or []):
            if it.get("product_id"):
                stat["product_ids"].add(it["product_id"])

    ranked = []
    for v in vendors:
        stat = perf.get(v["id"], {"po_count": 0, "pr_considered": 0, "on_time": 0, "late": 0, "lead_days_sum": 0, "lead_n": 0, "product_ids": set()})
        rating = float(v.get("avg_rating") or 0)
        rating_score = min(rating / 5.0, 1.0)
        completed = stat["on_time"] + stat["late"]
        ontime_pct = (stat["on_time"] / completed) if completed else 0.5
        ontime_score = ontime_pct
        avg_lead = (stat["lead_days_sum"] / stat["lead_n"]) if stat["lead_n"] else 30.0
        leadtime_score = max(0.0, min(1.0, 1.0 - avg_lead / 60.0))
        product_match = bool(product_set & stat["product_ids"]) if product_set else False
        product_bonus = 0.10 if product_match else 0.0
        # PR-consideration bonus: gives new vendors visibility even without PO history
        pr_bonus = min(0.05, stat["pr_considered"] * 0.01) if stat["pr_considered"] else 0.0

        score = 0.4 * rating_score + 0.3 * ontime_score + 0.3 * leadtime_score + product_bonus + pr_bonus
        reasons = []
        if rating >= 4:
            reasons.append(f"⭐ {rating:.1f}/5 rata-rata rating")
        elif stat["po_count"] == 0 and stat["pr_considered"] == 0:
            reasons.append("Vendor baru (belum ada aktivitas)")
        if ontime_pct >= 0.8 and completed > 0:
            reasons.append(f"On-time {ontime_pct*100:.0f}% dari {completed} PO")
        elif completed > 0:
            reasons.append(f"On-time {ontime_pct*100:.0f}% (perhatikan)")
        if stat["lead_n"] > 0:
            reasons.append(f"Lead time ~{avg_lead:.0f} hari")
        if stat["pr_considered"] > 0:
            reasons.append(f"Pernah dipertimbangkan di {stat['pr_considered']} PR")
        if product_match:
            reasons.append("✓ Pernah supply produk yang sama")

        ranked.append({
            "vendor_id": v["id"],
            "company_name": v.get("company_name"),
            "avg_rating": rating,
            "po_count": stat["po_count"],
            "pr_considered": stat["pr_considered"],
            "on_time_pct": round(ontime_pct * 100, 1) if completed else None,
            "avg_lead_days": round(avg_lead, 1) if stat["lead_n"] else None,
            "product_match": product_match,
            "score": round(score * 100, 1),
            "reasons": reasons,
        })
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return {"suggestions": ranked[:top], "criteria": "40% rating · 30% on-time · 30% lead time · +10% produk match · +5% PR history"}
