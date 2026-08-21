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
    invoice_id: Optional[str] = None
    # Header
    nomor_pengajuan: Optional[str] = None
    nomor_pendaftaran: Optional[str] = None
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
    supplier_address: Optional[str] = None
    supplier_country: Optional[str] = None
    shipper: Optional[str] = None
    owner: Optional[str] = None
    importer_npwp: Optional[str] = None
    importer_name: Optional[str] = None
    importer_address: Optional[str] = None
    owner_npwp: Optional[str] = None
    owner_name: Optional[str] = None
    owner_address: Optional[str] = None
    no_izin_tpb: Optional[str] = None
    nib: Optional[str] = None
    fasilitas_impor: Optional[str] = None
    surat_keputusan: Optional[str] = None
    lc_no: Optional[str] = None
    npwp_ppjk: Optional[str] = None
    nama_ppjk: Optional[str] = None
    np_ppjk: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    currency: str = "USD"
    rate: float = 0
    price_type: Optional[str] = None
    value: float = 0
    fob: float = 0
    cif: float = 0
    cif_idr: float = 0
    value_added: float = 0
    discount: float = 0
    freight: float = 0
    insurance_type: Optional[str] = None
    insurance_value: float = 0
    kena_pajak: Optional[str] = None
    bruto: float = 0
    netto: float = 0
    jumlah_kemasan: Optional[str] = None
    jenis_kemasan: Optional[str] = None
    merk_kemasan: Optional[str] = None
    bm_ditangguhkan: float = 0
    bmt_dibebaskan: float = 0
    cukai_tidak_dipungut: float = 0
    ppn_tidak_dipungut: float = 0
    ppnbm_tidak_dipungut: float = 0
    pph_tidak_dipungut: float = 0
    nama_penanda_tangan: Optional[str] = None
    jabatan_penanda_tangan: Optional[str] = None
    # Detail items
    items: List[dict] = []       # {seri, kode_barang, product_id, hs_code, kategori, qty, unit, unit_price, ...}
    # Documents (RKSP, B/L, PL, Invoice, etc)
    documents: List[dict] = []    # {tipe_dok, uraian_fasilitas, uraian_dokumen, nomor_dokumen, tanggal_dokumen, memo}
    # Petikemas
    petikemas: List[dict] = []    # {seri, jenis, tipe, ukuran, nomor, note}
    notes: Optional[str] = None


class GenerateFromPOIn(BaseModel):
    po_id: str


def _bc_type_to_key(bc_type: str) -> str:
    mapping = {
        "BC 2.0": "bc20",
        "BC 2.3": "bc23",
        "BC 2.6.2": "bc262",
        "BC 2.7": "bc27",
        "BC 4.0": "bc40",
    }
    if bc_type not in mapping:
        raise HTTPException(400, f"bc_type harus salah satu dari: {BC_TYPES}")
    return mapping[bc_type]


async def _build_customs_payload_from_po(db, *, po_id: str, bc_type: str, user: dict) -> dict:
    po = await db.pos.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO not found")
    if po.get("po_type") != "BONDED":
        raise HTTPException(400, "Hanya PO Bonded yang dapat membuat dokumen kepabeanan")

    vendor = await db.vendors.find_one({"id": po["vendor_id"]}, {"_id": 0}) or {}
    inv = await db.invoices.find_one({"po_id": po_id}, {"_id": 0})
    company = await db.company_settings.find_one({"id": "singleton-company"}, {"_id": 0}) or {}
    outgoing_profile = d.get("bc_type") in ("BC 2.7", "BC 4.0")
    tujuan_label = "PENGELUARAN BARANG" if outgoing_profile else "KAWASAN BERIKAT"
    tujuan_value = d.get("tujuan_tpb") or tujuan_label
    hs_map = {h["id"]: h.get("code") for h in await db.hs_codes.find({}, {"_id": 0}).to_list(1000)}
    prod_map = {p["id"]: p for p in await db.products.find({}, {"_id": 0}).to_list(2000)}

    outgoing_profile = bc_type in ("BC 2.7", "BC 4.0")
    item_category = "BARANG DARI TPB" if outgoing_profile else "BARANG UNTUK DITIMBUN"
    tujuan_tpb = "PENGELUARAN BARANG" if outgoing_profile else "KAWASAN BERIKAT"

    items = []
    for index, item in enumerate(po.get("items", []), 1):
        product = prod_map.get(item.get("product_id")) or {}
        qty = float(item.get("qty") or 0)
        items.append({
            "seri": index,
            "kode_barang": product.get("code") or "",
            "product_id": item.get("product_id"),
            "deskripsi": product.get("name"),
            "hs_code": hs_map.get(product.get("hs_code_id")) or "",
            "kategori": item_category,
            "qty": qty,
            "unit": product.get("unit") or "PCS",
            "unit_price": item.get("price"),
            "amount": item.get("subtotal"),
            "netto": qty,
            "bruto": qty,
        })

    payload = {
        "po_id": po_id,
        "invoice_id": inv.get("id") if inv else None,
        "nomor_pengajuan": gen_number("BC23").replace("BC23-", ""),
        "nomor_pendaftaran": "",
        "invoice_no": inv.get("invoice_number") if inv else None,
        "invoice_date": inv.get("created_at", "")[:10] if inv else None,
        "supplier": vendor.get("company_name"),
        "supplier_address": vendor.get("address"),
        "supplier_country": vendor.get("country") or "",
        "shipper": vendor.get("company_name"),
        "importer_npwp": company.get("npwp") or "",
        "importer_name": company.get("name") or "",
        "importer_address": company.get("address") or "",
        "owner_npwp": company.get("npwp") or "",
        "owner_name": company.get("name") or "",
        "owner_address": company.get("address") or "",
        "fasilitas_impor": "KAWASAN BERIKAT",
        "tujuan_tpb": tujuan_tpb,
        "currency": po.get("currency", "IDR"),
        "fob": float(po.get("untaxed_amount") or po.get("total") or 0),
        "freight": 0,
        "insurance_value": 0,
        "cif": float(po.get("amount_total") or po.get("total") or 0),
        "rate": float(po.get("exchange_rate") or 1),
        "cif_idr": float(po.get("amount_total_idr") or po.get("amount_total") or po.get("total") or 0),
        "value": po.get("amount_total") or po.get("total"),
        "bruto": sum(float(item.get("bruto") or 0) for item in items),
        "netto": sum(float(item.get("netto") or 0) for item in items),
        "jumlah_kemasan": "",
        "jenis_kemasan": "",
        "merk_kemasan": "-",
        "nama_penanda_tangan": user.get("name"),
        "jabatan_penanda_tangan": user.get("role", "").upper(),
        "items": items,
        "documents": [
            {
                "tipe_dok": "PO",
                "uraian_dokumen": "Purchase Order",
                "nomor_dokumen": po.get("po_number") or po_id,
                "tanggal_dokumen": (po.get("created_at") or "")[:10],
            },
            {
                "tipe_dok": "INVOICE",
                "uraian_dokumen": "Invoice Vendor",
                "nomor_dokumen": inv.get("invoice_number") if inv else "",
                "tanggal_dokumen": (inv.get("created_at") or "")[:10] if inv else "",
            },
        ],
        "petikemas": [],
    }
    return payload


@router.get("/customs-docs/print-map")
async def customs_print_map(user=Depends(get_current_active_user)):
    """Map backend fields to BC printout sections for UI guidance and QA checks."""
    return {
        "A": {
            "tujuan": "tujuan_tpb",
        },
        "B": {
            "nomor_pengajuan": "nomor_pengajuan",
            "nomor_pendaftaran": "nomor_pendaftaran",
            "register_no": "register_no",
            "register_date": "register_date",
            "supplier": ["supplier", "supplier_address", "supplier_country"],
            "importir": ["importer_npwp", "importer_name", "importer_address", "no_izin_tpb", "nib"],
            "pemilik_barang": ["owner_npwp", "owner_name", "owner_address"],
            "invoice": ["invoice_no", "invoice_date"],
            "fasilitas": ["fasilitas_impor", "surat_keputusan", "lc_no"],
            "bl_awb": ["bl_no", "bl_date"],
            "bc11": ["nomor_bc11", "tanggal_bc11", "nomor_pos", "sub_pos"],
            "ppjk": ["npwp_ppjk", "nama_ppjk", "np_ppjk"],
            "angkut": ["cara_pengangkutan", "sarana_pengangkut", "voy_flight", "kode_bendera"],
            "pelabuhan": ["pel_muat", "pel_transit", "pel_bongkar"],
            "nilai": ["currency", "fob", "freight", "insurance_value", "cif", "cif_idr", "rate"],
            "kemasan_berat": ["jumlah_kemasan", "jenis_kemasan", "merk_kemasan", "bruto", "netto"],
        },
        "F": {
            "items": "items[*]",
            "documents": "documents[*]",
            "pungutan": [
                "bm_ditangguhkan",
                "bmt_dibebaskan",
                "cukai_tidak_dipungut",
                "ppn_tidak_dipungut",
                "ppnbm_tidak_dipungut",
                "pph_tidak_dipungut",
            ],
        },
        "links": {
            "po": "po_id",
            "invoice": "invoice_id",
        },
    }


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
    if payload.po_id:
        po = await db.pos.find_one({"id": payload.po_id}, {"_id": 0, "id": 1})
        if not po:
            raise HTTPException(400, "PO tidak ditemukan")
    if payload.invoice_id:
        invoice = await db.invoices.find_one({"id": payload.invoice_id}, {"_id": 0, "id": 1, "po_id": 1})
        if not invoice:
            raise HTTPException(400, "Invoice tidak ditemukan")
        if payload.po_id and invoice.get("po_id") and invoice.get("po_id") != payload.po_id:
            raise HTTPException(400, "Invoice tidak terkait dengan PO yang dipilih")
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
    prev = await db.customs_docs.find_one({"id": cid}, {"_id": 0}) or {}
    if payload.po_id:
        po = await db.pos.find_one({"id": payload.po_id}, {"_id": 0, "id": 1})
        if not po:
            raise HTTPException(400, "PO tidak ditemukan")
    if payload.invoice_id:
        invoice = await db.invoices.find_one({"id": payload.invoice_id}, {"_id": 0, "id": 1, "po_id": 1})
        if not invoice:
            raise HTTPException(400, "Invoice tidak ditemukan")
        effective_po_id = payload.po_id or prev.get("po_id")
        if effective_po_id and invoice.get("po_id") and invoice.get("po_id") != effective_po_id:
            raise HTTPException(400, "Invoice tidak terkait dengan PO yang dipilih")
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    # Audit: record what changed
    changed = {}
    for k, v in data.items():
        if prev.get(k) != v:
            changed[k] = {"before": prev.get(k), "after": v}
    if changed:
        await db.bc_audit.insert_one({
            "doc_id": cid,
            "by": user["id"],
            "by_name": user["name"],
            "at": now_iso(),
            "changes": changed,
            "action": "update",
        })
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
    payload = await _build_customs_payload_from_po(db, po_id=po_id, bc_type=key_map[bc_type_key], user=user)
    doc = {
        "id": new_id(),
        "doc_number": gen_number(key_map[bc_type_key].replace(" ", "").replace(".", "-")),
        "status": "draft",
        "bc_type": key_map[bc_type_key],
        **payload,
        "created_by": user["id"],
        "created_by_name": user["name"],
        "created_at": now_iso(),
    }
    await db.customs_docs.insert_one(doc)
    return clean(doc)


@router.post("/customs-docs/{cid}/generate-from-po")
async def customs_generate_from_po(cid: str, payload: GenerateFromPOIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement", "warehouse"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    current = await db.customs_docs.find_one({"id": cid}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Not found")

    generated = await _build_customs_payload_from_po(
        db,
        po_id=payload.po_id,
        bc_type=current.get("bc_type") or "BC 2.3",
        user=user,
    )
    await db.customs_docs.update_one(
        {"id": cid},
        {
            "$set": {
                **generated,
                "updated_at": now_iso(),
                "generated_from_po_at": now_iso(),
                "generated_from_po_by": user.get("id"),
            }
        },
    )
    return await db.customs_docs.find_one({"id": cid}, {"_id": 0})



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
    title = ParagraphStyle("t", parent=styles["Title"], fontSize=10.5, alignment=1)
    subtitle = ParagraphStyle("st", parent=styles["Normal"], fontSize=7.5, alignment=1)
    lbl = ParagraphStyle("l", parent=styles["Normal"], textColor=colors.HexColor("#475569"), fontSize=7)
    val = ParagraphStyle("v", parent=styles["Normal"], fontSize=8)
    tiny = ParagraphStyle("tiny", parent=styles["Normal"], fontSize=7)

    titles_by_bc = {
        "BC 2.0": "PEMBERITAHUAN IMPOR BARANG",
        "BC 2.3": "PEMBERITAHUAN IMPOR BARANG UNTUK DITIMBUN DI TEMPAT PENIMBUNAN BERIKAT",
        "BC 2.6.2": "PEMBERITAHUAN PEMASUKAN BARANG IMPOR KE KAWASAN BERIKAT",
        "BC 2.7": "PEMBERITAHUAN PENGELUARAN BARANG DARI TEMPAT PENIMBUNAN BERIKAT",
        "BC 4.0": "PEMBERITAHUAN PABEAN BC 4.0",
    }

    section_caption = {
        "A": "A. KATEGORI/TUJUAN",
        "B": "B. DATA PEMBERITAHUAN",
        "C": "C. PENGESAHAN PENGUSAHA TPB",
        "D": "D. DATA PABEAN",
        "E": "E. UNTUK PEJABAT BEA DAN CUKAI",
        "F": "F. DATA BARANG DAN PUNGUTAN",
    }

    def _fmt_num(value: float) -> str:
        return f"{float(value or 0):,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")

    def _fmt_date(value: Optional[str]) -> str:
        return str(value or "-")[:10]

    company = await db.company_settings.find_one({"id": "singleton-company"}, {"_id": 0}) or {}
    story = [
        Paragraph(titles_by_bc.get(d.get("bc_type"), "PEMBERITAHUAN PABEAN"), title),
        Paragraph(d.get("bc_type") or "BC 2.3", subtitle),
        Spacer(1, 6),
    ]

    summary_box = Table(
        [[
            Paragraph(f"1. Nomor Pengajuan: <b>{d.get('nomor_pengajuan') or d.get('doc_number') or '-'}</b>", val),
            Paragraph(f"2. Nomor Pendaftaran: <b>{d.get('nomor_pendaftaran') or d.get('register_no') or '-'}</b>", val),
            Paragraph(f"3. Tanggal: <b>{_fmt_date(d.get('register_date'))}</b>", val),
        ]],
        colWidths=[7*cm, 6*cm, 5*cm],
    )
    summary_box.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, colors.black), ("PADDING", (0, 0), (-1, -1), 3)]))
    story.append(summary_box)
    story.append(Spacer(1, 4))

    section_head = Table([[Paragraph(section_caption["A"], tiny), Paragraph(section_caption["B"], tiny), Paragraph(section_caption["D"], tiny)]], colWidths=[6*cm, 6*cm, 6*cm])
    section_head.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.3, colors.black),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("PADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(section_head)
    story.append(Spacer(1, 2))

    header_rows = [
        [Paragraph("4. A. Tujuan", lbl), Paragraph(str(tujuan_value), val), Paragraph("5. D. Kantor Pabean", lbl), Paragraph(f"Pengawas: {d.get('kantor_pengawas') or '-'}<br/>Bongkar: {d.get('kantor_bongkar') or '-'}", val)],
        [Paragraph("6. Pemasok", lbl), Paragraph(f"{d.get('supplier') or '-'}<br/>{d.get('supplier_address') or '-'}<br/>{d.get('supplier_country') or '-'}", val), Paragraph("7. Invoice", lbl), Paragraph(f"{d.get('invoice_no') or '-'} / {_fmt_date(d.get('invoice_date'))}", val)],
        [Paragraph("8. Importir/Pengusaha TPB", lbl), Paragraph(f"NPWP: {d.get('importer_npwp') or '-'}<br/>{d.get('importer_name') or company.get('name') or '-'}<br/>{d.get('importer_address') or company.get('address') or '-'}<br/>No Izin TPB: {d.get('no_izin_tpb') or '-'} · NIB: {d.get('nib') or '-'}", val), Paragraph("9. Fasilitas", lbl), Paragraph(f"{d.get('fasilitas_impor') or '-'}<br/>SK: {d.get('surat_keputusan') or '-'}<br/>LC: {d.get('lc_no') or '-'}", val)],
        [Paragraph("10. Pemilik Barang", lbl), Paragraph(f"NPWP: {d.get('owner_npwp') or '-'}<br/>{d.get('owner_name') or '-'}<br/>{d.get('owner_address') or '-'}", val), Paragraph("11. BL/AWB & BC 1.1", lbl), Paragraph(f"BL: {d.get('bl_no') or '-'} ({_fmt_date(d.get('bl_date'))})<br/>BC 1.1: {d.get('nomor_bc11') or '-'} ({_fmt_date(d.get('tanggal_bc11'))})<br/>Pos: {d.get('nomor_pos') or '-'} · Sub Pos: {d.get('sub_pos') or '-'}", val)],
        [Paragraph("12. PPJK", lbl), Paragraph(f"NPWP: {d.get('npwp_ppjk') or '-'}<br/>{d.get('nama_ppjk') or '-'}<br/>NP-PPJK: {d.get('np_ppjk') or '-'}", val), Paragraph("13. Pengangkutan", lbl), Paragraph(f"{d.get('cara_pengangkutan') or '-'}<br/>{d.get('sarana_pengangkut') or '-'} / {d.get('voy_flight') or '-'} / {d.get('kode_bendera') or '-'}", val)],
        [Paragraph("14. Pelabuhan", lbl), Paragraph(f"Muat: {d.get('pel_muat') or '-'}<br/>Transit: {d.get('pel_transit') or '-'}<br/>Bongkar: {d.get('pel_bongkar') or '-'}", val), Paragraph("15. Nilai Pabean", lbl), Paragraph(f"Valuta: {d.get('currency') or '-'}<br/>FOB: {_fmt_num(d.get('fob'))}<br/>Freight: {_fmt_num(d.get('freight'))}<br/>Asuransi: {_fmt_num(d.get('insurance_value'))}<br/>CIF: {_fmt_num(d.get('cif'))}<br/>CIF Rp: {_fmt_num(d.get('cif_idr'))}", val)],
        [Paragraph("16. Kemasan & Berat", lbl), Paragraph(f"Jumlah/Jenis: {d.get('jumlah_kemasan') or '-'} {d.get('jenis_kemasan') or ''}<br/>Merk: {d.get('merk_kemasan') or '-'}<br/>Bruto: {_fmt_num(d.get('bruto'))} KG<br/>Netto: {_fmt_num(d.get('netto'))} KG", val), Paragraph("17. Relasi Dokumen", lbl), Paragraph(f"PO ID: {d.get('po_id') or '-'}<br/>Invoice ID: {d.get('invoice_id') or '-'}", tiny)],
    ]
    ht = Table(header_rows, colWidths=[3*cm, 7.5*cm, 3*cm, 6.5*cm])
    ht.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(ht)
    story.append(Spacer(1, 5))

    story.append(Paragraph(section_caption["F"], val))
    rows = [[
        "18. No",
        "19. Pos Tarif/HS · Kode · Uraian",
        "20. Kategori",
        "21. Negara Asal",
        "22. Tarif/Fasilitas",
        "23. Jumlah/Netto" if not outgoing_profile else "23. Jumlah/Bruto",
        "24. CIF" if not outgoing_profile else "24. Nilai Barang",
    ]]
    for it in d.get("items", []):
        desc = f"HS: {it.get('hs_code') or '-'}<br/>Kode: {it.get('kode_barang') or '-'}<br/>{it.get('deskripsi') or '-'}"
        tarif = f"BM {it.get('bm_tarif') or '-'}<br/>PPH {it.get('pph') or '-'}<br/>PPN {it.get('ppn') or '-'}"
        qty = f"{it.get('qty') or '-'} {it.get('unit') or ''}<br/>{'Bruto' if outgoing_profile else 'Netto'}: {(it.get('bruto') if outgoing_profile else it.get('netto')) or '-'}"
        rows.append([
            str(it.get("seri") or ""),
            Paragraph(desc, tiny),
            str(it.get("kategori") or "-"),
            str(it.get("negara_asal") or "-"),
            Paragraph(tarif, tiny),
            Paragraph(qty, tiny),
            f"{d.get('currency') or 'USD'} {_fmt_num(it.get('amount'))}",
        ])
    tbl = Table(rows, colWidths=[0.8*cm, 6.6*cm, 2.2*cm, 2*cm, 2.8*cm, 2.5*cm, 2.9*cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 5))

    pungutan = [
        ["40. BM Ditangguhkan", _fmt_num(d.get("bm_ditangguhkan")), ""],
        ["41. BMT Dibebaskan", _fmt_num(d.get("bmt_dibebaskan")), ""],
        ["42. Cukai Tidak Dipungut", "", _fmt_num(d.get("cukai_tidak_dipungut"))],
        ["43. PPN Tidak Dipungut", "", _fmt_num(d.get("ppn_tidak_dipungut"))],
        ["44. PPnBM Tidak Dipungut", "", _fmt_num(d.get("ppnbm_tidak_dipungut"))],
        ["45. PPh Tidak Dipungut", "", _fmt_num(d.get("pph_tidak_dipungut"))],
    ]
    tax_rows = [["25. Jenis Pungutan", "Ditangguhkan (Rp)", "Tidak Dipungut (Rp)"]] + pungutan
    tax_rows.append([
        "46. TOTAL",
        _fmt_num((d.get("bm_ditangguhkan") or 0) + (d.get("bmt_dibebaskan") or 0)),
        _fmt_num((d.get("cukai_tidak_dipungut") or 0) + (d.get("ppn_tidak_dipungut") or 0) + (d.get("ppnbm_tidak_dipungut") or 0) + (d.get("pph_tidak_dipungut") or 0)),
    ])
    t2 = Table(tax_rows, colWidths=[8*cm, 5*cm, 5*cm], repeatRows=1)
    t2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.black),
    ]))
    story.append(t2)
    story.append(Spacer(1, 5))

    signer = f"Tempat/Tgl: {company.get('address') or '-'}, {_fmt_date(d.get('register_date'))}<br/>Nama: {d.get('nama_penanda_tangan') or '-'}<br/>Jabatan: {d.get('jabatan_penanda_tangan') or '-'}"
    sign_tbl = Table([
        [Paragraph(section_caption["C"], lbl), Paragraph(section_caption["E"], lbl)],
        [Paragraph(signer, tiny), Paragraph("", tiny)],
    ], colWidths=[9*cm, 9*cm])
    sign_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.3, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(sign_tbl)
    story.append(Spacer(1, 8))

    if d.get("documents"):
        story.append(Paragraph("LEMBAR LAMPIRAN DOKUMEN", subtitle))
        drows = [["Jenis Dokumen", "Nomor Dokumen", "Tanggal Dokumen"]]
        for x in d["documents"]:
            drows.append([str(x.get("tipe_dok", "")), str(x.get("nomor_dokumen", "")), str(x.get("tanggal_dokumen", ""))])
        dtbl = Table(drows, colWidths=[4.5*cm, 8.5*cm, 5*cm], repeatRows=1)
        dtbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.black),
        ]))
        story.append(dtbl)
        story.append(Spacer(1, 8))
    if d.get("petikemas"):
        story.append(Paragraph("LEMBAR LANJUTAN PETIKEMAS", subtitle))
        prows = [["Seri", "Jenis", "Tipe", "Ukuran", "Nomor Petikemas"]]
        for x in d["petikemas"]:
            prows.append([str(x.get("seri","")), str(x.get("jenis_kontainer","")), str(x.get("tipe_kontainer","")), str(x.get("ukuran_kontainer","")), str(x.get("nomor_kontainer",""))])
        ptbl = Table(prows, colWidths=[1*cm, 3*cm, 3*cm, 3*cm, 6.5*cm], repeatRows=1)
        ptbl.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#E2E8F0")),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),8),("GRID",(0,0),(-1,-1),0.3,colors.black)]))
        story.append(ptbl)

    story.append(Spacer(1, 10))
    story.append(Paragraph("Rangkap: Pengusaha TPB / KPPBC Pengawas / Penerima Barang", tiny))
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
