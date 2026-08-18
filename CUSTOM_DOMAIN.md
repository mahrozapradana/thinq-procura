# Custom Domain Setup — Multi-Tenant White-Label

Setiap tenant dapat memiliki subdomain/domain sendiri (mis. `procura.namaperusahaan.com`)
untuk pengalaman full white-label.

## Arsitektur
```
User browser  ──►  procura.perusahaan.com  ──►  Reverse Proxy (Cloudflare/Nginx)
                                               │
                                               ├──►  Frontend (React) — sama untuk semua tenant
                                               └──►  Backend (FastAPI) — resolve tenant via Host header
```

Backend menyimpan `custom_domain` di `company_settings`. Middleware kelak dapat me-lookup
tenant dari `Host:` header agar API dan branding auto-scope.

## Setup Step-by-Step

### 1. Pilih domain
Contoh: `procura.acmegroup.co.id`

### 2. Tambahkan CNAME di DNS domain client
```
procura.acmegroup.co.id.  CNAME  <preview-url-produksi>.emergentagent.com.
```
(Untuk deploy internal Emergent — gunakan A record ke IP LB bila host non-managed.)

### 3. Simpan custom_domain di Settings
`Settings → Company → Custom Domain` input: `procura.acmegroup.co.id`
Backend akan return field ini saat frontend query `/settings/company`.

### 4. SSL Certificate
- **Managed platform (Emergent/Vercel/Netlify)**: SSL auto-issue via Let's Encrypt setelah DNS resolve.
- **Self-hosted (Nginx/Traefik)**: gunakan `certbot certonly --nginx -d procura.acmegroup.co.id`.

### 5. CORS Update
Tambahkan domain ke allowed origins di `backend/server.py`:
```python
ALLOWED_ORIGINS = [
    "https://*.emergentagent.com",
    "https://procura.acmegroup.co.id",  # per-tenant
]
```
Atau lebih baik: wildcard subdomain regex untuk auto-scale.

### 6. Frontend Brand Sync
Frontend Layout.jsx mount → auto `applyBrandPalette()` dari `/settings/company` sehingga
warna, logo, dan judul otomatis sesuai tenant yang sedang di-akses.

## Multi-Tenant Isolation (Future)
Untuk mendukung >1 tenant di satu deployment:

1. Tambah `tenant_id` di semua koleksi utama (`prs`, `pos`, `vendors`, dst)
2. Middleware: resolve `tenant_id` dari `Host` header, inject ke request state
3. Semua query filter `{tenant_id: request.state.tenant_id}`
4. Users login ter-scope tenant via subdomain

Saat ini deployment single-tenant per instance — cocok untuk enterprise on-premise.

## Testing Custom Domain
```bash
# Verify DNS
dig procura.acmegroup.co.id

# Verify SSL
curl -I https://procura.acmegroup.co.id/api/dashboard/stats

# Verify branding pulled
curl https://procura.acmegroup.co.id/api/settings/company | jq '.brand_color, .brand_logo_url, .custom_domain'
```

## Rollback
Set `custom_domain` di Settings ke null, hapus CNAME record. App tetap accessible via
preview URL default.

## Roadmap
- P4: Otomatis auto-issue SSL via ACME saat custom_domain di-set (via Traefik integration)
- P4: Email template ganti nama pengirim + logo sesuai tenant
- P5: Custom SMTP per-tenant (bukan singleton) supaya email keluar dari domain tenant
