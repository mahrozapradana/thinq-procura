"""Iteration 2 tests: per-item budget, reports CSV/PDF, upload LS, Odoo test/sync, SMTP notif settings."""
import os
import io
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://procurement-flow-41.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "mahrozapradana46@gmail.com"
ADMIN_PASSWORD = "admin123"

STATE = {}


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.text}"
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    STATE["admin_user"] = r.json()["user"]
    return s


# ---------- Setup masters: dept + 2 products + dept-level + product-level budgets ----------
class TestPerItemBudgetSetup:
    def test_create_department(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/departments", json={
            "name": "TEST_ITER2_Dept", "code": f"ITER2D{uuid.uuid4().hex[:4]}",
            "manager_name": "Mgr"
        })
        assert r.status_code == 200, r.text
        STATE["dept_id"] = r.json()["id"]

    def test_create_category(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/categories", json={
            "name": "TEST_ITER2_Cat", "code": f"ITER2C{uuid.uuid4().hex[:4]}"
        })
        assert r.status_code == 200
        STATE["cat_id"] = r.json()["id"]

    def test_create_products(self, admin_client):
        for tag in ("P1", "P2"):
            r = admin_client.post(f"{BASE_URL}/api/products", json={
                "code": f"TESTITER2{tag}{uuid.uuid4().hex[:4]}",
                "name": f"TEST_ITER2_{tag}",
                "category_id": STATE["cat_id"],
                "unit": "PCS",
                "default_price": 1_000_000,
            })
            assert r.status_code == 200, r.text
            STATE[f"product_{tag}"] = r.json()["id"]

    def test_create_dept_budget(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/budgets", json={
            "department_id": STATE["dept_id"], "product_id": None,
            "period": "2026", "amount": 10_000_000
        })
        assert r.status_code == 200, r.text
        STATE["budget_dept"] = r.json()["id"]

    def test_create_product_budget(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/budgets", json={
            "department_id": STATE["dept_id"], "product_id": STATE["product_P1"],
            "period": "2026", "amount": 3_000_000
        })
        assert r.status_code == 200, r.text
        STATE["budget_p1"] = r.json()["id"]

    def test_approve_budgets(self, admin_client):
        for bid in (STATE["budget_dept"], STATE["budget_p1"]):
            # some budgets may auto-approve if no workflow; approve if pending
            b = admin_client.get(f"{BASE_URL}/api/budgets").json()
            cur = next(x for x in b if x["id"] == bid)
            if cur["status"] == "pending_approval":
                r = admin_client.post(f"{BASE_URL}/api/budgets/{bid}/approve")
                # Multi-level - keep approving
                for _ in range(4):
                    got = next(x for x in admin_client.get(f"{BASE_URL}/api/budgets").json() if x["id"] == bid)
                    if got["status"] == "approved":
                        break
                    admin_client.post(f"{BASE_URL}/api/budgets/{bid}/approve")
        # Assert approved
        buds = admin_client.get(f"{BASE_URL}/api/budgets").json()
        for bid in (STATE["budget_dept"], STATE["budget_p1"]):
            b = next(x for x in buds if x["id"] == bid)
            assert b["status"] == "approved", f"budget {bid} still {b['status']}"


# ---------- Per-item budget behavior ----------
class TestPerItemBudget:
    def test_pr_two_items_within_budget_ok(self, admin_client):
        # P1 qty=1 price=2jt (uses P1 budget 3jt, 2<3 ok)
        # P2 qty=1 price=5jt (uses dept budget 10jt, 5<10 ok)
        r = admin_client.post(f"{BASE_URL}/api/prs", json={
            "department_id": STATE["dept_id"],
            "items": [
                {"product_id": STATE["product_P1"], "product_name": "P1", "qty": 1, "price": 2_000_000},
                {"product_id": STATE["product_P2"], "product_name": "P2", "qty": 1, "price": 5_000_000},
            ],
            "notes": "TEST_ITER2 mixed budget PR",
        })
        assert r.status_code == 200, r.text
        pr = r.json()
        assert pr["total"] == 7_000_000
        assert "budget_map" in pr
        # Two different budgets referenced
        assert len(pr["budget_map"]) == 2
        STATE["pr_ok_id"] = pr["id"]

    def test_pr_p1_exceeds_product_budget_rejected(self, admin_client):
        # 4jt > 3jt P1 product budget
        r = admin_client.post(f"{BASE_URL}/api/prs", json={
            "department_id": STATE["dept_id"],
            "items": [
                {"product_id": STATE["product_P1"], "product_name": "P1", "qty": 1, "price": 4_000_000},
            ],
        })
        assert r.status_code == 400, r.text
        assert "budget" in r.text.lower() or "melanggar" in r.text.lower()

    def test_approve_pr_consumes_product_budget(self, admin_client):
        pid = STATE["pr_ok_id"]
        for _ in range(5):
            got = admin_client.get(f"{BASE_URL}/api/prs/{pid}").json()
            if got["status"] == "approved":
                break
            r = admin_client.post(f"{BASE_URL}/api/prs/{pid}/approve")
            assert r.status_code == 200, r.text
        pr = admin_client.get(f"{BASE_URL}/api/prs/{pid}").json()
        assert pr["status"] == "approved"

        buds = admin_client.get(f"{BASE_URL}/api/budgets").json()
        bp1 = next(b for b in buds if b["id"] == STATE["budget_p1"])
        bdept = next(b for b in buds if b["id"] == STATE["budget_dept"])
        # P1 budget consumed 2jt (from P1 item)
        assert bp1["used_amount"] == 2_000_000, f"P1 used = {bp1['used_amount']}"
        # Dept budget consumed 5jt (from P2 item)
        assert bdept["used_amount"] == 5_000_000, f"Dept used = {bdept['used_amount']}"


# ---------- Reports ----------
class TestReports:
    @pytest.mark.parametrize("path", ["prs.csv", "pos.csv", "budgets.csv"])
    def test_csv_reports(self, admin_client, path):
        r = admin_client.get(f"{BASE_URL}/api/reports/{path}")
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct, f"content-type={ct}"
        # First line = header
        first_line = r.text.split("\n", 1)[0].strip()
        assert "," in first_line
        assert len(first_line) > 0

    @pytest.mark.parametrize("path", ["prs.pdf", "pos.pdf", "budgets.pdf"])
    def test_pdf_reports(self, admin_client, path):
        r = admin_client.get(f"{BASE_URL}/api/reports/{path}")
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct, f"content-type={ct}"
        assert r.content[:4] == b"%PDF", f"magic bytes: {r.content[:8]!r}"


# ---------- SMTP settings ----------
class TestNotificationSettings:
    def test_get_default_notif(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/settings/notifications")
        assert r.status_code == 200, r.text
        d = r.json()
        # Default doc contains keys
        for k in ("smtp_host", "smtp_port", "enabled", "use_tls"):
            assert k in d

    def test_put_notif_disabled(self, admin_client):
        r = admin_client.put(f"{BASE_URL}/api/settings/notifications", json={
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_username": "u",
            "smtp_password": "p",
            "from_email": "no-reply@example.com",
            "use_tls": True,
            "enabled": False,
        })
        assert r.status_code == 200, r.text
        assert r.json()["smtp_host"] == "smtp.example.com"
        assert r.json()["enabled"] is False

    def test_send_test_email_disabled_no_crash(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/settings/notifications/test", json={"to": "test@example.com"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is False
        assert "message" in d and len(d["message"]) > 0

    def test_notif_non_admin_forbidden(self, admin_client):
        # Create requester
        email = f"test_notif_req_{uuid.uuid4().hex[:6]}@example.com"
        r = admin_client.post(f"{BASE_URL}/api/users", json={
            "email": email, "name": "TEST notif req", "password": "req12345",
            "role": "requester", "department_id": STATE["dept_id"]
        })
        assert r.status_code == 200
        # Login
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "req12345"})
        assert r.status_code == 200
        tok = r.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}
        g = requests.get(f"{BASE_URL}/api/settings/notifications", headers=h)
        assert g.status_code == 403
        p = requests.put(f"{BASE_URL}/api/settings/notifications", headers=h,
                          json={"smtp_host": "x", "enabled": False})
        assert p.status_code == 403


# ---------- Odoo ----------
class TestOdoo:
    def test_odoo_test_disabled(self, admin_client):
        # Ensure disabled
        admin_client.put(f"{BASE_URL}/api/settings/odoo", json={"enabled": False})
        r = admin_client.post(f"{BASE_URL}/api/odoo/test")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is False
        assert "message" in d
        assert "enabled" in d["message"].lower() or "odoo" in d["message"].lower()

    def test_odoo_sync_products_mocked(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/odoo/sync/products")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["mocked"] is True
        assert "synced_count" in d

    def test_odoo_sync_vendors_mocked(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/odoo/sync/vendors")
        assert r.status_code == 200 and r.json()["mocked"] is True

    def test_odoo_sync_pos_mocked(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/odoo/sync/pos")
        assert r.status_code == 200 and r.json()["mocked"] is True


# ---------- Upload LS ----------
class TestUploadLS:
    def test_upload_bucket_missing_returns_502(self, admin_client):
        # Small PDF-like content
        pdf_bytes = b"%PDF-1.4\n%TEST\n1 0 obj\n<<>>\nendobj\ntrailer<<>>\n%%EOF"
        # Use separate session (multipart, not application/json)
        s = requests.Session()
        s.headers.update({"Authorization": admin_client.headers["Authorization"]})
        files = {"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        r = s.post(f"{BASE_URL}/api/uploads/ls", files=files)
        # Bucket may or may not exist. Both acceptable:
        # - If not exists: 502 with bucket + ls-documents mentioned
        # - If exists: 200 with ok:true url
        assert r.status_code in (200, 502), f"unexpected {r.status_code}: {r.text}"
        if r.status_code == 502:
            body = r.text.lower()
            # Cloudflare/ingress may replace 5xx bodies with its own HTML.
            # Accept either the FastAPI JSON detail (with bucket/ls-documents) or ingress HTML.
            if "cloudflare" not in body and "bad gateway" not in body[:200]:
                assert "bucket" in body
                assert "ls-documents" in body
        else:
            j = r.json()
            assert j.get("ok") is True
            assert "url" in j
