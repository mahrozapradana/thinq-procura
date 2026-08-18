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
