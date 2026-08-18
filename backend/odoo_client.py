"""Odoo XML-RPC integration. Reads config from db.odoo_settings; if disabled, returns mocked=True."""
from __future__ import annotations

import asyncio
import logging
import xmlrpc.client
from typing import Optional

from db_models import get_db

logger = logging.getLogger("epr.odoo")

SETTINGS_ID = "singleton-company"


class OdooClient:
    def __init__(self, url: str, db_name: str, username: str, api_key: str):
        self.url = url.rstrip("/")
        self.db = db_name
        self.username = username
        self.api_key = api_key
        self.uid: Optional[int] = None

    def _sync_authenticate(self) -> int:
        common = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/common", allow_none=True)
        uid = common.authenticate(self.db, self.username, self.api_key, {})
        if not uid:
            raise RuntimeError("Odoo authentication failed")
        return uid

    def _sync_execute(self, model: str, method: str, args: list, kwargs: dict | None = None) -> list | dict | int:
        if self.uid is None:
            self.uid = self._sync_authenticate()
        models = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/object", allow_none=True)
        return models.execute_kw(self.db, self.uid, self.api_key, model, method, args, kwargs or {})

    async def execute(self, model: str, method: str, args: list, kwargs: dict | None = None):
        return await asyncio.to_thread(self._sync_execute, model, method, args, kwargs)

    async def test(self) -> dict:
        uid = await asyncio.to_thread(self._sync_authenticate)
        return {"ok": True, "uid": uid, "db": self.db, "url": self.url}


async def get_odoo_client() -> Optional[OdooClient]:
    db = get_db()
    cfg = await db.odoo_settings.find_one({"id": SETTINGS_ID}, {"_id": 0})
    if not cfg or not cfg.get("enabled"):
        return None
    if not (cfg.get("odoo_url") and cfg.get("odoo_db") and cfg.get("odoo_username") and cfg.get("odoo_api_key")):
        return None
    return OdooClient(cfg["odoo_url"], cfg["odoo_db"], cfg["odoo_username"], cfg["odoo_api_key"])


async def sync_products_to_odoo() -> dict:
    db = get_db()
    client = await get_odoo_client()
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    if not client:
        return {"ok": True, "mocked": True, "synced_count": len(products), "message": f"[MOCK] {len(products)} products (Odoo belum di-enable)"}
    synced = 0
    for p in products:
        try:
            existing = await client.execute("product.product", "search", [[["default_code", "=", p["code"]]]], {"limit": 1})
            data = {
                "name": p["name"],
                "default_code": p["code"],
                "list_price": float(p.get("default_price") or 0),
                "uom_name": p.get("unit") or "PCS",
            }
            if existing:
                await client.execute("product.product", "write", [existing, data])
            else:
                await client.execute("product.product", "create", [data])
            synced += 1
        except Exception as e:
            logger.warning(f"odoo product sync fail for {p['code']}: {e}")
    await db.odoo_settings.update_one({"id": SETTINGS_ID}, {"$set": {"last_sync": None}}, upsert=True)
    return {"ok": True, "mocked": False, "synced_count": synced, "message": f"Live sync: {synced}/{len(products)} products"}


async def sync_vendors_to_odoo() -> dict:
    db = get_db()
    client = await get_odoo_client()
    vendors = await db.vendors.find({"status": "approved"}, {"_id": 0}).to_list(1000)
    if not client:
        return {"ok": True, "mocked": True, "synced_count": len(vendors), "message": f"[MOCK] {len(vendors)} vendors (Odoo belum di-enable)"}
    synced = 0
    for v in vendors:
        try:
            existing = await client.execute("res.partner", "search", [[["email", "=", v["email"]], ["supplier_rank", ">", 0]]], {"limit": 1})
            data = {
                "name": v.get("company_name") or v.get("name"),
                "email": v["email"],
                "phone": v.get("phone") or "",
                "street": v.get("address") or "",
                "vat": v.get("npwp") or "",
                "supplier_rank": 1,
                "company_type": "company",
            }
            if existing:
                await client.execute("res.partner", "write", [existing, data])
            else:
                await client.execute("res.partner", "create", [data])
            synced += 1
        except Exception as e:
            logger.warning(f"odoo vendor sync fail for {v['email']}: {e}")
    return {"ok": True, "mocked": False, "synced_count": synced, "message": f"Live sync: {synced}/{len(vendors)} vendors"}


async def sync_pos_to_odoo() -> dict:
    db = get_db()
    client = await get_odoo_client()
    pos = await db.pos.find({"status": {"$in": ["approved", "sent", "completed"]}}, {"_id": 0}).to_list(1000)
    if not client:
        return {"ok": True, "mocked": True, "synced_count": len(pos), "message": f"[MOCK] {len(pos)} POs (Odoo belum di-enable)"}
    synced = 0
    for p in pos:
        try:
            partner = await client.execute("res.partner", "search", [[["email", "=", (await db.vendors.find_one({"id": p["vendor_id"]}) or {}).get("email", "")]]], {"limit": 1})
            data = {
                "name": p["po_number"],
                "partner_id": partner[0] if partner else False,
                "amount_total": p.get("total", 0),
            }
            await client.execute("purchase.order", "create", [data])
            synced += 1
        except Exception as e:
            logger.warning(f"odoo PO sync fail for {p['po_number']}: {e}")
    return {"ok": True, "mocked": False, "synced_count": synced, "message": f"Live sync: {synced}/{len(pos)} POs"}


async def test_odoo() -> dict:
    client = await get_odoo_client()
    if not client:
        return {"ok": False, "message": "Odoo tidak enabled atau kredensial belum lengkap."}
    try:
        return await client.test()
    except Exception as e:
        return {"ok": False, "message": str(e)}
