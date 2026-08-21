CREATE SCHEMA IF NOT EXISTS native_app;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS native_app.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    vendor_id uuid NULL,
    delegated_to uuid NULL,
    delegated_until timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_native_users_email ON native_app.users (lower(email));
CREATE INDEX IF NOT EXISTS ix_native_users_role_status ON native_app.users (role, status);
CREATE INDEX IF NOT EXISTS ix_native_users_vendor_role ON native_app.users (vendor_id, role);

CREATE TABLE IF NOT EXISTS native_app.vendors (
    id uuid PRIMARY KEY,
    email text NULL,
    code text NULL,
    company_name text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    is_blacklisted boolean NOT NULL DEFAULT false,
    avg_rating numeric(6,2) NULL,
    ratings_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_native_vendors_status ON native_app.vendors (status);
CREATE INDEX IF NOT EXISTS ix_native_vendors_blacklisted_status ON native_app.vendors (is_blacklisted, status);
CREATE INDEX IF NOT EXISTS ix_native_vendors_code ON native_app.vendors (code);

CREATE TABLE IF NOT EXISTS native_app.departments (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS native_app.divisions (
    id uuid PRIMARY KEY,
    code text NOT NULL,
    name text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_native_divisions_code ON native_app.divisions (code);

CREATE TABLE IF NOT EXISTS native_app.categories (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS native_app.hs_codes (
    id uuid PRIMARY KEY,
    code text NOT NULL,
    description text NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_native_hs_codes_code ON native_app.hs_codes (code);

CREATE TABLE IF NOT EXISTS native_app.products (
    id uuid PRIMARY KEY,
    code text NULL,
    name text NOT NULL,
    category_id uuid NULL,
    unit text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_native_products_code ON native_app.products (code);
CREATE INDEX IF NOT EXISTS ix_native_products_category_id ON native_app.products (category_id);

CREATE TABLE IF NOT EXISTS native_app.vendor_pricelists (
    id uuid PRIMARY KEY,
    vendor_id uuid NOT NULL,
    product_id uuid NOT NULL,
    verified boolean NOT NULL DEFAULT false,
    price numeric(18,2) NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'IDR',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_native_vendor_pricelists_vendor_created ON native_app.vendor_pricelists (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_vendor_pricelists_product_verified_price ON native_app.vendor_pricelists (product_id, verified DESC, price ASC);

CREATE TABLE IF NOT EXISTS native_app.approval_workflows (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    applies_to text NOT NULL,
    department_id uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_native_approval_workflows_applies_dept ON native_app.approval_workflows (applies_to, department_id);

CREATE TABLE IF NOT EXISTS native_app.budgets (
    id uuid PRIMARY KEY,
    department_id uuid NOT NULL,
    product_id uuid NULL,
    period text NOT NULL,
    status text NOT NULL,
    amount numeric(18,2) NOT NULL DEFAULT 0,
    used_amount numeric(18,2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_native_budgets_status ON native_app.budgets (status);
CREATE INDEX IF NOT EXISTS ix_native_budgets_period_dept_product ON native_app.budgets (period, department_id, product_id);
CREATE INDEX IF NOT EXISTS ix_native_budgets_created_at ON native_app.budgets (created_at DESC);

CREATE TABLE IF NOT EXISTS native_app.warehouses (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    is_bonded boolean NOT NULL DEFAULT false,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS native_app.locations (
    id uuid PRIMARY KEY,
    warehouse_id uuid NOT NULL,
    name text NOT NULL,
    is_bonded_zone boolean NOT NULL DEFAULT false,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_native_locations_warehouse_id ON native_app.locations (warehouse_id);

CREATE TABLE IF NOT EXISTS native_app.taxes (
    id uuid PRIMARY KEY,
    code text NOT NULL,
    name text NOT NULL,
    tax_type text NOT NULL,
    rate numeric(8,4) NOT NULL DEFAULT 0,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_native_taxes_code ON native_app.taxes (code);

CREATE TABLE IF NOT EXISTS native_app.company_settings (
    id text PRIMARY KEY,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS native_app.odoo_settings (
    id text PRIMARY KEY,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS native_app.notification_settings (
    id text PRIMARY KEY,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS native_app.sync_state (
    collection_name text PRIMARY KEY,
    last_cursor timestamptz NULL,
    last_run_at timestamptz NULL,
    rows_synced bigint NOT NULL DEFAULT 0,
    mode text NOT NULL DEFAULT 'full',
    notes text NULL
);

CREATE TABLE IF NOT EXISTS native_app.prs (
    id uuid NOT NULL,
    pr_number text NOT NULL,
    department_id uuid NOT NULL,
    requester_id uuid NOT NULL,
    status text NOT NULL,
    preferred_vendor_id uuid NULL,
    total numeric(18,2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_prs_pr_number ON native_app.prs (pr_number);
CREATE INDEX IF NOT EXISTS ix_native_prs_requester_created ON native_app.prs (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_prs_dept_status_created ON native_app.prs (department_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_prs_preferred_vendor ON native_app.prs (preferred_vendor_id);
CREATE INDEX IF NOT EXISTS ix_native_prs_status_created ON native_app.prs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_prs_requester_status_created ON native_app.prs (requester_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_prs_pr_number_trgm ON native_app.prs USING gin (pr_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_native_prs_payload_requester_name_trgm ON native_app.prs USING gin ((coalesce(payload->>'requester_name', '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_native_prs_payload_notes_trgm ON native_app.prs USING gin ((coalesce(payload->>'notes', '')) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS native_app.pos (
    id uuid NOT NULL,
    po_number text NOT NULL,
    vendor_id uuid NOT NULL,
    assigned_pic_id uuid NULL,
    created_by uuid NULL,
    po_type text NOT NULL,
    status text NOT NULL,
    shipping_status text NOT NULL,
    invoice_status text NOT NULL,
    amount_total numeric(18,2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_pos_po_number ON native_app.pos (po_number);
CREATE INDEX IF NOT EXISTS ix_native_pos_vendor_created ON native_app.pos (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_pos_status_created ON native_app.pos (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_pos_type_status_created ON native_app.pos (po_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_pos_assigned_pic_status ON native_app.pos (assigned_pic_id, status);
CREATE INDEX IF NOT EXISTS ix_native_pos_shipping_status_created ON native_app.pos (shipping_status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_pos_invoice_status_created ON native_app.pos (invoice_status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_pos_vendor_status_created ON native_app.pos (vendor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_pos_assigned_pic_status_created ON native_app.pos (assigned_pic_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_pos_po_number_trgm ON native_app.pos USING gin (po_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_native_pos_payload_notes_trgm ON native_app.pos USING gin ((coalesce(payload->>'notes', '')) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS native_app.tenders (
    id uuid NOT NULL,
    tender_number text NOT NULL,
    created_by uuid NULL,
    status text NOT NULL,
    awarded_vendor_id uuid NULL,
    deadline timestamptz NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_tenders_tender_number ON native_app.tenders (tender_number);
CREATE INDEX IF NOT EXISTS ix_native_tenders_status_created ON native_app.tenders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_tenders_deadline_status ON native_app.tenders (deadline, status);

CREATE TABLE IF NOT EXISTS native_app.goods_receipts (
    id uuid NOT NULL,
    receipt_number text NOT NULL,
    po_id uuid NOT NULL,
    warehouse_id uuid NULL,
    location_id uuid NULL,
    customs_doc_id uuid NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_goods_receipts_receipt_number ON native_app.goods_receipts (receipt_number);
CREATE INDEX IF NOT EXISTS ix_native_goods_receipts_po_created ON native_app.goods_receipts (po_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_goods_receipts_customs_doc ON native_app.goods_receipts (customs_doc_id);

CREATE TABLE IF NOT EXISTS native_app.goods_returns (
    id uuid NOT NULL,
    return_number text NOT NULL,
    receipt_id uuid NOT NULL,
    reason text NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_goods_returns_return_number ON native_app.goods_returns (return_number);
CREATE INDEX IF NOT EXISTS ix_native_goods_returns_receipt_created ON native_app.goods_returns (receipt_id, created_at DESC);

CREATE TABLE IF NOT EXISTS native_app.customs_docs (
    id uuid NOT NULL,
    doc_number text NOT NULL,
    po_id uuid NULL,
    vendor_id uuid NULL,
    status text NOT NULL,
    bc_type text NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_customs_docs_doc_number ON native_app.customs_docs (doc_number);
CREATE INDEX IF NOT EXISTS ix_native_customs_docs_status_created ON native_app.customs_docs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_customs_docs_po_created ON native_app.customs_docs (po_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_customs_docs_vendor_created ON native_app.customs_docs (vendor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS native_app.shipments (
    id uuid NOT NULL,
    shipment_number text NOT NULL,
    po_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    status text NOT NULL,
    tracking_number text NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_shipments_shipment_number ON native_app.shipments (shipment_number);
CREATE INDEX IF NOT EXISTS ix_native_shipments_po_created ON native_app.shipments (po_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_shipments_vendor_created ON native_app.shipments (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_shipments_status_created ON native_app.shipments (status, created_at DESC);

CREATE TABLE IF NOT EXISTS native_app.invoices (
    id uuid NOT NULL,
    invoice_number text NOT NULL,
    po_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    status text NOT NULL,
    due_date timestamptz NULL,
    amount numeric(18,2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_invoices_invoice_number ON native_app.invoices (invoice_number);
CREATE INDEX IF NOT EXISTS ix_native_invoices_po_status_created ON native_app.invoices (po_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_invoices_vendor_status_created ON native_app.invoices (vendor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_invoices_due_date_status ON native_app.invoices (due_date, status);

CREATE TABLE IF NOT EXISTS native_app.ls_documents (
    id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    po_id uuid NULL,
    reference_number text NOT NULL,
    status text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_ls_documents_vendor_created ON native_app.ls_documents (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_ls_documents_po_id ON native_app.ls_documents (po_id);
CREATE INDEX IF NOT EXISTS ix_native_ls_documents_reference_number ON native_app.ls_documents (reference_number);
CREATE INDEX IF NOT EXISTS ix_native_ls_documents_status_created ON native_app.ls_documents (status, created_at DESC);

CREATE TABLE IF NOT EXISTS native_app.notifications (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text NULL,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    read_at timestamptz NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_notifications_user_created ON native_app.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_native_notifications_user_is_read ON native_app.notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS ix_native_notifications_type_created ON native_app.notifications (type, created_at DESC);

CREATE TABLE IF NOT EXISTS native_app.po_messages (
    id uuid NOT NULL,
    po_id uuid NOT NULL,
    sender_id uuid NULL,
    created_at timestamptz NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_po_messages_po_created ON native_app.po_messages (po_id, created_at ASC);
CREATE INDEX IF NOT EXISTS ix_native_po_messages_sender_created ON native_app.po_messages (sender_id, created_at DESC);

CREATE TABLE IF NOT EXISTS native_app.bc_audit (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    customs_doc_id uuid NOT NULL,
    action text NOT NULL,
    created_at timestamptz NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS ix_native_bc_audit_customs_created ON native_app.bc_audit (customs_doc_id, created_at DESC);