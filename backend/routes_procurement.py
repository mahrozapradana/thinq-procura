"""Procurement flow: approval workflows, budgets, PRs, POs, tenders."""
from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from auth_utils import get_current_active_user
from db_models import get_db, new_id, now_iso, clean, gen_number
from notifications import notify_pending_approval

router = APIRouter(prefix="/api")


# ---------- Approval Workflow ----------
class ApprovalLevelIn(BaseModel):
    level: int
    role: str  # role that must approve at this level
    min_amount: float = 0.0
    max_amount: float = 1_000_000_000.0
    approver_id: Optional[str] = None  # optional specific approver


class ApprovalWorkflowIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    applies_to: str  # "PR" | "PO" | "BUDGET"
    department_id: Optional[str] = None
    levels: List[ApprovalLevelIn]


@router.get("/approval-workflows")
async def list_workflows(user=Depends(get_current_active_user)):
    db = get_db()
    return await db.approval_workflows.find({}, {"_id": 0}).to_list(1000)


@router.post("/approval-workflows")
async def create_workflow(payload: ApprovalWorkflowIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    doc = {"id": new_id(), "created_at": now_iso(), **payload.model_dump()}
    await db.approval_workflows.insert_one(doc)
    return clean(doc)


@router.put("/approval-workflows/{wid}")
async def update_workflow(wid: str, payload: ApprovalWorkflowIn, user=Depends(get_current_active_user)):
    db = get_db()
    await db.approval_workflows.update_one({"id": wid}, {"$set": payload.model_dump()})
    return await db.approval_workflows.find_one({"id": wid}, {"_id": 0})


@router.delete("/approval-workflows/{wid}")
async def delete_workflow(wid: str, user=Depends(get_current_active_user)):
    db = get_db()
    await db.approval_workflows.delete_one({"id": wid})
    return {"ok": True}


async def _pick_workflow(db, applies_to: str, department_id: Optional[str]) -> Optional[dict]:
    wf = None
    if department_id:
        wf = await db.approval_workflows.find_one(
            {"applies_to": applies_to, "department_id": department_id}, {"_id": 0}
        )
    if not wf:
        wf = await db.approval_workflows.find_one(
            {"applies_to": applies_to, "department_id": None}, {"_id": 0}
        )
    return wf


def _levels_for_amount(wf: Optional[dict], amount: float) -> list:
    if not wf:
        return []
    steps = []
    for lvl in sorted(wf["levels"], key=lambda l: l["level"]):
        if lvl.get("min_amount", 0) <= amount <= lvl.get("max_amount", 1e12):
            steps.append({
                "level": lvl["level"],
                "role": lvl["role"],
                "approver_id": lvl.get("approver_id"),
                "status": "pending",
                "note": None,
                "at": None,
            })
    return steps


# ---------- Budgets ----------
class BudgetIn(BaseModel):
    department_id: str
    product_id: Optional[str] = None
    period: str  # e.g. "2026" or "2026-Q1" or "2026-02"
    amount: float
    note: Optional[str] = None


@router.get("/budgets/check/{department_id}")
async def budgets_check(department_id: str, user=Depends(get_current_active_user)):
    """Return approved budgets for a department (product-level + dept-level) with usage."""
    db = get_db()
    q = {"department_id": department_id, "status": "approved"}
    budgets = await db.budgets.find(q, {"_id": 0}).to_list(500)
    out = []
    for b in budgets:
        amt = float(b.get("amount") or 0)
        used = float(b.get("used_amount") or 0)
        out.append({
            "id": b["id"],
            "product_id": b.get("product_id"),
            "period": b.get("period"),
            "amount": amt,
            "used_amount": used,
            "available": amt - used,
        })
    return out


@router.get("/budgets")
async def list_budgets(user=Depends(get_current_active_user)):
    db = get_db()
    return await db.budgets.find({}, {"_id": 0}).to_list(1000)


@router.post("/budgets")
async def create_budget(payload: BudgetIn, user=Depends(get_current_active_user)):
    db = get_db()
    wf = await _pick_workflow(db, "BUDGET", payload.department_id)
    steps = _levels_for_amount(wf, payload.amount)
    doc = {
        "id": new_id(),
        "created_at": now_iso(),
        "created_by": user["id"],
        "status": "pending_approval" if steps else "approved",
        "used_amount": 0.0,
        "approvals": steps,
        "current_level": 1 if steps else 0,
        **payload.model_dump(),
    }
    await db.budgets.insert_one(doc)
    return clean(doc)


@router.post("/budgets/{bid}/approve")
async def approve_budget(bid: str, note: Optional[str] = None, user=Depends(get_current_active_user)):
    return await _approve_generic("budgets", bid, user, note)


@router.post("/budgets/{bid}/reject")
async def reject_budget(bid: str, note: Optional[str] = None, user=Depends(get_current_active_user)):
    return await _reject_generic("budgets", bid, user, note)


async def _budget_plan(db, department_id: str, items: list[dict]) -> tuple[bool, str, dict]:
    """Per-item budget check with per-product override.

    Returns (ok, error_msg, budget_map) where budget_map is {budget_id: amount_to_consume}.
    Logic: for each item, prefer product-specific approved budget in same dept; else fall back
    to dept-level (product_id=None). Aggregate consumption per budget_id and verify
    remaining (amount - used_amount) >= aggregated consumption.
    """
    q_base = {"department_id": department_id, "status": "approved"}
    budget_map: dict[str, float] = {}
    per_budget_note: dict[str, str] = {}
    for it in items:
        pid = it.get("product_id")
        subtotal = float(it.get("subtotal") or (float(it.get("qty") or 0) * float(it.get("price") or 0)))
        chosen = None
        if pid:
            chosen = await db.budgets.find_one({**q_base, "product_id": pid}, {"_id": 0})
        if not chosen:
            chosen = await db.budgets.find_one({**q_base, "product_id": None}, {"_id": 0})
        if not chosen:
            return (False, f"Tidak ada budget approved untuk department ini (item {it.get('product_name') or pid}).", {})
        budget_map[chosen["id"]] = budget_map.get(chosen["id"], 0.0) + subtotal
        per_budget_note[chosen["id"]] = f"{chosen.get('product_id') or 'DEPT'} periode {chosen.get('period')}"
    # verify availability
    for bid, need in budget_map.items():
        b = await db.budgets.find_one({"id": bid}, {"_id": 0})
        avail = float(b["amount"]) - float(b.get("used_amount") or 0)
        if need > avail:
            label = per_budget_note.get(bid, bid)
            return (False, f"Melanggar budget ({label}): butuh Rp {need:,.0f}, tersedia Rp {avail:,.0f}", {})
    return (True, "", budget_map)


async def _budget_consume_map(db, budget_map: dict[str, float]):
    for bid, amt in (budget_map or {}).items():
        await db.budgets.update_one({"id": bid}, {"$inc": {"used_amount": float(amt)}})


# ---------- Generic approve/reject ----------
async def _approve_generic(collection: str, doc_id: str, user: dict, note: Optional[str]):
    db = get_db()
    doc = await db[collection].find_one({"id": doc_id})
    if not doc:
        raise HTTPException(404, "Not found")
    if doc.get("status") not in ("pending_approval",):
        raise HTTPException(400, f"Cannot approve, status: {doc.get('status')}")
    approvals = doc.get("approvals", [])
    if not approvals:
        raise HTTPException(400, "No approval steps defined")
    cur_level = doc.get("current_level", 1)
    step = next((s for s in approvals if s["level"] == cur_level), None)
    if not step:
        raise HTTPException(400, "Invalid approval level")
    if step.get("approver_id") and step["approver_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(403, "You are not the assigned approver")
    if step.get("approver_id") is None and user["role"] not in (step["role"], "admin"):
        raise HTTPException(403, f"Requires role: {step['role']}")
    step["status"] = "approved"
    step["note"] = note
    step["at"] = now_iso()
    step["approver_actual_id"] = user["id"]
    remaining = [s for s in approvals if s["status"] == "pending"]
    if remaining:
        next_level = min(s["level"] for s in remaining)
        await db[collection].update_one(
            {"id": doc_id},
            {"$set": {"approvals": approvals, "current_level": next_level}},
        )
        # notify next approvers
        updated = await db[collection].find_one({"id": doc_id}, {"_id": 0})
        try:
            await notify_pending_approval(collection[:-1].upper(), updated)
        except Exception:
            pass
    else:
        # Fully approved
        update: dict = {"approvals": approvals, "status": "approved", "current_level": 0}
        await db[collection].update_one({"id": doc_id}, {"$set": update})
        # Consume budget when PR approved (per-item map)
        if collection == "prs":
            await _budget_consume_map(db, doc.get("budget_map") or {})
    return await db[collection].find_one({"id": doc_id}, {"_id": 0})


async def _reject_generic(collection: str, doc_id: str, user: dict, note: Optional[str]):
    db = get_db()
    doc = await db[collection].find_one({"id": doc_id})
    if not doc:
        raise HTTPException(404, "Not found")
    approvals = doc.get("approvals", [])
    cur_level = doc.get("current_level", 1)
    step = next((s for s in approvals if s["level"] == cur_level), None)
    if step:
        step["status"] = "rejected"
        step["note"] = note
        step["at"] = now_iso()
        step["approver_actual_id"] = user["id"]
    await db[collection].update_one(
        {"id": doc_id},
        {"$set": {"approvals": approvals, "status": "rejected"}},
    )
    return await db[collection].find_one({"id": doc_id}, {"_id": 0})


# ---------- Purchase Requests ----------
class PRItemIn(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    qty: float
    price: float
    hs_code: Optional[str] = None

    @property
    def subtotal(self) -> float:
        return self.qty * self.price


class PRIn(BaseModel):
    department_id: str
    items: List[PRItemIn]
    procurement_type: str = "DIRECT"  # DIRECT | TENDER
    is_bonded: bool = False
    notes: Optional[str] = None
    attachments: List[dict] = Field(default_factory=list)
    preferred_vendor_id: Optional[str] = None  # rekomendasi vendor dari requester


@router.get("/prs")
async def list_prs(
    q: Optional[str] = None,
    status: Optional[str] = None,
    department_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user=Depends(get_current_active_user),
):
    db = get_db()
    query: dict = {}
    if user["role"] == "requester":
        query["requester_id"] = user["id"]
    if status:
        query["status"] = status
    if department_id:
        query["department_id"] = department_id
    if q:
        query["$or"] = [
            {"pr_number": {"$regex": q, "$options": "i"}},
            {"requester_name": {"$regex": q, "$options": "i"}},
            {"notes": {"$regex": q, "$options": "i"}},
        ]
    total = await db.prs.count_documents(query)
    page = max(page, 1); page_size = min(max(page_size, 1), 100)
    skip = (page - 1) * page_size
    items = await db.prs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": (total + page_size - 1) // page_size}


@router.get("/prs/{pid}")
async def get_pr(pid: str, user=Depends(get_current_active_user)):
    db = get_db()
    doc = await db.prs.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "PR not found")
    return doc


@router.post("/prs")
async def create_pr(payload: PRIn, user=Depends(get_current_active_user)):
    db = get_db()
    items = [{**i.model_dump(), "subtotal": i.qty * i.price} for i in payload.items]
    total = sum(i["subtotal"] for i in items)

    # Per-item budget check
    ok, err, budget_map = await _budget_plan(db, payload.department_id, items)
    if not ok:
        raise HTTPException(400, err)

    wf = await _pick_workflow(db, "PR", payload.department_id)
    steps = _levels_for_amount(wf, total)
    doc = {
        "id": new_id(),
        "pr_number": gen_number("PR"),
        "department_id": payload.department_id,
        "requester_id": user["id"],
        "requester_name": user["name"],
        "items": items,
        "total": total,
        "currency": "IDR",
        "procurement_type": payload.procurement_type,
        "is_bonded": payload.is_bonded,
        "notes": payload.notes,
        "attachments": payload.attachments,
        "preferred_vendor_id": payload.preferred_vendor_id,
        "status": "pending_approval" if steps else "approved",
        "approvals": steps,
        "current_level": 1 if steps else 0,
        "budget_map": budget_map,
        "po_id": None,
        "tender_id": None,
        "warehouse_status": "not_received",
        "created_at": now_iso(),
    }
    if not steps:
        await _budget_consume_map(db, budget_map)
    await db.prs.insert_one(doc)
    if steps:
        try:
            await notify_pending_approval("Purchase Request", doc)
        except Exception:
            pass
    return clean(doc)


@router.post("/prs/{pid}/submit")
async def submit_pr(pid: str, user=Depends(get_current_active_user)):
    db = get_db()
    await db.prs.update_one({"id": pid, "status": "draft"}, {"$set": {"status": "pending_approval"}})
    return await db.prs.find_one({"id": pid}, {"_id": 0})


@router.post("/prs/{pid}/approve")
async def approve_pr(pid: str, note: Optional[str] = None, user=Depends(get_current_active_user)):
    return await _approve_generic("prs", pid, user, note)


@router.post("/prs/{pid}/reject")
async def reject_pr(pid: str, note: Optional[str] = None, user=Depends(get_current_active_user)):
    return await _reject_generic("prs", pid, user, note)


# ---------- Purchase Orders ----------
class POCreateIn(BaseModel):
    pr_ids: List[str]
    vendor_id: str
    po_type: str = "LOCAL"  # LOCAL | BONDED
    delivery_date: Optional[str] = None
    notes: Optional[str] = None
    warehouse: Optional[str] = None
    payment_terms: Optional[str] = None
    projects: List[str] = Field(default_factory=list)
    vendor_forecast: Optional[str] = None
    tax_percent: float = 11.0
    dpp_nilai_lain: float = 0.0
    assigned_pic_id: Optional[str] = None
    tax_ids: List[str] = Field(default_factory=list)  # many2many taxes
    currency: str = "IDR"
    exchange_rate: float = 1.0  # rate to IDR at PO creation


@router.get("/pos")
async def list_pos(
    q: Optional[str] = None,
    status: Optional[str] = None,
    po_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user=Depends(get_current_active_user),
):
    db = get_db()
    query: dict = {}
    if user["role"] == "vendor":
        query["vendor_id"] = user.get("vendor_id")
        if user.get("is_pic"):
            query["assigned_pic_id"] = user["id"]
    if status:
        query["status"] = status
    if po_type:
        query["po_type"] = po_type
    if q:
        query["$or"] = [
            {"po_number": {"$regex": q, "$options": "i"}},
            {"notes": {"$regex": q, "$options": "i"}},
        ]
    total = await db.pos.count_documents(query)
    page = max(page, 1); page_size = min(max(page_size, 1), 100)
    skip = (page - 1) * page_size
    items = await db.pos.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": (total + page_size - 1) // page_size}


@router.post("/prs/check-duplicate")
async def pr_check_duplicate(payload: dict, user=Depends(get_current_active_user)):
    """Detect similar PR in last 30 days by department + overlapping products."""
    from datetime import datetime, timedelta, timezone
    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    dept = payload.get("department_id")
    product_ids = [it.get("product_id") for it in (payload.get("items") or []) if it.get("product_id")]
    if not dept or not product_ids:
        return {"duplicates": []}
    prs = await db.prs.find({
        "department_id": dept,
        "created_at": {"$gte": cutoff},
        "status": {"$ne": "rejected"},
    }, {"_id": 0}).to_list(500)
    duplicates = []
    for pr in prs:
        overlap = [it for it in pr.get("items", []) if it.get("product_id") in product_ids]
        if overlap:
            duplicates.append({
                "pr_id": pr["id"],
                "pr_number": pr["pr_number"],
                "created_at": pr["created_at"],
                "status": pr["status"],
                "requester_name": pr.get("requester_name"),
                "overlap_products": [it.get("product_name") for it in overlap],
                "total": pr["total"],
            })
    return {"duplicates": duplicates}


@router.get("/pos/{pid}")
async def get_po(pid: str, user=Depends(get_current_active_user)):
    db = get_db()
    doc = await db.pos.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "PO not found")
    return doc


@router.post("/pos")
async def create_po(payload: POCreateIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    prs = await db.prs.find({"id": {"$in": payload.pr_ids}, "status": "approved"}).to_list(1000)
    if len(prs) != len(payload.pr_ids):
        raise HTTPException(400, "Some PRs are not approved or not found")
    merged_items: list = []
    total = 0.0
    for pr in prs:
        for it in pr["items"]:
            merged_items.append({**it, "pr_id": pr["id"], "pr_number": pr["pr_number"]})
            total += it["subtotal"]

    tax_percent = float(payload.tax_percent or 0)
    # Multi-tax (many2many) breakdown if tax_ids provided; else fallback to single tax_percent
    from routes_taxes import compute_tax_breakdown  # local import to avoid cycle
    if payload.tax_ids:
        breakdown = await compute_tax_breakdown(db, total, payload.tax_ids)
        amount_tax = breakdown["tax_total"]
        tax_breakdown = breakdown["tax_breakdown"]
        taxes_snapshot = breakdown["taxes_snapshot"]
    else:
        amount_tax = total * tax_percent / 100.0
        tax_breakdown = [{"code": f"PPN{int(tax_percent)}", "name": f"PPN {tax_percent}%", "rate": tax_percent, "base": total, "amount": amount_tax, "tax_type": "sales"}] if tax_percent else []
        taxes_snapshot = []
    amount_total = total + amount_tax + float(payload.dpp_nilai_lain or 0)

    wf = await _pick_workflow(db, "PO", None)
    steps = _levels_for_amount(wf, total)
    vendor_doc = await db.vendors.find_one({"id": payload.vendor_id}, {"_id": 0}) or {}
    doc = {
        "id": new_id(),
        "po_number": gen_number("PO"),
        "po_type": payload.po_type,
        "vendor_id": payload.vendor_id,
        "vendor_code": vendor_doc.get("code") or payload.vendor_id[:8],
        "vendor_name": vendor_doc.get("company_name"),
        "pr_ids": payload.pr_ids,
        "items": merged_items,
        "total": total,
        "untaxed_amount": total,
        "tax_percent": tax_percent,
        "amount_tax": amount_tax,
        "tax_ids": payload.tax_ids,
        "tax_breakdown": tax_breakdown,
        "taxes_snapshot": taxes_snapshot,
        "dpp_nilai_lain": float(payload.dpp_nilai_lain or 0),
        "amount_total": amount_total,
        "currency": payload.currency,
        "exchange_rate": float(payload.exchange_rate or 1.0),
        "amount_total_idr": amount_total * float(payload.exchange_rate or 1.0),
        "untaxed_amount_idr": total * float(payload.exchange_rate or 1.0),
        "amount_tax_idr": amount_tax * float(payload.exchange_rate or 1.0),
        "status": "pending_approval" if steps else "approved",
        "approvals": steps,
        "current_level": 1 if steps else 0,
        "delivery_date": payload.delivery_date,
        "warehouse": payload.warehouse,
        "payment_terms": payload.payment_terms,
        "projects": payload.projects,
        "vendor_forecast": payload.vendor_forecast,
        "order_date": now_iso(),
        "receipt_date": payload.delivery_date,
        "shipping_status": "pending",
        "invoice_status": "pending",
        "notes": payload.notes,
        "assigned_pic_id": payload.assigned_pic_id,
        "created_by": user["id"],
        "created_at": now_iso(),
    }
    await db.pos.insert_one(doc)
    # Mark PRs as converted_to_po
    await db.prs.update_many(
        {"id": {"$in": payload.pr_ids}},
        {"$set": {"status": "converted_to_po", "po_id": doc["id"]}},
    )
    return clean(doc)


@router.post("/pos/{pid}/approve")
async def approve_po(pid: str, note: Optional[str] = None, user=Depends(get_current_active_user)):
    return await _approve_generic("pos", pid, user, note)


@router.post("/pos/{pid}/reject")
async def reject_po(pid: str, note: Optional[str] = None, user=Depends(get_current_active_user)):
    return await _reject_generic("pos", pid, user, note)


@router.post("/pos/{pid}/send")
async def send_po(pid: str, user=Depends(get_current_active_user)):
    db = get_db()
    po = await db.pos.find_one({"id": pid})
    if not po:
        raise HTTPException(404, "PO not found")
    if po.get("status") != "approved":
        raise HTTPException(400, "PO not approved yet")
    await db.pos.update_one({"id": pid}, {"$set": {"status": "sent", "shipping_status": "waiting_delivery"}})
    # Notify vendor users
    try:
        from routes_notifications import create_notification
        vendor_users = await db.users.find({"vendor_id": po.get("vendor_id"), "role": "vendor"}, {"id": 1, "_id": 0}).to_list(20)
        for vu in vendor_users:
            await create_notification(
                vu["id"], "po_new",
                f"PO baru dari buyer: {po.get('po_number')}",
                f"PO senilai Rp {po.get('amount_total', po.get('total', 0)):,.0f} sudah disetujui — mohon konfirmasi terima.".replace(",", "."),
                f"/vendor/pos",
                {"po_id": pid, "po_number": po.get("po_number")},
            )
    except Exception:
        pass
    return {"ok": True}


REAPPROVAL_DELTA_PCT = 5.0


async def _get_reapproval_threshold(db) -> float:
    cfg = await db.company_settings.find_one({"id": "singleton-company"}, {"reapproval_threshold_pct": 1}) or {}
    return float(cfg.get("reapproval_threshold_pct") or REAPPROVAL_DELTA_PCT)


@router.post("/pos/{pid}/accept-vendor-reply")
async def accept_vendor_reply(pid: str, user=Depends(get_current_active_user)):
    """Buyer accepts vendor's counter prices; recalculate totals + tax; re-trigger approval if delta > threshold."""
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    po = await db.pos.find_one({"id": pid})
    if not po:
        raise HTTPException(404, "PO not found")
    reply = po.get("vendor_reply")
    if not reply:
        raise HTTPException(400, "Belum ada balasan dari vendor")
    if not reply.get("can_fulfill", True):
        raise HTTPException(400, "Vendor menolak — gunakan tombol Tolak dan pilih vendor lain")

    threshold = await _get_reapproval_threshold(db)
    # Apply counter prices per item
    items = list(po.get("items") or [])
    max_delta_pct = 0.0
    for r_item in (reply.get("items") or []):
        idx = r_item.get("item_index")
        new_price = r_item.get("price")
        if idx is None or new_price is None or idx >= len(items):
            continue
        old_price = float(items[idx].get("price") or 0)
        if old_price > 0:
            delta_pct = abs((float(new_price) - old_price) / old_price) * 100.0
            max_delta_pct = max(max_delta_pct, delta_pct)
        items[idx] = {
            **items[idx],
            "price": float(new_price),
            "subtotal": float(new_price) * float(items[idx].get("qty") or 0),
            "vendor_notes": r_item.get("notes"),
        }
    new_untaxed = sum(float(it.get("subtotal") or 0) for it in items)

    # Recompute tax breakdown with existing tax_ids
    from routes_taxes import compute_tax_breakdown
    if po.get("tax_ids"):
        bk = await compute_tax_breakdown(db, new_untaxed, po["tax_ids"])
        amount_tax = bk["tax_total"]
        tax_breakdown = bk["tax_breakdown"]
    else:
        tax_percent = float(po.get("tax_percent") or 0)
        amount_tax = new_untaxed * tax_percent / 100.0
        tax_breakdown = [{"code": f"PPN{int(tax_percent)}", "name": f"PPN {tax_percent}%", "rate": tax_percent, "base": new_untaxed, "amount": amount_tax, "tax_type": "sales"}] if tax_percent else []
    dpp_extra = float(po.get("dpp_nilai_lain") or 0)
    amount_total = new_untaxed + amount_tax + dpp_extra

    update = {
        "items": items,
        "total": new_untaxed,
        "untaxed_amount": new_untaxed,
        "amount_tax": amount_tax,
        "tax_breakdown": tax_breakdown,
        "amount_total": amount_total,
        "vendor_reply_accepted_at": now_iso(),
        "vendor_reply_max_delta_pct": max_delta_pct,
        "delivery_date": reply.get("delivery_days") and (po.get("delivery_date") or None),
    }

    reapproved = False
    if max_delta_pct > threshold:
        wf = await _pick_workflow(db, "PO", None)
        new_steps = _levels_for_amount(wf, new_untaxed)
        update["approvals"] = new_steps
        update["current_level"] = 1 if new_steps else 0
        update["status"] = "pending_approval" if new_steps else "approved"
        update["reapproval_reason"] = f"Perubahan harga vendor {max_delta_pct:.1f}% > threshold {threshold:.1f}%"
        reapproved = True

    await db.pos.update_one({"id": pid}, {"$set": update})
    if reapproved:
        try:
            fresh = await db.pos.find_one({"id": pid}, {"_id": 0})
            await notify_pending_approval("Purchase Order", fresh)
        except Exception:
            pass
    return {"ok": True, "reapproved": reapproved, "delta_pct": max_delta_pct, "threshold": threshold, "new_total": amount_total}


@router.post("/pos/{pid}/reject-vendor-reply")
async def reject_vendor_reply(pid: str, user=Depends(get_current_active_user)):
    """Buyer rejects vendor's reply; clear vendor_reply, PO remains at original price."""
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    await db.pos.update_one({"id": pid}, {"$set": {"vendor_reply_rejected_at": now_iso()}, "$unset": {"vendor_reply": ""}})
    return {"ok": True}


# ---------- Tenders ----------
class TenderItemIn(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    qty: float
    specs: Optional[str] = None


class TenderAttachmentIn(BaseModel):
    url: str
    filename: str
    size: Optional[int] = None
    content_type: Optional[str] = None


class TenderIn(BaseModel):
    title: str
    description: Optional[str] = None
    items: List[TenderItemIn]
    terms: Optional[str] = None
    deadline: Optional[str] = None
    invited_vendor_ids: List[str] = Field(default_factory=list)  # empty = open
    is_bonded: bool = False
    is_sealed: bool = False
    attachments: List[TenderAttachmentIn] = Field(default_factory=list)


class TenderUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    terms: Optional[str] = None
    deadline: Optional[str] = None
    is_sealed: Optional[bool] = None
    attachments: Optional[List[TenderAttachmentIn]] = None
    invited_vendor_ids: Optional[List[str]] = None


@router.get("/tenders")
async def list_tenders(user=Depends(get_current_active_user)):
    db = get_db()
    return await db.tenders.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.get("/tenders/{tid}")
async def get_tender(tid: str, user=Depends(get_current_active_user)):
    db = get_db()
    doc = await db.tenders.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tender not found")
    # Sealed bid: mask bid prices until reveal (buyer side only; vendor uses vendor-portal endpoint)
    if doc.get("is_sealed") and not doc.get("sealed_revealed_at") and doc.get("status") == "open":
        for b in (doc.get("bids") or []):
            b["_sealed"] = True
            b["price"] = None
            b["delivery_days"] = None
            b["notes"] = None
            for it in (b.get("items") or []):
                it["price"] = None
    return doc


@router.put("/tenders/{tid}")
async def update_tender(tid: str, payload: TenderUpdateIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    t = await db.tenders.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Tender not found")
    data = payload.model_dump(exclude_none=True)
    # attachments already serialized to list[dict] via model_dump
    if data:
        await db.tenders.update_one({"id": tid}, {"$set": data})
    return await db.tenders.find_one({"id": tid}, {"_id": 0})


@router.post("/tenders/{tid}/reveal")
async def reveal_sealed_bids(tid: str, user=Depends(get_current_active_user)):
    """Buyer opens the 'envelope' — reveals sealed bid prices. Idempotent."""
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    t = await db.tenders.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Tender not found")
    if not t.get("is_sealed"):
        raise HTTPException(400, "Tender bukan sealed bid")
    if t.get("sealed_revealed_at"):
        return {"ok": True, "already_revealed": True, "revealed_at": t.get("sealed_revealed_at")}
    revealed_at = now_iso()
    await db.tenders.update_one({"id": tid}, {"$set": {
        "sealed_revealed_at": revealed_at,
        "sealed_revealed_by": user["id"],
    }})
    return {"ok": True, "already_revealed": False, "revealed_at": revealed_at}


@router.post("/tenders")
async def create_tender(payload: TenderIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    doc = {
        "id": new_id(),
        "tender_number": gen_number("TDR"),
        "status": "draft",
        "bids": [],
        "awarded_vendor_id": None,
        "created_by": user["id"],
        "created_at": now_iso(),
        **payload.model_dump(),
    }
    await db.tenders.insert_one(doc)
    return clean(doc)


@router.post("/tenders/{tid}/open")
async def open_tender(tid: str, user=Depends(get_current_active_user)):
    db = get_db()
    await db.tenders.update_one({"id": tid}, {"$set": {"status": "open"}})
    return {"ok": True}


@router.post("/tenders/{tid}/close")
async def close_tender(tid: str, user=Depends(get_current_active_user)):
    db = get_db()
    await db.tenders.update_one({"id": tid}, {"$set": {"status": "closed"}})
    return {"ok": True}


@router.post("/tenders/{tid}/award/{vendor_id}")
async def award_tender(tid: str, vendor_id: str, user=Depends(get_current_active_user)):
    db = get_db()
    t = await db.tenders.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Tender not found")
    bids = t.get("bids", [])
    for b in bids:
        b["status"] = "won" if b["vendor_id"] == vendor_id else "lost"
    await db.tenders.update_one(
        {"id": tid},
        {"$set": {"status": "awarded", "awarded_vendor_id": vendor_id, "bids": bids}},
    )
    return {"ok": True}


# ---------- Dashboard ----------
@router.get("/dashboard/budget-forecast")
async def budget_forecast(user=Depends(get_current_active_user)):
    """Per-budget projection: average monthly burn from last 90d PRs → projected exhaust date."""
    from datetime import datetime, timedelta, timezone
    db = get_db()
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=90)).isoformat()
    budgets = await db.budgets.find({"status": "approved"}, {"_id": 0}).to_list(1000)
    depts = {d["id"]: d.get("name") for d in await db.departments.find({}, {"_id": 0}).to_list(500)}
    products = {p["id"]: p.get("name") for p in await db.products.find({}, {"_id": 0}).to_list(2000)}
    result = []
    for b in budgets:
        prs = await db.prs.find({
            "department_id": b["department_id"],
            "status": {"$in": ["approved", "converted_to_po"]},
            "created_at": {"$gte": cutoff},
        }, {"_id": 0}).to_list(2000)
        # Attribute PR consumption to this budget via budget_map
        recent_burn = 0.0
        for pr in prs:
            bm = pr.get("budget_map") or {}
            if b["id"] in bm:
                recent_burn += float(bm[b["id"]])
        avg_monthly_burn = recent_burn / 3.0 if recent_burn else 0.0
        available = float(b["amount"]) - float(b.get("used_amount") or 0)
        days_to_exhaust = None
        projected_date = None
        warning = None
        if avg_monthly_burn > 0 and available > 0:
            days_to_exhaust = int((available / avg_monthly_burn) * 30)
            projected_date = (now + timedelta(days=days_to_exhaust)).date().isoformat()
            if days_to_exhaust <= 30:
                warning = f"⚠️ Diprediksi habis dalam {days_to_exhaust} hari"
        elif available <= 0:
            warning = "❌ Budget sudah habis"
        result.append({
            "budget_id": b["id"],
            "department": depts.get(b["department_id"], "-"),
            "product": products.get(b.get("product_id"), "SEMUA") if b.get("product_id") else "SEMUA",
            "period": b.get("period"),
            "amount": float(b["amount"]),
            "used_amount": float(b.get("used_amount") or 0),
            "available": available,
            "avg_monthly_burn": avg_monthly_burn,
            "days_to_exhaust": days_to_exhaust,
            "projected_exhaust_date": projected_date,
            "warning": warning,
        })
    return result


# ---------- Vendor Rating ----------
class RateIn(BaseModel):
    rating: int  # 1-5
    note: Optional[str] = None


@router.post("/pos/{po_id}/rate")
async def rate_po(po_id: str, payload: RateIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement", "warehouse"):
        raise HTTPException(403, "Not allowed")
    if not (1 <= payload.rating <= 5):
        raise HTTPException(400, "Rating harus 1-5")
    db = get_db()
    po = await db.pos.find_one({"id": po_id})
    if not po:
        raise HTTPException(404, "PO not found")
    if po.get("status") != "completed":
        raise HTTPException(400, "Vendor hanya dapat dinilai setelah PO completed")
    entry = {
        "po_id": po_id,
        "po_number": po.get("po_number"),
        "rating": payload.rating,
        "note": payload.note,
        "by": user["id"],
        "by_name": user["name"],
        "at": now_iso(),
    }
    # Push rating and recompute avg
    await db.vendors.update_one(
        {"id": po["vendor_id"]},
        {"$pull": {"ratings": {"po_id": po_id}}},
    )
    await db.vendors.update_one(
        {"id": po["vendor_id"]},
        {"$push": {"ratings": entry}},
    )
    v = await db.vendors.find_one({"id": po["vendor_id"]})
    ratings = v.get("ratings") or []
    avg = sum(r["rating"] for r in ratings) / len(ratings) if ratings else 0
    await db.vendors.update_one({"id": po["vendor_id"]}, {"$set": {"avg_rating": round(avg, 2), "ratings_count": len(ratings)}})
    await db.pos.update_one({"id": po_id}, {"$set": {"vendor_rating": payload.rating, "vendor_rating_note": payload.note}})
    return {"ok": True, "avg_rating": round(avg, 2), "count": len(ratings)}


# ---------- Dashboard stats (original) ----------
@router.get("/dashboard/stats")
async def dashboard_stats(user=Depends(get_current_active_user)):
    db = get_db()
    pr_pending = await db.prs.count_documents({"status": "pending_approval"})
    pr_approved = await db.prs.count_documents({"status": "approved"})
    po_pending = await db.pos.count_documents({"status": "pending_approval"})
    po_total = await db.pos.count_documents({})
    tender_open = await db.tenders.count_documents({"status": "open"})
    vendor_pending = await db.vendors.count_documents({"status": "pending_approval"})
    budgets = await db.budgets.find({"status": "approved"}, {"_id": 0}).to_list(1000)
    total_budget = sum(b.get("amount", 0) for b in budgets)
    total_used = sum(b.get("used_amount", 0) for b in budgets)
    return {
        "pr_pending": pr_pending,
        "pr_approved": pr_approved,
        "po_pending": po_pending,
        "po_total": po_total,
        "tender_open": tender_open,
        "vendor_pending": vendor_pending,
        "budget_total": total_budget,
        "budget_used": total_used,
        "budget_available": total_budget - total_used,
    }
