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


async def _resolve_odoo_tax_ids(client: "OdooClient", db, tax_ids: list[str]) -> list[int]:
    """Map local tax_ids -> Odoo account.tax ids by exact name/code match. Cached per call."""
    if not tax_ids:
        return []
    local_taxes = await db.taxes.find({"id": {"$in": tax_ids}}, {"_id": 0}).to_list(50)
    resolved: list[int] = []
    for t in local_taxes:
        needle = t.get("odoo_code") or t.get("name") or t.get("code")
        if not needle:
            continue
        try:
            found = await client.execute(
                "account.tax", "search",
                [[["name", "=", needle], ["type_tax_use", "in", ["purchase", "none"]]]],
                {"limit": 1},
            )
            if not found:
                # fallback: search by description or code
                found = await client.execute("account.tax", "search", [[["name", "ilike", needle]]], {"limit": 1})
            if found:
                resolved.append(found[0])
            else:
                logger.warning(f"odoo tax not found for '{needle}' (local code={t.get('code')})")
        except Exception as e:
            logger.warning(f"odoo tax lookup fail for {needle}: {e}")
    return resolved


async def sync_pos_to_odoo() -> dict:
    db = get_db()
    client = await get_odoo_client()
    pos = await db.pos.find({"status": {"$in": ["approved", "sent", "completed"]}}, {"_id": 0}).to_list(1000)
    if not client:
        return {"ok": True, "mocked": True, "synced_count": len(pos), "message": f"[MOCK] {len(pos)} POs (Odoo belum di-enable)"}
    synced = 0
    tax_map_hits = 0
    for p in pos:
        try:
            vendor = await db.vendors.find_one({"id": p["vendor_id"]}) or {}
            partner = await client.execute("res.partner", "search", [[["email", "=", vendor.get("email", "")]]], {"limit": 1})
            odoo_tax_ids = await _resolve_odoo_tax_ids(client, db, p.get("tax_ids") or [])
            if odoo_tax_ids:
                tax_map_hits += 1
            # Build order lines with tax_ids many2many
            order_lines = []
            for it in (p.get("items") or []):
                prod_search = await client.execute("product.product", "search", [[["default_code", "=", it.get("product_code") or it.get("product_id", "")[:8]]]], {"limit": 1})
                line = (0, 0, {
                    "name": it.get("product_name") or it.get("product_id"),
                    "product_qty": float(it.get("qty") or 0),
                    "price_unit": float(it.get("price") or 0),
                    "taxes_id": [(6, 0, odoo_tax_ids)] if odoo_tax_ids else [(5, 0, 0)],
                })
                if prod_search:
                    line[2]["product_id"] = prod_search[0]
                order_lines.append(line)
            data = {
                "name": p["po_number"],
                "partner_id": partner[0] if partner else False,
                "order_line": order_lines,
            }
            existing = await client.execute("purchase.order", "search", [[["name", "=", p["po_number"]]]], {"limit": 1})
            if existing:
                await client.execute("purchase.order", "write", [existing, {"order_line": order_lines}])
            else:
                await client.execute("purchase.order", "create", [data])
            synced += 1
        except Exception as e:
            logger.warning(f"odoo PO sync fail for {p['po_number']}: {e}")
    return {"ok": True, "mocked": False, "synced_count": synced, "tax_mapped": tax_map_hits, "message": f"Live sync: {synced}/{len(pos)} POs (tax mapped on {tax_map_hits})"}


async def test_odoo() -> dict:
    client = await get_odoo_client()
    if not client:
        return {"ok": False, "message": "Odoo tidak enabled atau kredensial belum lengkap."}
    try:
        return await client.test()
    except Exception as e:
        return {"ok": False, "message": str(e)}
