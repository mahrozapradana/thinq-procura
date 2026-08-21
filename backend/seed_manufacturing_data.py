"""Idempotent seed data for a bonded manufacturing company scenario."""
from __future__ import annotations

import asyncio
from typing import Any

from auth_utils import hash_password
from db_models import get_db, now_iso


async def _upsert_one(collection, query: dict[str, Any], doc: dict[str, Any]) -> str:
    existing = await collection.find_one(query, {"_id": 0})
    if existing:
        await collection.update_one(query, {"$set": doc})
        return "updated"
    await collection.insert_one(doc)
    return "created"


async def seed_company_settings(db) -> dict[str, int]:
    now = now_iso()
    doc = {
        "id": "singleton-company",
        "name": "PT Maju Bersama Manufacturing",
        "is_bonded_zone": True,
        "currency": "IDR",
        "updated_at": now,
    }
    action = await _upsert_one(db.company_settings, {"id": doc["id"]}, doc)
    return {action: 1}


async def seed_divisions_and_departments(db) -> dict[str, int]:
    now = now_iso()

    divisions = [
        {
            "id": "3d2ab789-7fbc-4d89-9ec7-9efb5ce53b01",
            "code": "DIV-OPS",
            "name": "Operations",
            "created_at": now,
        },
        {
            "id": "7ba0cbd2-bc26-421a-a7f5-e8c8af88e802",
            "code": "DIV-SCM",
            "name": "Supply Chain",
            "created_at": now,
        },
        {
            "id": "f3f9f0b5-a6e4-4dea-9d40-236ad1947f03",
            "code": "DIV-FIN",
            "name": "Finance & Compliance",
            "created_at": now,
        },
    ]

    departments = [
        {
            "id": "0db1de5b-d14b-4941-a3f2-30bc4bc8f901",
            "name": "Production Planning",
            "code": "PPIC",
            "manager_name": "Sari Pranoto",
            "division_id": "3d2ab789-7fbc-4d89-9ec7-9efb5ce53b01",
            "division_code": "DIV-OPS",
            "created_at": now,
        },
        {
            "id": "dd20b88a-a61e-46d5-8a0b-fa8688fb7502",
            "name": "Quality Assurance",
            "code": "QA",
            "manager_name": "Budi Hartono",
            "division_id": "3d2ab789-7fbc-4d89-9ec7-9efb5ce53b01",
            "division_code": "DIV-OPS",
            "created_at": now,
        },
        {
            "id": "c5e2db36-ca82-4f2d-9355-b12677771e03",
            "name": "Procurement",
            "code": "PROC",
            "manager_name": "Rina Kurniawati",
            "division_id": "7ba0cbd2-bc26-421a-a7f5-e8c8af88e802",
            "division_code": "DIV-SCM",
            "created_at": now,
        },
        {
            "id": "4ff00144-19dd-4d2b-b9e6-dcc9b27f4f04",
            "name": "Warehouse",
            "code": "WH",
            "manager_name": "Dedi Iskandar",
            "division_id": "7ba0cbd2-bc26-421a-a7f5-e8c8af88e802",
            "division_code": "DIV-SCM",
            "created_at": now,
        },
        {
            "id": "19861324-bdc0-4f4d-940f-7ca4ea96be05",
            "name": "Finance",
            "code": "FIN",
            "manager_name": "Maya Anggraini",
            "division_id": "f3f9f0b5-a6e4-4dea-9d40-236ad1947f03",
            "division_code": "DIV-FIN",
            "created_at": now,
        },
    ]

    created = 0
    updated = 0

    for row in divisions:
        action = await _upsert_one(db.divisions, {"code": row["code"]}, row)
        if action == "created":
            created += 1
        else:
            updated += 1

    for row in departments:
        action = await _upsert_one(db.departments, {"code": row["code"]}, row)
        if action == "created":
            created += 1
        else:
            updated += 1

    return {"created": created, "updated": updated}


async def seed_products(db) -> dict[str, int]:
    now = now_iso()

    categories = [
        {
            "id": "a1f7425c-51f3-497c-9a43-248b66576c01",
            "name": "Raw Material",
            "code": "RAW",
            "description": "Bahan baku produksi",
            "created_at": now,
        },
        {
            "id": "15f84731-8ce4-43fa-9e33-c95f44fb1902",
            "name": "Sparepart",
            "code": "SPR",
            "description": "Suku cadang mesin",
            "created_at": now,
        },
        {
            "id": "cd6398e0-fa4a-4d8d-96e4-97cc8f94bf03",
            "name": "Packaging",
            "code": "PKG",
            "description": "Kemasan produk jadi",
            "created_at": now,
        },
    ]

    hs_codes = [
        {
            "id": "91f486f5-e154-48a7-97fd-8f7b9d71fd01",
            "code": "7208.39.90",
            "description": "Flat-rolled products of iron or non-alloy steel",
            "duty_rate": 5.0,
            "created_at": now,
        },
        {
            "id": "b815bcb5-8f85-4f33-bef5-17d57f71ea02",
            "code": "3901.20.00",
            "description": "Polyethylene having a specific gravity of 0.94 or more",
            "duty_rate": 0.0,
            "created_at": now,
        },
        {
            "id": "8aa91869-ed5d-4c3f-aa44-3cd50898af03",
            "code": "4819.50.00",
            "description": "Other packing containers, including record sleeves",
            "duty_rate": 2.5,
            "created_at": now,
        },
    ]

    products = [
        {
            "id": "8c569f81-7c4f-47c8-bf4e-f89e4aa4e001",
            "code": "RM-STEEL-001",
            "sku": "RM-STEEL-001",
            "name": "Hot Rolled Steel Coil 2.0mm",
            "category_id": "a1f7425c-51f3-497c-9a43-248b66576c01",
            "unit": "KG",
            "hs_code_id": "7208.39.90",
            "default_price": 17250,
            "description": "Bahan baku utama line pressing",
            "is_lot_tracked": True,
            "is_imported": True,
            "is_bonded": True,
            "bonded_type": "KAWASAN_BERIKAT",
            "created_at": now,
        },
        {
            "id": "d5dd2fcd-2bbb-46d3-bf86-3f365438ec02",
            "code": "RM-RESIN-002",
            "sku": "RM-RESIN-002",
            "name": "HDPE Resin Pellets",
            "category_id": "a1f7425c-51f3-497c-9a43-248b66576c01",
            "unit": "KG",
            "hs_code_id": "3901.20.00",
            "default_price": 21500,
            "description": "Resin untuk injection molding",
            "is_lot_tracked": True,
            "is_imported": False,
            "is_bonded": False,
            "bonded_type": "NON_BONDED",
            "created_at": now,
        },
        {
            "id": "9a95cbea-e5f9-4c67-96f9-906c07d49003",
            "code": "SP-BRG-003",
            "sku": "SP-BRG-003",
            "name": "Bearing Set 6205",
            "category_id": "15f84731-8ce4-43fa-9e33-c95f44fb1902",
            "unit": "SET",
            "hs_code_id": "7208.39.90",
            "default_price": 98000,
            "description": "Sparepart preventive maintenance mesin",
            "is_lot_tracked": False,
            "is_imported": True,
            "is_bonded": False,
            "bonded_type": "NON_BONDED",
            "created_at": now,
        },
        {
            "id": "2fd4a106-c6f7-457a-bc1c-a93766f73904",
            "code": "PK-CARTON-004",
            "sku": "PK-CARTON-004",
            "name": "Corrugated Carton Box M",
            "category_id": "cd6398e0-fa4a-4d8d-96e4-97cc8f94bf03",
            "unit": "PCS",
            "hs_code_id": "4819.50.00",
            "default_price": 3500,
            "description": "Kemasan lokal produk jadi",
            "is_lot_tracked": False,
            "is_imported": False,
            "is_bonded": False,
            "bonded_type": "NON_BONDED",
            "created_at": now,
        },
    ]

    created = 0
    updated = 0

    for row in categories:
        action = await _upsert_one(db.categories, {"code": row["code"]}, row)
        if action == "created":
            created += 1
        else:
            updated += 1

    for row in hs_codes:
        action = await _upsert_one(db.hs_codes, {"code": row["code"]}, row)
        if action == "created":
            created += 1
        else:
            updated += 1

    for row in products:
        action = await _upsert_one(db.products, {"code": row["code"]}, row)
        if action == "created":
            created += 1
        else:
            updated += 1

    return {"created": created, "updated": updated}


async def seed_vendors_and_users(db) -> dict[str, int]:
    now = now_iso()

    vendors = [
        {
            "id": "89ff68a3-12a9-40ca-a563-4f6a968f6301",
            "company_name": "PT Baja Global Indonesia",
            "name": "Robby Santoso",
            "email": "vendor.import@bajaglobal.co.id",
            "phone": "+62-21-555-1001",
            "npwp": "01.234.567.8-091.000",
            "address": "Kawasan Industri MM2100, Cibitung",
            "status": "approved",
            "is_importer": True,
            "is_blacklisted": False,
            "avg_rating": 4.6,
            "ratings_count": 18,
            "code": "VDR-IMP-001",
            "created_at": now,
        },
        {
            "id": "6f64460d-c13e-42f3-ab0a-8a9fdbecee02",
            "company_name": "PT Nusantara Kemasindo",
            "name": "Vina Lestari",
            "email": "vendor.local@kemasindo.co.id",
            "phone": "+62-21-555-1002",
            "npwp": "02.345.678.9-092.000",
            "address": "Jl. Raya Serang Km 25, Balaraja",
            "status": "approved",
            "is_importer": False,
            "is_blacklisted": False,
            "avg_rating": 4.3,
            "ratings_count": 11,
            "code": "VDR-LOC-002",
            "created_at": now,
        },
    ]

    users = [
        {
            "id": "7409e194-302f-4d39-b5e5-356f6f403801",
            "email": "admin.manufaktur@example.com",
            "name": "Admin Manufaktur",
            "role": "admin",
            "status": "active",
            "department_id": "19861324-bdc0-4f4d-940f-7ca4ea96be05",
            "approval_limit": 999_999_999_999,
            "password_hash": hash_password("Admin123!"),
            "created_at": now,
        },
        {
            "id": "eb2637f4-61dd-4828-b313-328e52f04002",
            "email": "procurement.manufaktur@example.com",
            "name": "Procurement Lead",
            "role": "procurement",
            "status": "active",
            "department_id": "c5e2db36-ca82-4f2d-9355-b12677771e03",
            "approval_limit": 350_000_000,
            "password_hash": hash_password("Proc123!"),
            "created_at": now,
        },
        {
            "id": "cb6d13fb-ee0d-4473-9649-74fdc7f16103",
            "email": "approver.ops@example.com",
            "name": "Approver Operations",
            "role": "approver",
            "status": "active",
            "department_id": "0db1de5b-d14b-4941-a3f2-30bc4bc8f901",
            "approval_limit": 150_000_000,
            "password_hash": hash_password("Aprv123!"),
            "created_at": now,
        },
        {
            "id": "44d5e1de-c485-49e1-8d2f-db6a53c2d604",
            "email": "requester.ppic@example.com",
            "name": "Requester PPIC",
            "role": "requester",
            "status": "active",
            "department_id": "0db1de5b-d14b-4941-a3f2-30bc4bc8f901",
            "approval_limit": 10_000_000,
            "password_hash": hash_password("Req123!"),
            "created_at": now,
        },
        {
            "id": "f62d3a17-79e5-4396-a2fd-a6f749740305",
            "email": "warehouse.main@example.com",
            "name": "Warehouse Supervisor",
            "role": "warehouse",
            "status": "active",
            "department_id": "4ff00144-19dd-4d2b-b9e6-dcc9b27f4f04",
            "approval_limit": 0,
            "password_hash": hash_password("Whs123!"),
            "created_at": now,
        },
        {
            "id": "ef381a31-f7b2-4a90-b5eb-bf3124667d06",
            "email": "finance.main@example.com",
            "name": "Finance Controller",
            "role": "finance",
            "status": "active",
            "department_id": "19861324-bdc0-4f4d-940f-7ca4ea96be05",
            "approval_limit": 500_000_000,
            "password_hash": hash_password("Fin123!"),
            "created_at": now,
        },
        {
            "id": "da8f3596-1d6a-4a64-898f-c8f06c1cc707",
            "email": "vendor.pic.import@example.com",
            "name": "Vendor PIC Import",
            "role": "vendor",
            "status": "active",
            "vendor_id": "89ff68a3-12a9-40ca-a563-4f6a968f6301",
            "approval_limit": 0,
            "password_hash": hash_password("VendorImp123!"),
            "created_at": now,
        },
        {
            "id": "88ec38c8-aa15-487d-a205-62035f4dc908",
            "email": "vendor.pic.local@example.com",
            "name": "Vendor PIC Local",
            "role": "vendor",
            "status": "active",
            "vendor_id": "6f64460d-c13e-42f3-ab0a-8a9fdbecee02",
            "approval_limit": 0,
            "password_hash": hash_password("VendorLoc123!"),
            "created_at": now,
        },
    ]

    created = 0
    updated = 0

    for row in vendors:
        action = await _upsert_one(db.vendors, {"email": row["email"].lower()}, row)
        if action == "created":
            created += 1
        else:
            updated += 1

    for row in users:
        email = row["email"].lower()
        row["email"] = email
        action = await _upsert_one(db.users, {"email": email}, row)
        if action == "created":
            created += 1
        else:
            updated += 1

    return {"created": created, "updated": updated}


async def run_seed() -> dict[str, dict[str, int]]:
    db = get_db()

    summary: dict[str, dict[str, int]] = {}
    summary["company_settings"] = await seed_company_settings(db)
    summary["org_structure"] = await seed_divisions_and_departments(db)
    summary["product_masters"] = await seed_products(db)
    summary["vendors_and_users"] = await seed_vendors_and_users(db)

    return summary


async def main() -> None:
    summary = await run_seed()

    print("Manufacturing seed completed:")
    for section, values in summary.items():
        created = values.get("created", 0)
        updated = values.get("updated", 0)
        print(f"- {section}: created={created}, updated={updated}")


if __name__ == "__main__":
    asyncio.run(main())
