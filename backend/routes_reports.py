"""CSV & PDF export endpoints for PR, PO, and Budget utilization."""
from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

from auth_utils import get_current_active_user
from db_models import get_db

router = APIRouter(prefix="/api/reports")


def _csv_response(filename: str, headers: list[str], rows: list[list]) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    w.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _pdf_response(filename: str, title: str, headers: list[str], rows: list[list]) -> StreamingResponse:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=1.2 * cm, rightMargin=1.2 * cm, topMargin=1.2 * cm, bottomMargin=1.2 * cm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"<b>{title}</b>", styles["Title"]),
        Paragraph(datetime.now().strftime("Generated %Y-%m-%d %H:%M"), styles["Normal"]),
        Spacer(1, 12),
    ]
    data = [headers] + [[str(c) for c in r] for r in rows]
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(table)
    doc.build(story)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _fmt(n):
    try:
        return f"{float(n):,.0f}"
    except Exception:
        return str(n)


async def _pr_data(db):
    prs = await db.prs.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    depts = {d["id"]: d["name"] for d in await db.departments.find({}, {"_id": 0}).to_list(500)}
    headers = ["No PR", "Tanggal", "Requester", "Department", "Type", "Bonded", "Status", "Total (IDR)", "Warehouse"]
    rows = [[
        p.get("pr_number"), (p.get("created_at") or "")[:10], p.get("requester_name"),
        depts.get(p.get("department_id"), "-"), p.get("procurement_type"),
        "Yes" if p.get("is_bonded") else "No", p.get("status"), _fmt(p.get("total")), p.get("warehouse_status") or "-",
    ] for p in prs]
    return headers, rows


async def _po_data(db):
    pos = await db.pos.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    vendors = {v["id"]: v.get("company_name") for v in await db.vendors.find({}, {"_id": 0}).to_list(1000)}
    headers = ["No PO", "Tanggal", "Type", "Vendor", "Status", "Shipping", "Invoice", "Total (IDR)", "PR IDs"]
    rows = [[
        p.get("po_number"), (p.get("created_at") or "")[:10], p.get("po_type"),
        vendors.get(p.get("vendor_id"), p.get("vendor_id")), p.get("status"),
        p.get("shipping_status"), p.get("invoice_status"), _fmt(p.get("total")), ", ".join(p.get("pr_ids") or []),
    ] for p in pos]
    return headers, rows


async def _budget_data(db):
    budgets = await db.budgets.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    depts = {d["id"]: d["name"] for d in await db.departments.find({}, {"_id": 0}).to_list(500)}
    products = {p["id"]: p["name"] for p in await db.products.find({}, {"_id": 0}).to_list(2000)}
    headers = ["Department", "Product", "Periode", "Amount", "Terpakai", "Sisa", "% Terpakai", "Status"]
    rows = []
    for b in budgets:
        amt = float(b.get("amount") or 0)
        used = float(b.get("used_amount") or 0)
        pct = (used / amt * 100.0) if amt else 0
        rows.append([
            depts.get(b.get("department_id"), "-"),
            products.get(b.get("product_id"), "SEMUA") if b.get("product_id") else "SEMUA",
            b.get("period"),
            _fmt(amt), _fmt(used), _fmt(amt - used), f"{pct:.1f}%", b.get("status"),
        ])
    return headers, rows


@router.get("/prs.csv")
async def prs_csv(user=Depends(get_current_active_user)):
    h, r = await _pr_data(get_db())
    return _csv_response("purchase_requests.csv", h, r)


@router.get("/prs.pdf")
async def prs_pdf(user=Depends(get_current_active_user)):
    h, r = await _pr_data(get_db())
    return _pdf_response("purchase_requests.pdf", "Laporan Purchase Requests", h, r)


@router.get("/pos.csv")
async def pos_csv(user=Depends(get_current_active_user)):
    h, r = await _po_data(get_db())
    return _csv_response("purchase_orders.csv", h, r)


@router.get("/pos.pdf")
async def pos_pdf(user=Depends(get_current_active_user)):
    h, r = await _po_data(get_db())
    return _pdf_response("purchase_orders.pdf", "Laporan Purchase Orders", h, r)


@router.get("/budgets.csv")
async def budgets_csv(user=Depends(get_current_active_user)):
    h, r = await _budget_data(get_db())
    return _csv_response("budget_utilization.csv", h, r)


@router.get("/budgets.pdf")
async def budgets_pdf(user=Depends(get_current_active_user)):
    h, r = await _budget_data(get_db())
    return _pdf_response("budget_utilization.pdf", "Budget Utilization Report", h, r)
