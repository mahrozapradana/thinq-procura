"""Tax master data (multi-tax / many2many per PO)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_active_user
from db_models import get_db, new_id, now_iso, clean

router = APIRouter(prefix="/api")


class TaxIn(BaseModel):
    code: str  # e.g. PPN11, PPH23
    name: str  # e.g. "PPN 11%"
    rate: float  # percentage 0-100
    tax_type: str = "sales"  # sales | withholding | other
    description: Optional[str] = None
    is_active: bool = True
    odoo_code: Optional[str] = None  # exact Odoo account.tax name for XML-RPC mapping


def _require_admin(user: dict):
    if user["role"] not in ("admin", "procurement", "finance"):
        raise HTTPException(403, "Not allowed")


@router.get("/taxes")
async def list_taxes(active_only: bool = False, user=Depends(get_current_active_user)):
    db = get_db()
    q: dict = {}
    if active_only:
        q["is_active"] = True
    return await db.taxes.find(q, {"_id": 0}).sort("code", 1).to_list(1000)


@router.post("/taxes")
async def create_tax(payload: TaxIn, user=Depends(get_current_active_user)):
    _require_admin(user)
    db = get_db()
    if await db.taxes.find_one({"code": payload.code.upper()}):
        raise HTTPException(400, "Kode pajak sudah ada")
    doc = {
        "id": new_id(),
        "created_at": now_iso(),
        **payload.model_dump(),
        "code": payload.code.upper(),
    }
    await db.taxes.insert_one(doc)
    return clean(doc)


@router.put("/taxes/{tid}")
async def update_tax(tid: str, payload: TaxIn, user=Depends(get_current_active_user)):
    _require_admin(user)
    db = get_db()
    upd = payload.model_dump()
    upd["code"] = payload.code.upper()
    await db.taxes.update_one({"id": tid}, {"$set": upd})
    return await db.taxes.find_one({"id": tid}, {"_id": 0})


@router.delete("/taxes/{tid}")
async def delete_tax(tid: str, user=Depends(get_current_active_user)):
    _require_admin(user)
    db = get_db()
    await db.taxes.delete_one({"id": tid})
    return {"ok": True}


async def compute_tax_breakdown(db, untaxed_amount: float, tax_ids: list[str]) -> dict:
    """Return {tax_breakdown: [...], tax_total: float, grand_total: float, taxes_snapshot: [...]}"""
    if not tax_ids:
        return {"tax_breakdown": [], "tax_total": 0.0, "grand_total": untaxed_amount, "taxes_snapshot": []}
    taxes = await db.taxes.find({"id": {"$in": tax_ids}}, {"_id": 0}).to_list(100)
    breakdown = []
    total_tax = 0.0
    snapshot = []
    for tax in taxes:
        rate = float(tax.get("rate", 0))
        amt = untaxed_amount * rate / 100.0
        breakdown.append({
            "tax_id": tax["id"],
            "code": tax["code"],
            "name": tax["name"],
            "rate": rate,
            "base": untaxed_amount,
            "amount": amt,
            "tax_type": tax.get("tax_type", "sales"),
        })
        snapshot.append({"id": tax["id"], "code": tax["code"], "name": tax["name"], "rate": rate, "tax_type": tax.get("tax_type", "sales")})
        # Withholding taxes reduce the grand total; sales taxes add to it
        if tax.get("tax_type") == "withholding":
            total_tax -= amt
        else:
            total_tax += amt
    return {
        "tax_breakdown": breakdown,
        "tax_total": total_tax,
        "grand_total": untaxed_amount + total_tax,
        "taxes_snapshot": snapshot,
    }
