"""Cloudflare DNS Wizard — auto-create CNAME for tenant custom domain."""
from __future__ import annotations

from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_active_user
from db_models import get_db, now_iso

router = APIRouter(prefix="/api/settings")


class CloudflareDNSIn(BaseModel):
    api_token: str
    zone_id: str
    subdomain: str  # e.g. "procura"
    target: str  # target CNAME value (preview URL host)
    proxied: bool = True  # Cloudflare orange-cloud for SSL


def _require_admin(user: dict):
    if user["role"] not in ("admin",):
        raise HTTPException(403, "Admin only")


@router.post("/dns-wizard/cloudflare")
async def create_cf_record(payload: CloudflareDNSIn, user=Depends(get_current_active_user)):
    _require_admin(user)
    zone = payload.zone_id
    base = "https://api.cloudflare.com/client/v4"
    headers = {"Authorization": f"Bearer {payload.api_token}", "Content-Type": "application/json"}
    # Fetch zone info to get domain root
    async with httpx.AsyncClient(timeout=15) as client:
        z = await client.get(f"{base}/zones/{zone}", headers=headers)
        if z.status_code != 200:
            raise HTTPException(z.status_code, f"Cloudflare zone fetch failed: {z.text[:200]}")
        zone_data = z.json().get("result", {})
        zone_name = zone_data.get("name")
        if not zone_name:
            raise HTTPException(400, "Zone tidak valid")

        full_name = f"{payload.subdomain}.{zone_name}" if payload.subdomain else zone_name
        # Check existing record
        list_r = await client.get(
            f"{base}/zones/{zone}/dns_records",
            headers=headers,
            params={"type": "CNAME", "name": full_name},
        )
        existing = list_r.json().get("result", []) if list_r.status_code == 200 else []

        body = {
            "type": "CNAME", "name": full_name, "content": payload.target,
            "ttl": 1, "proxied": payload.proxied, "comment": "Procura tenant subdomain (auto)",
        }
        if existing:
            rid = existing[0]["id"]
            r = await client.put(f"{base}/zones/{zone}/dns_records/{rid}", headers=headers, json=body)
        else:
            r = await client.post(f"{base}/zones/{zone}/dns_records", headers=headers, json=body)
        if r.status_code >= 300:
            raise HTTPException(r.status_code, f"Cloudflare CNAME create failed: {r.text[:300]}")

        # Save to company_settings
        db = get_db()
        await db.company_settings.update_one(
            {"id": "singleton-company"},
            {"$set": {
                "custom_domain": full_name,
                "dns_provider": "cloudflare",
                "dns_zone_id": zone,
                "dns_configured_at": now_iso(),
            }},
            upsert=True,
        )
        return {"ok": True, "domain": full_name, "target": payload.target, "proxied": payload.proxied, "ssl": "auto (Cloudflare Universal SSL)"}


@router.post("/dns-wizard/verify")
async def verify_dns(user=Depends(get_current_active_user)):
    """Test if custom_domain resolves. Uses public DoH."""
    _require_admin(user)
    db = get_db()
    cfg = await db.company_settings.find_one({"id": "singleton-company"}, {"custom_domain": 1}) or {}
    domain = cfg.get("custom_domain")
    if not domain:
        raise HTTPException(400, "custom_domain belum di-set")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"https://cloudflare-dns.com/dns-query?name={domain}&type=CNAME", headers={"accept": "application/dns-json"})
        data = r.json() if r.status_code == 200 else {}
    answers = data.get("Answer", [])
    return {"domain": domain, "resolved": bool(answers), "answers": answers, "status": data.get("Status")}
