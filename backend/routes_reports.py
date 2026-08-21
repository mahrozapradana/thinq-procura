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
from native_pg_repositories import ReportingNativeRepository

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


def _pr_data():
    repo = ReportingNativeRepository()
    prs = repo.pr_report_rows(2000)
    headers = ["No PR", "Tanggal", "Requester", "Department", "Type", "Bonded", "Status", "Total (IDR)", "Warehouse"]
    rows = [[p[0], p[1], p[2], p[3], p[4], p[5], p[6], _fmt(p[7]), p[8]] for p in prs]
    return headers, rows


def _po_data():
    repo = ReportingNativeRepository()
    pos = repo.po_report_rows(2000)
    headers = ["No PO", "Tanggal", "Type", "Vendor", "Status", "Shipping", "Invoice", "Total (IDR)", "PR IDs"]
    rows = [[p[0], p[1], p[2], p[3], p[4], p[5], p[6], _fmt(p[7]), p[8]] for p in pos]
    return headers, rows


def _budget_data():
    repo = ReportingNativeRepository()
    budgets = repo.budget_report_rows(2000)
    headers = ["Department", "Product", "Periode", "Amount", "Terpakai", "Sisa", "% Terpakai", "Status"]
    rows = [[b[0], b[1], b[2], _fmt(b[3]), _fmt(b[4]), _fmt(b[5]), b[6], b[7]] for b in budgets]
    return headers, rows


@router.get("/prs.csv")
async def prs_csv(user=Depends(get_current_active_user)):
    h, r = _pr_data()
    return _csv_response("purchase_requests.csv", h, r)


@router.get("/prs.pdf")
async def prs_pdf(user=Depends(get_current_active_user)):
    h, r = _pr_data()
    return _pdf_response("purchase_requests.pdf", "Laporan Purchase Requests", h, r)


@router.get("/pos.csv")
async def pos_csv(user=Depends(get_current_active_user)):
    h, r = _po_data()
    return _csv_response("purchase_orders.csv", h, r)


@router.get("/pos.pdf")
async def pos_pdf(user=Depends(get_current_active_user)):
    h, r = _po_data()
    return _pdf_response("purchase_orders.pdf", "Laporan Purchase Orders", h, r)


@router.get("/budgets.csv")
async def budgets_csv(user=Depends(get_current_active_user)):
    h, r = _budget_data()
    return _csv_response("budget_utilization.csv", h, r)


@router.get("/budgets.pdf")
async def budgets_pdf(user=Depends(get_current_active_user)):
    h, r = _budget_data()
    return _pdf_response("budget_utilization.pdf", "Budget Utilization Report", h, r)
