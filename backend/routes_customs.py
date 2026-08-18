"""Customs (BC) documents, warehouses & locations for bonded/non-bonded receiving."""
from __future__ import annotations

import io
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

from auth_utils import get_current_active_user
from db_models import get_db, new_id, now_iso, clean, gen_number
from odoo_client import get_odoo_client

router = APIRouter(prefix="/api")


BC_TYPES = ["BC 2.0", "BC 2.3", "BC 2.6.2", "BC 2.7", "BC 4.0"]


# ---------- Warehouses ----------
class WarehouseIn(BaseModel):
    name: str
    code: str
    is_bonded: bool = False
    address: Optional[str] = None


@router.get("/warehouses")
async def list_wh(user=Depends(get_current_active_user)):
    return await get_db().warehouses.find({}, {"_id": 0}).to_list(500)


@router.post("/warehouses")
async def create_wh(payload: WarehouseIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement", "warehouse"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    doc = {"id": new_id(), "created_at": now_iso(), **payload.model_dump()}
    await db.warehouses.insert_one(doc)
    return clean(doc)


@router.delete("/warehouses/{wid}")
async def del_wh(wid: str, user=Depends(get_current_active_user)):
    await get_db().warehouses.delete_one({"id": wid}); return {"ok": True}


# ---------- Locations ----------
class LocationIn(BaseModel):
    warehouse_id: str
    name: str
    code: str
    is_bonded_zone: bool = False


@router.get("/locations")
async def list_loc(warehouse_id: Optional[str] = None, user=Depends(get_current_active_user)):
    q = {"warehouse_id": warehouse_id} if warehouse_id else {}
    return await get_db().locations.find(q, {"_id": 0}).to_list(1000)


@router.post("/locations")
async def create_loc(payload: LocationIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement", "warehouse"):
        raise HTTPException(403, "Not allowed")
    doc = {"id": new_id(), "created_at": now_iso(), **payload.model_dump()}
    await get_db().locations.insert_one(doc); return clean(doc)


@router.delete("/locations/{lid}")
async def del_loc(lid: str, user=Depends(get_current_active_user)):
    await get_db().locations.delete_one({"id": lid}); return {"ok": True}


# ---------- Customs (BC) Documents ----------
class CustomsDocIn(BaseModel):
    bc_type: str  # BC 2.0 | BC 2.3 | BC 2.6.2 | BC 2.7 | BC 4.0
    po_id: Optional[str] = None
    # Header
    car: Optional[str] = None
    register_no: Optional[str] = None
    register_date: Optional[str] = None
    kantor_pengawas: Optional[str] = None
    kantor_bongkar: Optional[str] = None
    bl_no: Optional[str] = None
    bl_date: Optional[str] = None
    pel_bongkar: Optional[str] = None
    pel_muat: Optional[str] = None
    pel_transit: Optional[str] = None
    tujuan_tpb: Optional[str] = None
    tempat_penimbunan: Optional[str] = None
    from_kb_pjt: Optional[str] = None
    cara_pengangkutan: Optional[str] = None
    sarana_pengangkut: Optional[str] = None
    voy_flight: Optional[str] = None
    kode_bendera: Optional[str] = None
    tanggal_tiba: Optional[str] = None
    tutup_pu: Optional[str] = None
    nomor_bc11: Optional[str] = None
    tanggal_bc11: Optional[str] = None
    nomor_pos: Optional[str] = None
    sub_pos: Optional[str] = None
    supplier: Optional[str] = None
    shipper: Optional[str] = None
    owner: Optional[str] = None
    currency: str = "USD"
    rate: float = 0
    price_type: Optional[str] = None
    value: float = 0
    value_added: float = 0
    discount: float = 0
    freight: float = 0
    insurance_type: Optional[str] = None
    insurance_value: float = 0
    kena_pajak: Optional[str] = None
    bruto: float = 0
    nama_penanda_tangan: Optional[str] = None
    jabatan_penanda_tangan: Optional[str] = None
    # Detail items
    items: List[dict] = []       # {seri, kode_barang, product_id, hs_code, kategori, qty, unit, unit_price, ...}
    # Documents (RKSP, B/L, PL, Invoice, etc)
    documents: List[dict] = []    # {tipe_dok, uraian_fasilitas, uraian_dokumen, nomor_dokumen, tanggal_dokumen, memo}
    # Petikemas
    petikemas: List[dict] = []    # {seri, jenis, tipe, ukuran, nomor, note}
    notes: Optional[str] = None


@router.get("/customs-docs")
async def list_customs(bc_type: Optional[str] = None, q: Optional[str] = None, page: int = 1, page_size: int = 20, user=Depends(get_current_active_user)):
    db = get_db()
    query: dict = {}
    if bc_type:
        query["bc_type"] = bc_type
    if q:
        query["$or"] = [
            {"register_no": {"$regex": q, "$options": "i"}},
            {"bl_no": {"$regex": q, "$options": "i"}},
            {"car": {"$regex": q, "$options": "i"}},
        ]
    total = await db.customs_docs.count_documents(query)
    page = max(page, 1); page_size = min(max(page_size, 1), 100)
    items = await db.customs_docs.find(query, {"_id": 0}).sort("created_at", -1).skip((page-1)*page_size).limit(page_size).to_list(page_size)
    return {"items": items, "total": total, "page": page, "pages": (total + page_size - 1)//page_size, "page_size": page_size}


@router.get("/customs-docs/{cid}")
async def get_customs(cid: str, user=Depends(get_current_active_user)):
    doc = await get_db().customs_docs.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@router.post("/customs-docs")
async def create_customs(payload: CustomsDocIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement", "warehouse"):
        raise HTTPException(403, "Not allowed")
    if payload.bc_type not in BC_TYPES:
        raise HTTPException(400, f"bc_type harus salah satu dari: {BC_TYPES}")
    db = get_db()
    doc = {
        "id": new_id(),
        "doc_number": gen_number(payload.bc_type.replace(" ", "").replace(".", "-")),
        "status": "draft",
        "created_by": user["id"],
        "created_by_name": user["name"],
        "created_at": now_iso(),
        **payload.model_dump(),
    }
    await db.customs_docs.insert_one(doc)
    return clean(doc)


@router.put("/customs-docs/{cid}")
async def update_customs(cid: str, payload: CustomsDocIn, user=Depends(get_current_active_user)):
    db = get_db()
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.customs_docs.update_one({"id": cid}, {"$set": {**data, "updated_at": now_iso()}})
    return await db.customs_docs.find_one({"id": cid}, {"_id": 0})


@router.post("/customs-docs/{cid}/submit")
async def submit_customs(cid: str, user=Depends(get_current_active_user)):
    await get_db().customs_docs.update_one({"id": cid}, {"$set": {"status": "submitted", "submitted_at": now_iso()}})
    return {"ok": True}


@router.delete("/customs-docs/{cid}")
async def del_customs(cid: str, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    await get_db().customs_docs.delete_one({"id": cid}); return {"ok": True}


# ---------- Create BC draft directly from a Bonded PO ----------
@router.post("/pos/{po_id}/create-customs/{bc_type_key}")
async def customs_from_po(po_id: str, bc_type_key: str, user=Depends(get_current_active_user)):
    """bc_type_key: bc20 | bc23 | bc262 | bc27 | bc40"""
    key_map = {"bc20": "BC 2.0", "bc23": "BC 2.3", "bc262": "BC 2.6.2", "bc27": "BC 2.7", "bc40": "BC 4.0"}
    if bc_type_key not in key_map:
        raise HTTPException(400, "bc_type_key tidak dikenal")
    db = get_db()
    po = await db.pos.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO not found")
    if po.get("po_type") != "BONDED":
        raise HTTPException(400, "Hanya PO Bonded yang dapat membuat dokumen kepabeanan")
    vendor = await db.vendors.find_one({"id": po["vendor_id"]}, {"_id": 0}) or {}
    hs_map = {h["id"]: h.get("code") for h in await db.hs_codes.find({}, {"_id": 0}).to_list(1000)}
    prod_map = {p["id"]: p for p in await db.products.find({}, {"_id": 0}).to_list(2000)}
    items = []
    for i, it in enumerate(po.get("items", []), 1):
        p = prod_map.get(it.get("product_id")) or {}
        items.append({
            "seri": i,
            "kode_barang": p.get("code") or "",
            "product_id": it.get("product_id"),
            "deskripsi": p.get("name"),
            "hs_code": hs_map.get(p.get("hs_code_id")) or "",
            "kategori": "BARANG UNTUK DITIMBUN",
            "qty": it.get("qty"),
            "unit": p.get("unit") or "PCS",
            "unit_price": it.get("price"),
            "amount": it.get("subtotal"),
        })
    doc = {
        "id": new_id(),
        "doc_number": gen_number(key_map[bc_type_key].replace(" ", "").replace(".", "-")),
        "status": "draft",
        "bc_type": key_map[bc_type_key],
        "po_id": po_id,
        "supplier": vendor.get("company_name"),
        "shipper": vendor.get("company_name"),
        "tujuan_tpb": "KAWASAN BERIKAT",
        "currency": po.get("currency", "IDR"),
        "value": po.get("total"),
        "items": items,
        "documents": [],
        "petikemas": [],
        "created_by": user["id"],
        "created_by_name": user["name"],
        "created_at": now_iso(),
    }
    await db.customs_docs.insert_one(doc)
    return clean(doc)



# ---------- BC Print PDF ----------
@router.get("/customs-docs/{cid}/print.pdf")
async def customs_pdf(cid: str, user=Depends(get_current_active_user)):
    db = get_db()
    d = await db.customs_docs.find_one({"id": cid}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1*cm, rightMargin=1*cm, topMargin=1*cm, bottomMargin=1*cm)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("t", parent=styles["Title"], fontSize=14, textColor=colors.HexColor("#0F172A"))
    lbl = ParagraphStyle("l", parent=styles["Normal"], textColor=colors.HexColor("#94A3B8"), fontSize=7)
    val = ParagraphStyle("v", parent=styles["Normal"], fontSize=9)
    company = await db.company_settings.find_one({"id": "singleton-company"}, {"_id": 0}) or {}
    story = [Paragraph(f"<b>{company.get('name','')}</b>", val), Paragraph(f"{d.get('bc_type')} — {d.get('doc_number')}", title), Spacer(1, 6)]
    header_rows = [
        [Paragraph("Register No", lbl), Paragraph(str(d.get("register_no") or "-"), val), Paragraph("Register Date", lbl), Paragraph(str(d.get("register_date") or "-"), val)],
        [Paragraph("CAR", lbl), Paragraph(str(d.get("car") or "-"), val), Paragraph("BL No", lbl), Paragraph(str(d.get("bl_no") or "-"), val)],
        [Paragraph("Kantor Pengawas", lbl), Paragraph(str(d.get("kantor_pengawas") or "-"), val), Paragraph("Kantor Bongkar", lbl), Paragraph(str(d.get("kantor_bongkar") or "-"), val)],
        [Paragraph("Supplier", lbl), Paragraph(str(d.get("supplier") or "-"), val), Paragraph("Shipper", lbl), Paragraph(str(d.get("shipper") or "-"), val)],
        [Paragraph("Tujuan TPB", lbl), Paragraph(str(d.get("tujuan_tpb") or "-"), val), Paragraph("Currency/Rate", lbl), Paragraph(f"{d.get('currency','')} / {d.get('rate',0)}", val)],
        [Paragraph("CIF Value", lbl), Paragraph(f"{d.get('currency','')} {float(d.get('value') or 0):,.2f}", val), Paragraph("Bruto", lbl), Paragraph(str(d.get("bruto") or "-"), val)],
    ]
    ht = Table(header_rows, colWidths=[3*cm, 6*cm, 3*cm, 6.5*cm])
    ht.setStyle(TableStyle([("BOTTOMPADDING", (0,0),(-1,-1), 3), ("VALIGN", (0,0),(-1,-1), "TOP")]))
    story.append(ht); story.append(Spacer(1, 8))
    story.append(Paragraph("<b>Detail Barang</b>", val))
    rows = [["Seri", "Kode", "HS Code", "Qty", "Unit", "Unit Price", "Amount"]]
    for it in d.get("items", []):
        rows.append([str(it.get("seri") or ""), str(it.get("kode_barang") or ""), str(it.get("hs_code") or ""), str(it.get("qty") or ""), str(it.get("unit") or ""), str(it.get("unit_price") or ""), str(it.get("amount") or "")])
    tbl = Table(rows, colWidths=[1*cm, 3.5*cm, 2.5*cm, 1.5*cm, 1.5*cm, 3*cm, 3*cm], repeatRows=1)
    tbl.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#F1F5F9")),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),8),("GRID",(0,0),(-1,-1),0.3,colors.HexColor("#E2E8F0"))]))
    story.append(tbl); story.append(Spacer(1, 8))
    if d.get("documents"):
        story.append(Paragraph("<b>Dokumen Pendukung</b>", val))
        drows = [["Tipe", "Uraian Dokumen", "Nomor", "Tanggal"]]
        for x in d["documents"]:
            drows.append([str(x.get("tipe_dok","")), str(x.get("uraian_dokumen","")), str(x.get("nomor_dokumen","")), str(x.get("tanggal_dokumen",""))])
        dtbl = Table(drows, colWidths=[2*cm, 7*cm, 4*cm, 3.5*cm], repeatRows=1)
        dtbl.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#F1F5F9")),("FONTSIZE",(0,0),(-1,-1),8),("GRID",(0,0),(-1,-1),0.3,colors.HexColor("#E2E8F0"))]))
        story.append(dtbl); story.append(Spacer(1, 8))
    if d.get("petikemas"):
        story.append(Paragraph("<b>Petikemas</b>", val))
        prows = [["Seri", "Jenis", "Tipe", "Ukuran", "Nomor"]]
        for x in d["petikemas"]:
            prows.append([str(x.get("seri","")), str(x.get("jenis_kontainer","")), str(x.get("tipe_kontainer","")), str(x.get("ukuran_kontainer","")), str(x.get("nomor_kontainer",""))])
        ptbl = Table(prows, colWidths=[1*cm, 3*cm, 3*cm, 3*cm, 6.5*cm], repeatRows=1)
        ptbl.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#F1F5F9")),("FONTSIZE",(0,0),(-1,-1),8),("GRID",(0,0),(-1,-1),0.3,colors.HexColor("#E2E8F0"))]))
        story.append(ptbl)
    story.append(Spacer(1, 20))
    story.append(Paragraph(f"{d.get('nama_penanda_tangan') or ''} — {d.get('jabatan_penanda_tangan') or ''}", val))
    pdf.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{d.get("bc_type","BC").replace(" ","")}_{d.get("doc_number")}.pdf"'})


# ---------- BC Sync to Odoo (Landed Cost) ----------
@router.post("/customs-docs/{cid}/sync-odoo")
async def customs_sync_odoo(cid: str, user=Depends(get_current_active_user)):
    db = get_db()
    d = await db.customs_docs.find_one({"id": cid}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    client = await get_odoo_client()
    if not client:
        return {"ok": True, "mocked": True, "message": "Odoo belum enabled — sync di-mock."}
    try:
        freight = float(d.get("freight") or 0)
        insurance = float(d.get("insurance_value") or 0)
        bmt_total = sum(float(it.get("bmt") or 0) for it in d.get("items", []))
        cost_lines = []
        if freight > 0: cost_lines.append([0, 0, {"name": "Freight", "price_unit": freight, "split_method": "by_current_cost_price"}])
        if insurance > 0: cost_lines.append([0, 0, {"name": "Insurance", "price_unit": insurance, "split_method": "by_current_cost_price"}])
        if bmt_total > 0: cost_lines.append([0, 0, {"name": "BMT / Bea Masuk", "price_unit": bmt_total, "split_method": "by_current_cost_price"}])
        landed_id = await client.execute("stock.landed.cost", "create", [{
            "date": (d.get("register_date") or datetime.utcnow().strftime("%Y-%m-%d")),
            "cost_lines": cost_lines,
            "account_journal_id": False,
        }])
        await db.customs_docs.update_one({"id": cid}, {"$set": {"odoo_landed_cost_id": landed_id, "odoo_synced_at": now_iso()}})
        return {"ok": True, "landed_cost_id": landed_id, "cost_lines": len(cost_lines)}
    except Exception as e:
        msg = str(e)[:300]
        if "doesn't exist" in msg or "does not exist" in msg or "unknown" in msg.lower():
            return {"ok": True, "warning": True, "message": f"Modul Odoo untuk landed cost tidak terinstall. Install app 'Purchase Landed Costs' di Odoo Anda. Detail: {msg[:150]}"}
        raise HTTPException(502, f"Odoo sync failed: {msg}")
