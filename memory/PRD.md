# E-Procurement Application - PRD

## Original Problem Statement
Membuat aplikasi e-procurement lengkap dari Purchase Request sampai Purchase Order, dengan tracking per barang. Fitur: PR bisa di-merge menjadi PO, PR per department, approval dinamis per department dengan limit nominal per jenjang, budget per department atau per barang (dengan approval), pemisahan PO Lokal vs PO Bonded (Kawasan Berikat), tender & bidding vendor, vendor self-registration, penerimaan barang, retur barang, dokumen LS/kepabeanan, integrasi Odoo (mocked untuk MVP).

## User Choices
- Auth: JWT-based custom auth (email + password) untuk user internal & vendor
- Odoo integration: Mocked/stub untuk MVP
- Kawasan berikat: aktif secara default (toggle di company settings)
- Design: clean, professional, corporate ERP style

## User Personas
- **Admin/Owner**: kelola settings, workflow, users, master data (mahrozapradana46@gmail.com)
- **Procurement**: kelola vendor, tender, PO, master data
- **Requester**: buat PR
- **Approver**: approve PR/PO/Budget sesuai jenjang
- **Warehouse**: goods receipt & return
- **Finance**: kelola invoice
- **Vendor**: self-register, bidding tender, lihat PO, submit invoice & LS document

## Architecture
- **Backend**: FastAPI + Motor (MongoDB) + JWT (httpOnly cookies + Bearer fallback) + bcrypt
- **Frontend**: React 19 + React Router 7 + shadcn/ui + Tailwind + lucide icons + sonner
- **Database**: MongoDB (uuid string IDs, ISO datetime strings)

## Implemented (Iteration 1 – 2026-02-14)
### Backend
- Auth: login, logout, /me, admin auto-seed (mahrozapradana46@gmail.com / admin123)
- Master data: Products, Categories, Departments, HS Codes, Vendors, Users
- Vendor: self-registration + approval workflow (creates portal account)
- Approval Workflows: multi-level, per-role, with amount limits, per-department override
- Budgets: per department + per product with approval flow, auto-consume on PR approval
- Purchase Requests: create with budget validation, multi-level approval, DIRECT/TENDER, LOCAL/BONDED
- Purchase Orders: merge multiple PRs → PO, LOCAL vs BONDED types, approval, send
- Tenders: create + open/close/award, invited vendors or open, vendor bidding
- Inventory: Goods Receipt (updates PO shipping/warehouse_status on PR), Goods Return
- Vendor Portal: profile, tenders, POs, shipments, invoices, LS docs
- Invoices: outstanding, paid; finance marks paid
- Company Settings: bonded_zone toggle
- Odoo Integration: MOCKED stubs (sync products/vendors/pos)

### Frontend
- Split-screen login + vendor registration
- Sidebar layout with role-based nav (internal vs vendor)
- Dashboard KPI + budget utilization + KB compliance card
- Master Data (tabbed CRUD)
- Users (admin only)
- Budgets, Approval Workflow settings (multi-level builder)
- Purchase Requests (create, approve, reject, detail sheet with timeline)
- Purchase Orders (merge from PRs, approve, send, detail sheet)
- Tenders (create, invite vendors, open/close/award)
- Vendor Management (approve/reject vendor, create user account)
- Inventory (goods receipt + return)
- Invoice Finance
- Settings (Company + Odoo mocked)
- Vendor Portal: home, tenders (bid/decline), pos, shipments, invoices submit, LS documents, profile

## Backlog (Future)
- P1: Odoo real integration (XML-RPC)
- P1: File upload untuk LS documents (real S3/object storage)
- P1: Per-item budget enforcement (currently only department-level)
- P2: Email notification on approvals
- P2: Approval delegation
- P2: Reporting/export CSV
- P2: Custom PR/PO templates
- P2: Multi-currency

## Iteration 2 – 2026-02-14 (5 features added)
1. **Per-Barang Budget enforcement** — `_budget_plan` in `routes_procurement.py`: setiap item PR memilih budget produk (dept+product_id) dulu, fallback ke dept-level (product_id=None). Konsumsi tercatat per-budget-id di `budget_map` PR dan didecrement saat PR fully approved.
2. **CSV + PDF Report Export** — `routes_reports.py`: /api/reports/{prs,pos,budgets}.{csv,pdf}. PDF via reportlab.
3. **Upload LS Files → Supabase Storage** — `routes_uploads.py`: POST /api/uploads/ls (multipart). Bucket 'ls-documents' harus dibuat manual di dashboard Supabase (dengan policy INSERT untuk anon), URL/key sudah tersedia di backend/.env.
4. **Odoo XML-RPC live** — `odoo_client.py` + endpoints /api/odoo/test, /api/odoo/sync/{products,vendors,pos}. Jika enabled=false → mock mode (`mocked:true`). Enable via Settings.
5. **Email SMTP notifications** — `notifications.py` + /api/settings/notifications + /api/settings/notifications/test. Auto-kirim ke approver level saat ada PR/PO/Budget pending. Config via Settings > Email SMTP tab.

### Additional fixes
- GET /api/settings/odoo restricted to admin, api_key masked as '***' on read
- GET /api/settings/notifications masks smtp_password as '***' on read; PUT preserves stored value when '***' or empty received
- Upload endpoint returns 424 (not 502) so ingress preserves error message

## Test Results
- Iteration 1: 41/41 tests passed
- Iteration 2: 24/24 tests passed
- Combined: 65/65

## Iteration 3 – 2026-02-14
### Added
- **Budget Progress Preview in PR form** — new endpoint GET /api/budgets/check/{department_id}; PR create dialog fetches approved budgets on dept select and shows a per-budget progress bar with existing consumption (grey), projected new consumption (blue), and overshoot warning (red). Requester sees live if they will exceed budget.
- **Approval SLA Cron** — `.emergent/crons.yml` schedules daily 09:00 UTC → POST /api/cron/approval-sla-alerts. Backend endpoint (routes_cron.py) auths via WEBHOOK_CRON_SECRET, background-dispatches emails to approvers on PR/PO/Budget in pending_approval >48h. Verified: 401 without bearer, 200 with correct token.
- **Supabase Storage bucket 'ls-documents'** — user created bucket; upload confirmed working (Vendor Portal → Dokumen LS → Upload File returns public URL).

### Env additions
- WEBHOOK_CRON_SECRET (backend/.env)

### Tests
- All previous 65 tests still pass. New: manual verification of cron auth + budget preview endpoint via curl + UI screenshot.

## Iteration 4 – 2026-02-14
### Added
- **Vendor Rating**: POST /api/pos/{id}/rate (only when PO completed). Ratings stored on vendor doc + avg_rating recomputed. PO detail sheet now shows star input when completed and displays saved rating. Vendors list shows avg stars + count.
- **PR Attachments**: New POST /api/uploads/attachment (Supabase). PRIn model accepts attachments[]. PR create dialog: multi-file input + inline list with remove. Detail sheet lists attachments as clickable links.
- **Budget Forecast**: GET /api/dashboard/budget-forecast — per-budget 90-day burn analysis via PR budget_map. Dashboard shows a table with sisa, monthly burn, days-to-exhaust, projected date, warning highlight (red row) when ≤30 days.
- **SMTP Live**: info@thinq-tech.id smtp.gmail.com:465 SSL configured & enabled. Test email verified sent.

### Verified
- SMTP send email OK
- Budget forecast endpoint OK
- SMTP password masked as '*'

## Iteration 5 – 2026-02-14
### Added / Enhanced
- **PR list**: search box + server-side pagination (?q&page&page_size), header shows total & current page, prev/next buttons.
- **PO list**: same search + pagination.
- **PO create**: added Warehouse, Payment Terms, Projects (comma-separated), Vendor Forecast, Tax % (PPN), DPP Nilai Lain. Backend computes untaxed_amount, amount_tax, amount_total on create.
- **PO detail sheet**: Odoo-style layout — Vendor / Vendor Code / Warehouse / Payment Terms / Order Date / Receipt Date / Vendor Forecast / Projects, per-item row with description + Projects + Taxes column, footer totals (Untaxed / DPP / Tax / Total).
- **Vendor blacklist**: manual toggle + auto-detect avg_rating<2 (≥2 ratings). Tenders & PO create now exclude blacklisted vendors via `?exclude_blacklisted=true`. VendorsMgmt table shows blacklist badge (MANUAL / AUTO<2★) + red row.
- **Vendor list UI**: horizontal-scroll + client-side pagination (15/page) + search.
- **PR duplicate detection**: POST /api/prs/check-duplicate; PR create dialog auto-warns if similar PR (same dept + overlapping products) exists ≤30d.
- **Approval Delegation**: `/api/users/{id}/delegation` (endpoint ready; UI in Settings deferred).
- **Mobile Approval**: HMAC-signed GET link `/api/mobile-approve?token=…` (7-day validity). Email approval notif now includes big green Approve / red Reject buttons that call the endpoint — no login required from mobile.
- **Vendor Portal Profile revamp**: 4 tabs (Info / Address / Document / PIC) mirroring reference screenshots. Info: Username/Phone/Email/NPWP/Website/Notification handling radio. Address: multiple addresses w/ label+city+postal. Document: upload SIUP / NPWP / Akta + Awarding table + Certification table (all via Supabase). PIC: list of contact persons.

### Endpoints new
- GET /api/prs?q&page&page_size · GET /api/pos?q&page&page_size&status&po_type
- POST /api/prs/check-duplicate
- POST /api/vendors/{id}/blacklist
- PUT /api/vendor-portal/profile-extended · PUT /api/vendors/{id}/profile-extended
- PUT /api/users/{id}/delegation · GET /api/users/me/delegation
- GET /api/mobile-approve?token=…

## Iteration 6 – 2026-02-14
### Added
- **PO Print PDF**: GET /api/pos/{id}/print.pdf → Odoo-style: header (Vendor/VendorCode/Warehouse/Payment Terms/OrderDate/ReceiptDate/Vendor Forecast/Projects), item table (Product/Description/Projects/Qty/Unit Price/Taxes/Subtotal), footer (Untaxed/DPP/Tax/Total). Frontend button in PO detail sheet.
- **PO Chat**: GET/POST /api/pos/{id}/messages, threaded buyer↔vendor. Vendor sees left blue bubbles (self), buyer right slate. Same on both procurement & vendor portal side (RBAC enforced).
- **PIC Login**: POST /api/vendors/{vid}/pics/create-login → provisions a vendor-role user tied to same vendor_id, with is_pic=true. Frontend button per PIC row in Vendor Portal > Profile > PIC tab.
- **Delegation UI**: Settings > Delegation tab. User picks delegate + until date; PUT /api/users/{id}/delegation. Bug fix: compile error 'total' duplicate declaration in PurchaseRequests.jsx (renamed to formTotal).
### Verified
- PO PDF 200 (~2.5KB) · Chat send + list OK · SMTP live · Supabase LS upload OK · Cron endpoint auth OK.

## Iteration 9 – 2026-02-14
- **Master Warehouse & Location UI**: 2 tab baru di Master Data (Warehouse dengan bonded flag, Location dengan bonded_zone flag).
- **Product SKU + Variants + Lot Track**: field code/SKU/Alt SKU/variants JSON/is_lot_tracked di form Products.
- **Multi-Lot Goods Receipt**: input multi-lot per item saat penerimaan barang (lot number + qty), pilih Warehouse+Location, dan link ke Dokumen BC bila PO Bonded.
- **BC Print PDF**: `GET /api/customs-docs/{id}/print.pdf` — header + item table + document + petikemas + tanda tangan. Tombol "Print PDF" di editor BC.
- **BC → Odoo Landed Cost**: `POST /api/customs-docs/{id}/sync-odoo` menciptakan stock.landed.cost di Odoo dengan cost line Freight/Insurance/BMT. Fallback message ramah jika module Purchase Landed Costs belum terinstall di Odoo.
