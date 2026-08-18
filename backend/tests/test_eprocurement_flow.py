"""End-to-end backend tests for e-procurement flow.

Covers: auth, masters, vendor registration/approve, budgets, PRs, POs,
tenders, goods receipt, invoices, LS docs, settings/Odoo mock, dashboard.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://procurement-flow-41.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "mahrozapradana46@gmail.com"
ADMIN_PASSWORD = "admin123"

# Shared state (populated across tests within single session)
STATE = {}


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    STATE["admin_user"] = data["user"]
    return s


# ---------------- Auth ----------------
class TestAuth:
    def test_login_admin(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ADMIN_EMAIL
        assert u["role"] == "admin"

    def test_login_wrong_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401


# ---------------- Vendor self-registration ----------------
class TestVendorRegistration:
    def test_public_vendor_register(self):
        unique = uuid.uuid4().hex[:8]
        email = f"TEST_vendor_{unique}@example.com"
        payload = {
            "company_name": f"PT Test Vendor {unique}",
            "name": "Vendor Contact",
            "email": email,
            "phone": "081234567890",
            "npwp": "12.345.678.9-012.000",
            "is_importer": True,
            "categories": ["cat-1"],
        }
        r = requests.post(f"{BASE_URL}/api/vendor/register", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert "vendor_id" in data
        STATE["vendor_id"] = data["vendor_id"]
        STATE["vendor_email"] = email

    def test_vendor_pending_status(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/vendors/{STATE['vendor_id']}")
        assert r.status_code == 200
        assert r.json()["status"] == "pending_approval"


# ---------------- Masters ----------------
class TestMasters:
    def test_create_department(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/departments", json={
            "name": "TEST_Procurement Dept", "code": f"TESTD{uuid.uuid4().hex[:4]}",
            "manager_name": "Mgr"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_Procurement Dept"
        STATE["dept_id"] = d["id"]

    def test_list_departments(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/departments")
        assert r.status_code == 200
        assert any(x["id"] == STATE["dept_id"] for x in r.json())

    def test_create_category(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/categories", json={
            "name": "TEST_Elec", "code": f"TESTC{uuid.uuid4().hex[:4]}"
        })
        assert r.status_code == 200
        STATE["cat_id"] = r.json()["id"]

    def test_create_hs_code(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/hs-codes", json={
            "code": f"8471.30.{uuid.uuid4().hex[:2]}", "description": "TEST_Laptop", "duty_rate": 5.0
        })
        assert r.status_code == 200
        STATE["hs_id"] = r.json()["id"]

    def test_create_product(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/products", json={
            "code": f"TESTP{uuid.uuid4().hex[:4]}",
            "name": "TEST_Laptop", "category_id": STATE["cat_id"],
            "unit": "PCS", "hs_code_id": STATE["hs_id"], "default_price": 15000000.0
        })
        assert r.status_code == 200
        STATE["product_id"] = r.json()["id"]

    def test_update_product(self, admin_client):
        r = admin_client.put(f"{BASE_URL}/api/products/{STATE['product_id']}", json={
            "code": "TESTP_UPD", "name": "TEST_Laptop v2", "unit": "PCS", "default_price": 16000000.0
        })
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Laptop v2"


# ---------------- Internal user creation ----------------
class TestUsersInternal:
    def test_create_requester(self, admin_client):
        email = f"test_req_{uuid.uuid4().hex[:6]}@example.com"
        r = admin_client.post(f"{BASE_URL}/api/users", json={
            "email": email, "name": "TEST Requester", "password": "req12345",
            "role": "requester", "department_id": STATE["dept_id"]
        })
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role"] == "requester"
        assert u["email"] == email
        STATE["requester_email"] = email
        STATE["requester_password"] = "req12345"
        STATE["requester_id"] = u["id"]

    def test_list_users_admin(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/users")
        assert r.status_code == 200
        assert any(u["id"] == STATE["requester_id"] for u in r.json())


# ---------------- Budgets ----------------
class TestBudgets:
    def test_create_budget(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/budgets", json={
            "department_id": STATE["dept_id"], "period": "2026",
            "amount": 100_000_000.0, "note": "TEST budget"
        })
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["status"] == "pending_approval"
        assert b["current_level"] == 1
        STATE["budget_id"] = b["id"]

    def test_approve_budget(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/budgets/{STATE['budget_id']}/approve")
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["status"] == "approved"

    def test_budget_persisted(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/budgets")
        assert r.status_code == 200
        b = next((x for x in r.json() if x["id"] == STATE["budget_id"]), None)
        assert b is not None and b["status"] == "approved"


# ---------------- PR flow ----------------
class TestPRFlow:
    def test_pr_over_budget_rejected(self, admin_client):
        # 200 units * 15jt = 3 milyar > 100jt budget
        r = admin_client.post(f"{BASE_URL}/api/prs", json={
            "department_id": STATE["dept_id"],
            "items": [{"product_id": STATE["product_id"], "product_name": "TEST_Laptop",
                       "qty": 200, "price": 15_000_000}],
        })
        assert r.status_code == 400
        assert "budget" in r.text.lower() or "Melanggar" in r.text

    def test_pr_within_budget_created(self, admin_client):
        # 3 * 15jt = 45jt (< 100jt) and >= 10jt (so triggers L2 procurement)
        # But default admin can approve any level → OK
        r = admin_client.post(f"{BASE_URL}/api/prs", json={
            "department_id": STATE["dept_id"],
            "items": [{"product_id": STATE["product_id"], "product_name": "TEST_Laptop",
                       "qty": 3, "price": 15_000_000}],
            "notes": "TEST PR"
        })
        assert r.status_code == 200, r.text
        pr = r.json()
        assert pr["total"] == 45_000_000
        assert pr["status"] == "pending_approval"
        assert len(pr["approvals"]) >= 2  # L1 + L2 for >=10jt
        STATE["pr_id"] = pr["id"]

    def test_approve_pr_multi_level(self, admin_client):
        # Approve until status becomes approved
        for _ in range(5):
            r = admin_client.get(f"{BASE_URL}/api/prs/{STATE['pr_id']}")
            assert r.status_code == 200
            if r.json()["status"] == "approved":
                break
            r2 = admin_client.post(f"{BASE_URL}/api/prs/{STATE['pr_id']}/approve")
            assert r2.status_code == 200, r2.text
        r = admin_client.get(f"{BASE_URL}/api/prs/{STATE['pr_id']}")
        assert r.json()["status"] == "approved"

    def test_budget_used_after_approval(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/budgets")
        b = next(x for x in r.json() if x["id"] == STATE["budget_id"])
        assert b["used_amount"] == 45_000_000


# ---------------- Vendor approval + login ----------------
class TestVendorApproval:
    def test_approve_vendor(self, admin_client):
        r = admin_client.post(
            f"{BASE_URL}/api/vendors/{STATE['vendor_id']}/approve",
            json={"default_password": "vendor123"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        # Confirm vendor status
        v = admin_client.get(f"{BASE_URL}/api/vendors/{STATE['vendor_id']}").json()
        assert v["status"] == "approved"

    def test_vendor_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STATE["vendor_email"], "password": "vendor123"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        u = data["user"]
        assert u["role"] == "vendor"
        assert u.get("vendor_id") == STATE["vendor_id"]
        STATE["vendor_token"] = data["access_token"]

    def test_vendor_profile(self):
        r = requests.get(f"{BASE_URL}/api/vendor-portal/profile",
                         headers={"Authorization": f"Bearer {STATE['vendor_token']}"})
        assert r.status_code == 200
        assert r.json()["id"] == STATE["vendor_id"]


# ---------------- Tenders ----------------
class TestTenders:
    def test_create_tender(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/tenders", json={
            "title": "TEST Tender", "description": "test",
            "items": [{"product_id": STATE["product_id"], "product_name": "TEST_Laptop", "qty": 10}],
            "invited_vendor_ids": [],  # open
        })
        assert r.status_code == 200, r.text
        STATE["tender_id"] = r.json()["id"]

    def test_open_tender(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/tenders/{STATE['tender_id']}/open")
        assert r.status_code == 200
        t = admin_client.get(f"{BASE_URL}/api/tenders/{STATE['tender_id']}").json()
        assert t["status"] == "open"

    def test_vendor_submit_bid(self):
        r = requests.post(
            f"{BASE_URL}/api/vendor-portal/tenders/{STATE['tender_id']}/bid",
            json={"price": 14_500_000, "delivery_days": 7, "notes": "TEST bid"},
            headers={"Authorization": f"Bearer {STATE['vendor_token']}"},
        )
        assert r.status_code == 200, r.text


# ---------------- PO merge + approval ----------------
class TestPOFlow:
    def test_create_po_from_pr(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/pos", json={
            "pr_ids": [STATE["pr_id"]],
            "vendor_id": STATE["vendor_id"],
            "po_type": "BONDED",
            "notes": "TEST PO",
        })
        assert r.status_code == 200, r.text
        po = r.json()
        assert po["total"] == 45_000_000
        assert po["vendor_id"] == STATE["vendor_id"]
        STATE["po_id"] = po["id"]

        # PR should be converted_to_po
        pr = admin_client.get(f"{BASE_URL}/api/prs/{STATE['pr_id']}").json()
        assert pr["status"] == "converted_to_po"
        assert pr["po_id"] == STATE["po_id"]

    def test_approve_po(self, admin_client):
        for _ in range(4):
            r = admin_client.get(f"{BASE_URL}/api/pos/{STATE['po_id']}").json()
            if r["status"] == "approved":
                break
            r2 = admin_client.post(f"{BASE_URL}/api/pos/{STATE['po_id']}/approve")
            assert r2.status_code == 200, r2.text
        po = admin_client.get(f"{BASE_URL}/api/pos/{STATE['po_id']}").json()
        assert po["status"] == "approved"

    def test_send_po(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/pos/{STATE['po_id']}/send")
        assert r.status_code == 200
        po = admin_client.get(f"{BASE_URL}/api/pos/{STATE['po_id']}").json()
        assert po["status"] == "sent"
        assert po["shipping_status"] == "waiting_delivery"


# ---------------- Goods Receipt ----------------
class TestGoodsReceipt:
    def test_create_goods_receipt(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/goods-receipts", json={
            "po_id": STATE["po_id"],
            "items": [{"product_id": STATE["product_id"], "product_name": "TEST_Laptop",
                       "qty_ordered": 3, "qty_received": 3}],
            "notes": "TEST receipt",
        })
        assert r.status_code == 200, r.text
        STATE["gr_id"] = r.json()["id"]

    def test_po_shipping_completed(self, admin_client):
        po = admin_client.get(f"{BASE_URL}/api/pos/{STATE['po_id']}").json()
        assert po["shipping_status"] == "completed"

    def test_pr_warehouse_completed(self, admin_client):
        pr = admin_client.get(f"{BASE_URL}/api/prs/{STATE['pr_id']}").json()
        assert pr["warehouse_status"] == "completed"


# ---------------- Invoice ----------------
class TestInvoice:
    def test_vendor_submit_invoice(self):
        r = requests.post(
            f"{BASE_URL}/api/vendor-portal/invoices",
            json={"po_id": STATE["po_id"], "amount": 45_000_000, "notes": "TEST inv"},
            headers={"Authorization": f"Bearer {STATE['vendor_token']}"},
        )
        assert r.status_code == 200, r.text
        STATE["invoice_id"] = r.json()["id"]

    def test_admin_list_invoices(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/invoices")
        assert r.status_code == 200
        assert any(inv["id"] == STATE["invoice_id"] for inv in r.json())

    def test_admin_pay_invoice(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/invoices/{STATE['invoice_id']}/pay")
        assert r.status_code == 200
        # Verify persisted
        inv = next(
            inv for inv in admin_client.get(f"{BASE_URL}/api/invoices").json()
            if inv["id"] == STATE["invoice_id"]
        )
        assert inv["status"] == "paid"


# ---------------- LS Documents ----------------
class TestLSDocs:
    def test_vendor_submit_ls(self):
        r = requests.post(
            f"{BASE_URL}/api/vendor-portal/ls-documents",
            json={"doc_type": "LS", "po_id": STATE["po_id"],
                  "reference_number": f"LS-TEST-{uuid.uuid4().hex[:6]}",
                  "hs_codes": ["8471.30.00"]},
            headers={"Authorization": f"Bearer {STATE['vendor_token']}"},
        )
        assert r.status_code == 200, r.text
        STATE["ls_id"] = r.json()["id"]

    def test_admin_list_ls(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/ls-documents")
        assert r.status_code == 200
        assert any(x["id"] == STATE["ls_id"] for x in r.json())


# ---------------- Settings / Odoo mock ----------------
class TestSettings:
    def test_update_company_bonded(self, admin_client):
        r = admin_client.put(f"{BASE_URL}/api/settings/company", json={
            "name": "PT Sample Kawasan Berikat", "is_bonded_zone": True, "currency": "IDR"
        })
        assert r.status_code == 200
        assert r.json()["is_bonded_zone"] is True

    def test_odoo_sync_products_mocked(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/odoo/sync/products")
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["mocked"] is True

    def test_odoo_sync_vendors_mocked(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/odoo/sync/vendors")
        assert r.status_code == 200 and r.json()["mocked"] is True

    def test_odoo_sync_pos_mocked(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/odoo/sync/pos")
        assert r.status_code == 200 and r.json()["mocked"] is True


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_dashboard_stats(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/dashboard/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ["pr_pending", "pr_approved", "po_pending", "po_total",
                  "tender_open", "vendor_pending", "budget_total",
                  "budget_used", "budget_available"]:
            assert k in d
        assert d["budget_total"] >= 100_000_000
        assert d["budget_used"] >= 45_000_000
