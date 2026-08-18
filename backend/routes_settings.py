"""Company settings + Odoo integration (mocked)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_active_user
from db_models import get_db, new_id, now_iso

router = APIRouter(prefix="/api")


COMPANY_ID = "singleton-company"


class CompanySettingsIn(BaseModel):
    name: str
    is_bonded_zone: bool = True
    currency: str = "IDR"
    address: Optional[str] = None
    npwp: Optional[str] = None
    email: Optional[str] = None


@router.get("/settings/company")
async def get_company(user=Depends(get_current_active_user)):
    db = get_db()
    doc = await db.company_settings.find_one({"id": COMPANY_ID}, {"_id": 0})
    if not doc:
        doc = {
            "id": COMPANY_ID,
            "name": "PT Sample Kawasan Berikat",
            "is_bonded_zone": True,
            "currency": "IDR",
            "address": None,
            "npwp": None,
            "email": None,
            "created_at": now_iso(),
        }
        await db.company_settings.insert_one(doc)
        doc.pop("_id", None)
    return doc


@router.put("/settings/company")
async def update_company(payload: CompanySettingsIn, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    db = get_db()
    await db.company_settings.update_one(
        {"id": COMPANY_ID},
        {"$set": {**payload.model_dump(), "updated_at": now_iso()}},
        upsert=True,
    )
    return await db.company_settings.find_one({"id": COMPANY_ID}, {"_id": 0})


class OdooSettingsIn(BaseModel):
    odoo_url: Optional[str] = None
    odoo_db: Optional[str] = None
    odoo_username: Optional[str] = None
    odoo_api_key: Optional[str] = None
    enabled: bool = False


@router.get("/settings/odoo")
async def get_odoo(user=Depends(get_current_active_user)):
    db = get_db()
    doc = await db.odoo_settings.find_one({"id": COMPANY_ID}, {"_id": 0})
    if not doc:
        doc = {
            "id": COMPANY_ID,
            "odoo_url": "",
            "odoo_db": "",
            "odoo_username": "",
            "odoo_api_key": "",
            "enabled": False,
            "last_sync": None,
        }
    return doc


@router.put("/settings/odoo")
async def update_odoo(payload: OdooSettingsIn, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    db = get_db()
    await db.odoo_settings.update_one(
        {"id": COMPANY_ID},
        {"$set": {**payload.model_dump(), "updated_at": now_iso()}},
        upsert=True,
    )
    return await db.odoo_settings.find_one({"id": COMPANY_ID}, {"_id": 0})


@router.post("/odoo/sync/products")
async def sync_products(user=Depends(get_current_active_user)):
    """MOCKED: pretend to push products to Odoo."""
    db = get_db()
    n = await db.products.count_documents({})
    await db.odoo_settings.update_one({"id": COMPANY_ID}, {"$set": {"last_sync": now_iso()}}, upsert=True)
    return {"ok": True, "mocked": True, "synced_count": n, "message": f"Simulasi push {n} products ke Odoo"}


@router.post("/odoo/sync/vendors")
async def sync_vendors(user=Depends(get_current_active_user)):
    db = get_db()
    n = await db.vendors.count_documents({"status": "approved"})
    await db.odoo_settings.update_one({"id": COMPANY_ID}, {"$set": {"last_sync": now_iso()}}, upsert=True)
    return {"ok": True, "mocked": True, "synced_count": n, "message": f"Simulasi push {n} vendors ke Odoo"}


@router.post("/odoo/sync/pos")
async def sync_pos(user=Depends(get_current_active_user)):
    db = get_db()
    n = await db.pos.count_documents({"status": {"$in": ["approved", "sent", "completed"]}})
    await db.odoo_settings.update_one({"id": COMPANY_ID}, {"$set": {"last_sync": now_iso()}}, upsert=True)
    return {"ok": True, "mocked": True, "synced_count": n, "message": f"Simulasi push {n} POs ke Odoo"}
