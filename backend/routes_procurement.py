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


@router.get("/prs")
async def list_prs(user=Depends(get_current_active_user)):
    db = get_db()
    q: dict = {}
    if user["role"] == "requester":
        q["requester_id"] = user["id"]
    return await db.prs.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


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


@router.get("/pos")
async def list_pos(user=Depends(get_current_active_user)):
    db = get_db()
    q: dict = {}
    if user["role"] == "vendor":
        q["vendor_id"] = user.get("vendor_id")
    return await db.pos.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


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

    wf = await _pick_workflow(db, "PO", None)
    steps = _levels_for_amount(wf, total)
    doc = {
        "id": new_id(),
        "po_number": gen_number("PO"),
        "po_type": payload.po_type,
        "vendor_id": payload.vendor_id,
        "pr_ids": payload.pr_ids,
        "items": merged_items,
        "total": total,
        "currency": "IDR",
        "status": "pending_approval" if steps else "approved",
        "approvals": steps,
        "current_level": 1 if steps else 0,
        "delivery_date": payload.delivery_date,
        "shipping_status": "pending",
        "invoice_status": "pending",
        "notes": payload.notes,
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
    return {"ok": True}


# ---------- Tenders ----------
class TenderItemIn(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    qty: float
    specs: Optional[str] = None


class TenderIn(BaseModel):
    title: str
    description: Optional[str] = None
    items: List[TenderItemIn]
    terms: Optional[str] = None
    deadline: Optional[str] = None
    invited_vendor_ids: List[str] = Field(default_factory=list)  # empty = open
    is_bonded: bool = False


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
    return doc


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
