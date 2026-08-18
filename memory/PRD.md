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


## Iteration 11 – 2026-02-18 (Multi-Tax + Vendor RFQ Scoping)
### Added
- **Master Tax (Pajak) m2m**: New collection `taxes` + CRUD `/api/taxes` (admin/procurement/finance). Fields: code, name, rate%, tax_type (sales/withholding/other), is_active. UI di Master Data → tab **Pajak**. Seeded: PPN11 (11% sales) + PPH23 (2% withholding).
- **PO Multi-Tax Application**: `POCreateIn.tax_ids: List[str]` many2many. Backend menghitung `tax_breakdown` per pajak (sales +, withholding -), `amount_tax` net, `amount_total`. Snapshot `taxes_snapshot` disimpan agar tetap traceable meski master pajak berubah.
- **PurchaseOrders UI**: Merge dialog dapat pilih multiple pajak via checkbox + live preview subtotal → tax breakdown → grand total. Detail Sheet menampilkan tax breakdown lengkap.
- **Vendor Portal — Menu Terbatas & Scoping Ketat**:
  - **RFQ menu (baru)** `/vendor/rfqs` — GET `/api/vendor-portal/rfqs` menampilkan PO yang di-assign ke vendor DAN status `draft`/`pending_approval` (read-only).
  - **Purchase Orders** — GET `/api/vendor-portal/pos` sekarang hanya menampilkan status `approved`/`sent`/`partial`/`completed`.
  - **PO Detail read-only** — GET `/api/vendor-portal/pos/{id}` dengan tax breakdown. Sheet detail di frontend menampilkan items + subtotal + rincian pajak + grand total.
  - **Tender Filter** — hanya menampilkan tender `status=open` yang di-invite ke vendor / public (invited_vendor_ids kosong), atau tender di mana vendor sudah pernah bid / awarded.
  - **PIC-scoped access** — jika user adalah PIC (`is_pic=true`), semua filter tambah `assigned_pic_id = user.id`.
### Verified
- POST /api/taxes (2 pajak) → 200 OK
- POST /api/pos dengan tax_ids `[PPN11, PPH23]`: untaxed 7.000.000 → amount_tax 630.000 (770K - 140K) → total 7.630.000 ✓
- Login vendor `test_vendor_423f4216@example.com / vendor123` → auto redirect `/vendor`
- Sidebar vendor: Dashboard, Tender Terbuka, RFQ / PO Menunggu, Purchase Orders, Pengiriman, Invoice, Dokumen LS, Profil Perusahaan (menu internal diblok oleh ProtectedRoute)
- RFQ list menampilkan PO status `pending_approval` dengan tax breakdown terlihat di detail
- Read-only enforcement: vendor tidak bisa akses `/masters`, `/users`, `/settings` (redirect ke `/`)

### Backlog / Next
- P1: Odoo XML-RPC sinkronisasi PO sekarang harus mengirim tax_ids (pemetaan ke account.tax di Odoo)
- P2: Barcode scanner E2E validation
- P2: Refactoring `server.py` bila > 700 baris

## Iteration 13 – 2026-02-18 (Vendor Reply Review + Auto Re-Approval + SPT-1111 + Rating Reminder)
### Added
- **Buyer accepts/rejects vendor_reply**:
  - `POST /api/pos/{id}/accept-vendor-reply` (admin/procurement): apply vendor counter prices per item → recompute subtotal, tax breakdown (using existing tax_ids), and grand_total. Returns `{ok, reapproved, delta_pct, new_total}`.
  - `POST /api/pos/{id}/reject-vendor-reply`: clear vendor_reply, keep original PO.
  - Frontend: blue vendor_reply panel in PurchaseOrders detail Sheet with comparison table (Harga Asli vs Counter Vendor, Δ%, red badge if |Δ|>5%). Terima/Tolak buttons.
- **Auto Re-Approval Threshold (5%)**: If accept-vendor-reply causes max item price delta > `REAPPROVAL_DELTA_PCT=5.0`, backend resets `approvals` via `_pick_workflow`+`_levels_for_amount`, sets `status=pending_approval`, `current_level=1`, `reapproval_reason` field, and fires `notify_pending_approval` (email to approvers). UI badge "⚠ Approval diulang" in detail.
- **SPT-1111 Formulir 1111 B2 (DJP-format)**: New `/app/backend/routes_spt.py` → `GET /api/reports/spt-1111.xlsx?year=&month=`. Sheet 1: Daftar Pajak Masukan (kolom: No, Nama PKP, NPWP, Faktur, Tanggal, Ref, DPP, PPN, PPnBM, Kode transaksi 01) with proper DJP-style header block. Sheet 2: Induk Ringkasan (A/B1/B2 totals). Fallback ke PO data jika belum ada invoice. Button "SPT-1111 (DJP)" ditambahkan di halaman Laporan Pajak.
- **Vendor Rating Post-Receipt**:
  - `notifications.send_rating_reminder(po)` — email HTML ke PO creator (buyer) dengan tombol "★ Beri Rating Sekarang" ke `/po?rate={id}`.
  - Trigger otomatis di `routes_inventory.create_receipt` saat receipt membuat `shipping_status="completed"` (dan `vendor_rating` belum ada).
  - Dashboard: banner amber "Rating Vendor Menunggu — N PO" dengan CTA jika ada PO completed belum di-rate.

### Verified
- SPT-1111 XLSX endpoint: HTTP 200, 6658 bytes ✓
- Accept-vendor-reply dengan 20% price hike: status→pending_approval, reapproval_reason set, notify_pending_approval fired ✓
- Vendor Reply UI di PO detail: comparison table dengan Δ% color-coded (green -2.5% kecil, red bila >5%) ✓
- Dashboard "Rating Vendor Menunggu — 2 PO" banner tampil untuk PO PO-20260818-F3CB3, PO-20260818-3747E ✓
- Rating reminder trigger: hooked di create_receipt saat status→completed & belum ada rating ✓

### Backlog / Next
- P2: Delta% threshold configurable di Settings (default 5%)
- P2: Real-time WebSocket notification untuk vendor reply
- P3: Multi-currency support di PO (USD Bonded)


## Iteration 14 – 2026-02-18 (Threshold config + Bell notif + Multi-currency + Vendor suggest)
### Added
- **Threshold Re-Approval di Settings**: `reapproval_threshold_pct` (default 5.0) di `CompanySettingsIn`. Backend `accept-vendor-reply` sekarang membaca dari `db.company_settings` singleton. UI: field baru di Settings > Company. Verified: set 15% → change of 20% still triggers re-approval (as 20 > 15).
- **Bell Notifications (In-App)**:
  - Collection `notifications` `{id,user_id,type,title,message,link,meta,is_read,created_at}`.
  - Endpoints: `GET /api/notifications?unread_only=&limit=`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`.
  - Helpers: `create_notification(user_id,...)`, `notify_role(role,...)`.
  - Hook di `vendor-portal/rfqs/{id}/reply` — insert notif ke PO creator + broadcast ke role `procurement`.
  - Frontend: `NotificationsBell.jsx` component di topbar Layout, polls every 20s, badge merah dengan unread count, dropdown panel with "Buka" link + "Tandai terbaca" per-item + "Tandai semua terbaca".
  - Verified: RFQ reply → notif "Vendor membalas RFQ PO-XXX" muncul dengan unread=1 ✓
- **Multi-Currency PO**:
  - `POCreateIn.currency` (IDR/USD/SGD/JPY) + `exchange_rate` (auto-filled dari `company_settings.exchange_rates`).
  - Storage: PO doc menyimpan `currency`, `exchange_rate`, plus `amount_total_idr`, `untaxed_amount_idr`, `amount_tax_idr` (auto-converted) → laporan pajak selalu dalam IDR.
  - UI: dropdown Currency + input Kurs di PO Merge Dialog (auto-fill dari company rates).
  - Settings: input Kurs USD/SGD/JPY di Company tab (persisted di `exchange_rates` dict).
- **Auto-Suggest Vendor**:
  - `GET /api/vendor-suggestions?product_ids=&top=` — ranking berdasarkan:
    - 40% rating_score (avg_rating/5)
    - 30% ontime_score (on-time deliveries / completed)
    - 30% leadtime_score (1 - avg_lead_days/60, capped)
    - +10% bonus jika vendor pernah supply produk yang sama
  - Response: `[{vendor_id, company_name, avg_rating, po_count, on_time_pct, avg_lead_days, product_match, score, reasons[]}]`
  - UI: Di PO Merge Dialog, saat PR dipilih → card rekomendasi vendor muncul dengan skor + alasan. Tombol pilih vendor rekomendasi teratas dengan badge "TOP" hijau.
  - Verified: endpoint returns 2 vendors ranked ✓
- **Route Fix**: `/vendors/suggest` collision dengan `/vendors/{vid}` diperbaiki dengan rename ke `/vendor-suggestions`.

### Verified
- Threshold saved di company_settings: `reapproval_threshold_pct=15.0`, `exchange_rates={"USD":15800,"SGD":11700,"JPY":105}` ✓
- Notifications: bell topbar muncul dengan badge merah "1", panel dropdown menampilkan "Vendor membalas RFQ PO-20260818-3747E" ✓
- Settings UI: field Threshold + Kurs USD/SGD/JPY tampil di tab Company ✓
- PO Merge Dialog: dropdown Currency (IDR/USD/SGD/JPY) muncul ✓
- Vendor Suggestions endpoint: `/api/vendor-suggestions?top=3` returns ranked JSON ✓

### Backlog / Next
- P2: Auto-fetch exchange rate harian dari Bank Indonesia API (JISDOR)
- P2: WebSocket real push (SSE atau socket.io) menggantikan polling 20s
- P2: Vendor suggestion untuk PR (bukan hanya PO) supaya requester bisa pilih vendor dari awal
- P3: Notification preferences per user (email vs bell vs both)


## Iteration 15 – 2026-02-18 (FX Auto + SSE Push + PR Vendor Suggest + Notif Prefs)
### Added
- **FX Auto (BI JISDOR proxy)**: New `/app/backend/routes_fx.py` menggunakan `open.er-api.com` sebagai proxy interbank rate (BI JISDOR memerlukan SOAP yang rapuh).
  - `POST /api/settings/fetch-fx-rates` (admin/finance/procurement): fetch USD/SGD/JPY→IDR, simpan ke `company_settings.exchange_rates` + `exchange_rates_fetched_at` + `exchange_rates_source`.
  - `GET /api/cron/fetch-fx-rates` (no auth) untuk platform cron.
  - `.emergent/crons.yml`: new entry `fetch-fx-rates` daily 06:00 UTC.
  - UI: tombol biru "Auto BI" di Settings > Company + timestamp update. Verified: USD=17830.69, SGD=13962.41, JPY=111.92 ✓
- **SSE Real-Time Push**:
  - `GET /api/notifications/stream` — Server-Sent Events endpoint dengan in-process fan-out (asyncio.Queue per user_id, disconnect detection, keep-alive 25s).
  - `create_notification` sekarang publish ke SSE queue segera setelah insert DB.
  - Frontend: `NotificationsBell.jsx` pakai `EventSource` untuk push instan + toast auto-popup + polling fallback 30s. Badge "● Live" hijau di panel header.
  - Verified: `curl -sN /api/notifications/stream` returns `: connected user=...` immediately ✓
- **Vendor Suggest di PR**:
  - `PRIn.preferred_vendor_id` (optional) — requester tag rekomendasi vendor sejak PR dibuat, ditampilkan ke procurement saat merge → PO.
  - Frontend: PR create dialog auto-fetch `/vendor-suggestions?product_ids=...` saat item berubah, tampilkan 3 kartu ranked (skor 40/30/30 + reasons), klik untuk toggle pilih. Persisted di doc PR.
- **Preferensi Notifikasi Per User**:
  - `notification_prefs: {email, bell}` di user document (default both true).
  - `GET|PUT /api/users/me/notification-prefs`.
  - `create_notification` sekarang cek `prefs.email` — hanya kirim email bila user opt-in (bell selalu insert DB agar terlihat).
  - Frontend: Tab baru "Preferensi Notif" di Settings dengan Switch untuk Email + Bell + tombol Simpan.

### Verified via curl + Playwright
- FX auto POST returns live rates ✓
- Notification prefs GET/PUT round-trip ✓
- SSE stream connects & sends `: connected` frame ✓
- Settings UI: 5 tabs (Company/Odoo/Email SMTP/Preferensi Notif/Delegation) ✓
- Company tab: Threshold field + Kurs table + "Auto BI" button + "Update: 18/8/2026, 02.24.56" timestamp ✓
- Preferensi Notif tab: Email toggle off, Bell toggle on, tombol Simpan ✓

### Backlog / Next
- P2: Vendor suggest ambil histori PR (bukan hanya PO) supaya vendor baru yang pernah dipertimbangkan tetap muncul
- P2: Notification preferences per type (RFQ reply vs approval vs rating) supaya lebih granular
- P3: SSE multi-worker support via Redis pub/sub bila uvicorn dijalankan multi-worker
- P3: Vendor Portal juga mendapat bell + SSE untuk PO acknowledgement


## Iteration 16 – 2026-02-18 (PR History Suggest + Granular Notif Prefs + Vendor Bell + Redis-ready)
### Added
- **Vendor Suggest — PR History Signal**:
  - `routes_vendor_suggest.py` sekarang juga membaca `db.prs` dengan `preferred_vendor_id` (dari fitur PR Suggest sebelumnya).
  - Field baru per vendor: `pr_considered` count. Bonus scoring +1% per PR (capped 5%) → vendor baru yang pernah dipertimbangkan requester tetap muncul walau belum ada PO.
  - Reasons: "Pernah dipertimbangkan di N PR" ditambahkan bila `pr_considered > 0`.
- **Notif Granular Per-Tipe**:
  - Prefs schema di-upgrade: `{email: dict|bool, bell: dict|bool}` — dict berisi per-type flag `{rfq_reply, approval, rating, po_new, general}`. Backward-compatible dengan legacy boolean.
  - `create_notification` cek `bell_prefs[ntype]` dan `email_prefs[ntype]` sebelum insert/publish/kirim email.
  - Frontend: Tab "Preferensi Notif" sekarang tampilkan tabel 5 baris tipe × 2 kolom channel (Email/Bell) dengan Switch masing-masing. Auto-migrasi legacy boolean ke per-type map di UI.
- **Vendor Portal SSE**:
  - Layout tetap satu (`Layout.jsx`) sehingga `NotificationsBell` yang sudah ada juga muncul di topbar vendor.
  - Hook di `POST /api/pos/{pid}/send`: buat notif tipe `po_new` untuk semua users role=vendor yang punya `vendor_id` sama, link ke `/vendor/pos`.
  - Existing `send_rating_reminder` sudah memakai `create_notification` implicitly via email; sekarang bell juga ter-trigger via `create_notification` bila dipanggil untuk buyer. Vendor akan menerima bell "PO baru" real-time via SSE.
  - Verified: login vendor → bell icon tampil di topbar; endpoint /notifications/stream accessible ✓
- **Redis Pub/Sub — Multi-Worker Ready**:
  - New file `/app/backend/redis_pubsub.py` — abstraksi opsional. Jika env `REDIS_URL` di-set + `pip install redis`, notifikasi otomatis dipublish ke channel `epr:notif:{user_id}` sehingga SSE stream di worker lain dapat menerima & meneruskan ke client-nya.
  - `create_notification` mem-publish setelah insert lokal — dibungkus try/except supaya tetap works tanpa Redis (single-worker fallback).
  - Belum aktif dalam preview (butuh REDIS_URL). Instruksi cara enable ada di docstring modul.

### Verified via curl + Playwright
- `/vendor-suggestions?top=3`: response includes `pr_considered` field, criteria mentions "+5% PR history" ✓
- Prefs PUT with granular `{email:{approval:true, ...}, bell:{all:true}}` round-trip OK ✓
- Vendor login: topbar shows Bell + timestamp; sidebar restricted to 8 vendor menus ✓
- Settings > Preferensi Notif: 5 rows (RFQ reply / Approval / Rating / PO Baru / Umum) with Email + Bell columns and toggles ✓
- Cron `.emergent/crons.yml` includes `fetch-fx-rates` daily 06:00 UTC ✓

### Backlog / Next
- P3: Vendor Portal sidebar juga tampilkan quick unread count per section (RFQ / PO / Invoice)
- P3: Redis actual deploy (bila multi-worker scale-out diperlukan): `pip install redis` + set REDIS_URL
- P3: Notif digest email harian ringkasan (untuk yang matikan email realtime)
- P4: In-app dark mode toggle per user


## Iteration 17 – 2026-02-18 (Sidebar Badges + Digest + Dark Mode + Redis Doc)
### Added
- **Sidebar Badge Unread untuk Vendor**:
  - `GET /api/vendor-portal/unread-counts` → `{rfq, po, invoice, tender}` (PIC-scoped bila `is_pic`).
  - Layout.jsx: polling 30s + red badge di menu Tender Terbuka, RFQ / PO Menunggu, Purchase Orders, Invoice / Penagihan.
  - Verified: vendor unread = `{rfq:0, po:0, invoice:0, tender:2}` ✓
- **Digest Email Harian**:
  - `GET /api/cron/notification-digest` — kirim ringkasan 24h ke user yang matikan realtime email tapi ada notifikasi.
  - Filter: users dengan `email_prefs[type]` semua false untuk realtime types + `digest=true`.
  - Cron `.emergent/crons.yml`: `notification-digest` daily 07:00 UTC.
  - Response: `{ok, digest_sent, groups}` — verified 1 group processed ✓
- **Dark Mode Toggle**:
  - Backend: `GET|PUT /api/users/me/preferences` → `{theme: "light"|"dark"}`.
  - Frontend: `ThemeToggle.jsx` di topbar (Sun/Moon icon), sync ke localStorage + server, apply `.dark` class ke `<html>`.
  - CSS: 15+ dark variants di `index.css` (background, card, muted, border, text, input, table, hover states) — konsisten cross-device via server persistence.
  - Verified: PUT theme=dark returns `{"theme":"dark"}`, toggle button + toast "Tema: Terang/Gelap" muncul ✓
- **Redis Deployment Guide**:
  - New file `/app/REDIS_DEPLOYMENT.md` — panduan step-by-step: sediakan Redis (DO/AWS/Docker/Upstash), install `pip install redis`, set `REDIS_URL` env, restart, opsi subscribe worker fan-in, test end-to-end multi-tab, monitoring, troubleshoot table, rollback, alternatif (Postgres LISTEN/NATS/Mongo Change Streams).

### Verified via curl + Playwright
- Preferences GET/PUT roundtrip theme=dark ✓
- Digest cron endpoint returns 200 dengan `groups=1` ✓
- Vendor unread counts endpoint returns valid JSON ✓
- Screenshot admin dark mode: full UI dengan sidebar, cards, table, buttons semua adaptif ✓
- Screenshot vendor sidebar: red badge muncul di Tender Terbuka (2) ✓

### Backlog / Next
- P3: Buyer/admin sidebar juga dapat badges untuk PR menunggu approval, PO baru, invoice outstanding
- P3: Dark mode auto-detect via `prefers-color-scheme` media query pertama kali (sekarang default light)
- P3: Custom theme colors per-tenant (untuk white-label enterprise deploy)
- P4: PWA install prompt supaya app bisa di-install ke home screen mobile


## Iteration 18 – 2026-02-18 (Buyer Badges + Auto Dark + PWA + White-Label Theme)
### Added
- **Buyer Sidebar Badges**:
  - `GET /api/internal/unread-counts` returns `{pr, po, tender, vendors, invoices, customs, receipts}` (403 untuk role vendor).
  - Layout.jsx auto pick endpoint based on `isVendor`, polls 30s.
  - Red badges di menu: Purchase Requests, Purchase Orders, Tender, Vendors, Penerimaan & Retur, Dokumen Impor (BC), Invoice Finance.
  - Verified: internal counts `{pr:1, po:1, tender:3, customs:1, receipts:1}` ✓
- **Auto Dark Mode (prefers-color-scheme)**:
  - ThemeToggle first-time visit: baca `window.matchMedia('(prefers-color-scheme: dark)')` → set localStorage + flag `epr-theme-inited`.
  - Listen media query change — follow OS jika user belum manual toggle. Manual toggle → stop follow.
- **PWA Install**:
  - `public/manifest.json` — Procura, standalone, shortcuts (PR, PO).
  - `public/service-worker.js` — cache-first static + network-first navigation, skip `/api/`.
  - index.html: manifest link, apple meta tags, auto register SW.
  - Browser Chrome/Edge/Safari otomatis tampil "Add to Home Screen".
- **Multi-Tenant Theme (White-Label)**:
  - `CompanySettingsIn.brand_color` + `brand_logo_url` (di company_settings singleton).
  - `frontend/src/lib/brand.js` — `applyBrandColor(hex)`: convert hex → HSL → set CSS var `--accent`, `--ring`, `--brand`.
  - Layout mount auto apply brand color dari `/settings/company`.
  - Settings Company tab: native color picker + hex input dengan live-preview. Verified: brand_color `#0EA5E9` saved ✓

### Verified via curl + Playwright
- Buyer sidebar: badges "1" di PR/PO/Customs/Receipts + "2" di Tender + "1" bell topbar ✓
- Settings brand color picker: warna #0EA5E9 dengan live-preview di input ✓
- Settings di dark mode: sidebar/card/table adaptif ✓
- PWA files exist: manifest.json (653B) + service-worker.js (1.3KB) ✓

### Backlog / Next
- P4: Logo upload via Supabase (bukan URL manual)
- P4: Offline mode enhancements — cache last-viewed PR/PO
- P4: Multi-brand palette (primary/secondary/tertiary)
- P5: Custom domain per-tenant + email template branding


## Iteration 19 – 2026-02-18 (Logo Upload + Offline Cache + Palette Sekunder + Custom Domain)
### Added
- **Logo Upload ke Supabase**:
  - Ganti input URL manual dengan `<input type="file">` di Settings > Company. Reuse endpoint `/api/uploads/attachment` (Supabase Storage bucket `ls-documents/attachments/{user_id}/`).
  - Setelah upload, `brand_logo_url` di-set dengan public URL dan preview img langsung tampil.
  - Layout.jsx sidebar menampilkan `<img src={brand.logo}>` (max h-10, max-w-180px) menggantikan "PROCURA." branding statis bila logo di-set.
- **Offline Mode Enhanced (Service Worker v2)**:
  - `public/service-worker.js` upgrade ke `epr-v2` + cache terpisah `epr-api-v1`.
  - **Stale-while-revalidate** untuk API whitelist: PR, PO, vendors, products, departments, taxes, dashboard/stats.
  - Cached response served instant, network fetcher jalan di background untuk refresh cache.
  - Skip SSE + non-cacheable API (fetch normal).
  - Fallback offline: return `{offline:true, items:[]}` dengan header `X-Offline:1` supaya UI bisa tampil dengan indicator.
- **Palette Sekunder (White-Label Lengkap)**:
  - `CompanySettingsIn.brand_warning_color` + `brand_success_color` (hex).
  - `frontend/src/lib/brand.js`: refactor jadi `applyBrandPalette({primary, warning, success})` dengan hex→HSL converter DRY. Set CSS var `--brand-warning`, `--brand-warning-hsl`, `--brand-success`, `--brand-success-hsl` di `<html>`.
  - Settings Company: 2 color pickers tambahan (Warna Warning + Warna Success) dengan live-preview inline hex.
  - Layout mount pakai `applyBrandPalette` — otomatis apply semua 3 warna.
- **Custom Domain Multi-Tenant**:
  - `CompanySettingsIn.custom_domain` field (mis. `procura.acmegroup.co.id`).
  - New doc `/app/CUSTOM_DOMAIN.md` — panduan lengkap: setup CNAME DNS, SSL (Let's Encrypt/managed), CORS update, brand sync, multi-tenant isolation roadmap (tenant_id per collection + middleware).
  - Settings Company: input Custom Domain dengan link ke docs.

### Verified
- Backend PUT `/settings/company` returns `brand #0EA5E9 warn #F97316 succ #10B981 domain procura.acmegroup.co.id` ✓
- Screenshot Settings dark mode: 3 color pickers (biru/orange/green) + Logo Brand upload button + Custom Domain input + link ke `CUSTOM_DOMAIN.md` ✓
- Sidebar: badges "1" di PR/PO/Penerimaan/Customs + "2" di Tender ✓
- Files: manifest.json (653B), service-worker.js (2.1KB v2), CUSTOM_DOMAIN.md (3KB) ✓

### Backlog / Next
- P4: Auto DNS setup wizard (integrasi Cloudflare API) supaya user tidak perlu manual CNAME
- P4: Preview brand palette live di seluruh UI tanpa refresh saat pilih warna
- P4: Signed URL untuk logo di Supabase bila tenant butuh privasi
- P5: A/B test dashboard analytics tenant-scoped


## Iteration 21 – 2026-02-18 (Horizontal Scroll + Pagination Global)
### Fixed
- **Table Horizontal Scroll**: Semua 17 wrapper `rounded-md overflow-hidden` di pages diganti ke `rounded-md overflow-x-auto` via sed. `.data-table` diberi `min-width: 720px` di index.css supaya kolom tidak tergencet di layout sempit — auto scroll horizontal saat viewport kecil.
- **Pagination Global Component**: Baru `/app/frontend/src/components/Pagination.jsx` — reusable footer dengan prev/next + halaman terpilih + range 5 dan ellipsis. Diintegrasikan ke VendorPOs & VendorRFQs (client-side slice per 10 baris).
- **Verified**: Screenshot RFQ vendor menampilkan 8 kolom lengkap (No RFQ/PO, Type, Untaxed, Pajak, Grand Total, Status, Balasan, Aksi Eye + Balas Harga) + footer "1 baris" ✓


## Iteration 23 – 2026-02-18 (Sidebar Minimize + Mobile Drawer)
### Added
- **Sidebar Toggle Collapse (Desktop)**: Tombol `<ChevronsLeft/>`/`<ChevronsRight/>` di header sidebar. State disimpan di `localStorage["epr-sidebar"]`. Saat `w-16`:
  - Logo/text tersembunyi (`aside.w-16 .side-link span:not([data-testid="side-badge"]) { display:none }`)
  - Group labels tersembunyi
  - Badge unread absolute position atas-kanan icon
  - Icon terpusat + padding vertical
- **Mobile Drawer**: Breakpoint `lg` (1024px). Saat mobile:
  - Sidebar `hidden lg:flex` — default tersembunyi
  - Hamburger button di topbar (`data-testid="hamburger"`) → set `mobileOpen`
  - Sidebar `fixed inset-y-0 left-0 z-40` slide-over dengan overlay hitam 50% opacity
  - Tombol X di header sidebar untuk close
  - Company name di topbar `hidden sm:block` untuk hemat ruang
### Verified via Playwright
- Desktop collapsed 1400px: sidebar 64px width, hanya icon terlihat + badges masih di posisi kanan-atas icon ✓
- Mobile 400px: hamburger button muncul, klik → drawer full-height dengan semua menu + badges tetap terlihat ✓
### Backlog (Fitur Berikutnya)
- Sort by Column (P4)
- Filter Bar Universal (P4)
- Bulk Actions dengan checkbox (P4)
- Saved Views user-preset (P5)


## Iteration 24 – 2026-02-18 (Vendor Bid UX Pack: Auto-Suggest, Countdown, Attachments, Draft)
### Added
- **Auto-Suggest Harga Bid (P0)**: New `GET /api/vendor-portal/tenders/{tid}/price-suggestions` — returns per-product historical PO stats `{avg, min, max, last, last_at, count}` scanning last 50 approved/sent/partial/completed POs. Bid dialog now shows a "Rentang Wajar" column per item + red/amber/green hint under price input (`↑ N% di atas rata-rata` if >15% over max, `↓ N% di bawah` if <15% below min, green "Dalam rentang wajar" otherwise).
- **Deadline Countdown (P0)**: New reusable `/app/frontend/src/components/Countdown.jsx` — live-updating pill with color states (green >2 days, amber <2 days, red <6 hours w/ animate-pulse, slate "Lewat" once passed). Applied in tender table (Deadline column), bid dialog header, and detail sheet (size="md").
- **Multi-File Attachment for Bids (P1)**: `BidIn.attachments: List[{url, filename, size, content_type}]` model. Frontend uses existing `/api/uploads/attachment` (Supabase). Dialog has drag-drop-style upload panel with per-file delete X. Attachments render as clickable links in detail sheet under "Lampiran:".
- **Bid Draft Save (P1)**: `BidIn.is_draft: bool`. Draft bids stored with `status="draft"` — otherwise `"submitted"`. Reopening the dialog auto-loads the draft and shows amber "Memuat draft yang tersimpan" banner. `/api/vendor-portal/unread-counts` updated to exclude only submitted bids (`$elemMatch: {vendor_id, status:"submitted"}`) so drafts still surface tender as pending.
### Verified via testing agent
- Backend: 5/5 pytest (`/app/backend/tests/test_iteration3_vendor_bid.py`)
- Frontend Playwright: countdown "Sisa 3h 4j" green ✓, price hint red/green ✓, draft persisted + banner on reload ✓, attachment upload+link ✓
### Backlog / Next
- P2: Server-side deadline enforcement in `submit_bid` (currently only checks status=='open')
- P2: Cache price-suggestions per tender-id session-side
- P3: Radix a11y DialogTitle/Description polish (non-blocking warnings)
- P3: Mongo aggregation for price-suggestions on large history datasets
- P4: Refactor `server.py` breakdown → routes folder

