# Production Deployment Runbook

Dokumen ini ditujukan untuk tim DevOps yang akan melakukan deployment production untuk Thinq Procura.

## Arsitektur Production

Stack yang dipakai saat ini:

- `frontend`: React static build di Nginx
- `backend`: FastAPI / Uvicorn
- `redis`: pub/sub notifikasi dan cross-worker fan-out
- `postgres`: PostgreSQL 17 sebagai storage utama

Alur data:

- aplikasi backend memakai adapter kompatibilitas di `get_db()`
- adapter menerjemahkan operasi Mongo-like route lama ke operasi PostgreSQL
- storage fisik seluruhnya berada di PostgreSQL native schema `native_app`

## Batasan Penting Terkait Partitioning

Project ini sudah berjalan dengan PostgreSQL native pada layer runtime.

Artinya:

- indexing sudah diterapkan pada seluruh logical table yang aktif di aplikasi
- partition bulanan untuk tabel transaksi sudah diterapkan di level SQL schema
- tahap optimasi berikutnya adalah memindahkan route satu per satu ke repository native untuk query plan yang lebih efisien

Logical transaction tables yang harus menjadi target partisi saat migrasi native:

- `prs`
- `pos`
- `tenders`
- `goods_receipts`
- `goods_returns`
- `customs_docs`
- `shipments`
- `invoices`
- `ls_documents`
- `notifications`
- `po_messages`
- `bc_audit`

Rekomendasi desain partition saat migrasi native nanti:

- gunakan range partition bulanan berdasarkan `created_at`
- siapkan retention policy terpisah untuk `notifications`, `po_messages`, dan `bc_audit`
- gunakan subpartition opsional per `vendor_id` atau `department_id` hanya jika volume sudah terbukti tinggi

## Indexing yang Sudah Diaktifkan

Index dibuat otomatis saat startup backend.

Kategori index:

- unique business key: `id`, `email`, `pr_number`, `po_number`, `tender_number`, `invoice_number`, `shipment_number`, `receipt_number`, `return_number`
- transactional access path: `status`, `vendor_id`, `department_id`, `po_id`, `receipt_id`, `created_at`, `due_date`
- dashboard/reporting path: kombinasi `status + created_at`, `vendor_id + created_at`, `department_id + status + created_at`

## Prasyarat Server Production

- Ubuntu 22.04 LTS atau distro setara
- Docker Engine 27+
- Docker Compose Plugin 2.29+
- CPU minimal 4 vCPU
- RAM minimal 8 GB
- Disk SSD minimal 100 GB
- reverse proxy atau load balancer di depan frontend/backend
- DNS production untuk domain aplikasi
- TLS certificate valid

## Struktur File Environment

Buat file `.env.production` di root project berdasarkan `.env.production.example`.

Nilai minimum yang wajib diisi:

```env
DOMAIN_NAME=procura.example.com
ACME_EMAIL=devops@example.com
IMAGE_TAG=latest
BACKEND_IMAGE_REPO=thinq-procura-backend
FRONTEND_IMAGE_REPO=thinq-procura-frontend

POSTGRES_USER=procura
POSTGRES_PASSWORD=ganti-password-kuat
POSTGRES_DB=postgres

ADMIN_EMAIL=admin@domain-anda.com
ADMIN_PASSWORD=ganti-admin-password-kuat
JWT_SECRET=ganti-jwt-secret-panjang-minimal-32-byte
WEBHOOK_CRON_SECRET=ganti-cron-secret-kuat

FRONTEND_URL=https://procura.domain-anda.com
REACT_APP_BACKEND_URL=

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=xxxxx
SUPABASE_BUCKET=ls-documents

PG_NATIVE_DSN=postgresql://procura:ganti-password-kuat@postgres:5432/postgres
```

Catatan:

- `REACT_APP_BACKEND_URL` dikosongkan jika frontend akan memakai reverse proxy `/api`
- jangan expose `postgres` dan `redis` ke public internet

## Deployment Production

### 1. Clone source

```powershell
git clone <repo-url>
cd thinq-procura
```

### 2. Siapkan environment

```powershell
copy .env.production.example .env.production
```

Edit `.env.production` sesuai environment production.

### 3. Build dan start service

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Atau gunakan script:

```bash
ENV_FILE=.env.production ./ops/production/deploy-prod.sh
```

Jika ingin deploy tag image tertentu:

```bash
IMAGE_TAG_OVERRIDE=2026.08.21-01 ENV_FILE=.env.production ./ops/production/deploy-prod.sh
```

### 4. Verifikasi service

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production logs backend --tail 100
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production logs proxy --tail 100
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production logs postgres --tail 100
```

### 5. Health check

```powershell
curl https://procura.domain-anda.com/api/
curl https://procura.domain-anda.com/
```

Expected:

- backend mengembalikan JSON versi API
- frontend mengembalikan HTTP 200

## Reverse Proxy Recommendation

Pada mode production override, reverse proxy memakai Caddy.

Routing minimal:

- `https://procura.domain-anda.com/` -> `frontend:80`
- `https://procura.domain-anda.com/api/` -> `backend:8000`

Caddy akan menangani HTTPS otomatis jika domain public sudah mengarah ke server dan port 80/443 terbuka.

## Security Checklist

- ganti semua default password pada `.env`
- gunakan TLS termination di reverse proxy
- batasi akses SSH hanya dari IP admin
- aktifkan firewall untuk port 80/443 saja
- jangan publish port database ke luar host
- aktifkan backup volume PostgreSQL harian
- aktifkan rotasi log Docker

## Backup dan Restore

### Backup volume PostgreSQL

Minimal lakukan snapshot harian untuk volume `thinq-procura_postgres_data`.

Backup logical yang disiapkan di repo:

```bash
ENV_FILE=.env.production ./ops/production/backup-postgres.sh
```

Jika memakai host backup manual:

```powershell
docker run --rm -v thinq-procura_postgres_data:/source -v ${PWD}:/backup alpine sh -c "cd /source && tar czf /backup/postgres_data_$(date +%F).tgz ."
```

### Restore volume PostgreSQL

Proses restore harus dilakukan saat service dimatikan:

```powershell
docker compose down
```

Lalu restore isi volume sesuai tool backup yang dipakai tim infra.

## Health Check Operasional

Script health check production:

```bash
ENV_FILE=.env.production ./ops/production/healthcheck-prod.sh
```

Contoh cron disediakan di:

- [ops/production/crontab.example](ops/production/crontab.example)

## Rollback SOP

Langkah rollback minimum:

1. Pastikan backup terbaru tersedia.
2. Identifikasi image/tag terakhir yang stabil.
3. Jalankan rollback script dengan tag tersebut.
4. Verifikasi endpoint `/api/`, frontend root, dan login admin.

Panduan rollback cepat ada di:

- [ops/production/rollback-prod.sh](ops/production/rollback-prod.sh)

## Scaling Guidance

### Backend

- mulai dari 1 container backend
- aktifkan multi-worker hanya jika load nyata sudah terlihat
- bila multi-worker digunakan, Redis pub/sub wajib tetap aktif

### PostgreSQL

- monitor disk growth, connection count, dan latency I/O
- monitor ukuran partisi transaksi bulanan dan index bloat
- jalankan maintenance periodik (`VACUUM`, `ANALYZE`, `REINDEX` saat diperlukan)

## Roadmap Optimasi Native Repository

Adapter PostgreSQL pusat menjaga kompatibilitas route lama. Untuk performa production jangka panjang, tetap lanjutkan optimasi ini:

1. migrasikan route read/write dengan traffic tertinggi ke repository native
2. gunakan query SQL terarah yang memanfaatkan index komposit per use case
3. evaluasi `EXPLAIN (ANALYZE, BUFFERS)` untuk endpoint kritikal
4. terapkan retention/archive job untuk tabel transaksi ber-volume tinggi
5. pertahankan adapter hanya sebagai compatibility layer untuk endpoint yang belum dimigrasi

Saat coverage native sudah cukup, aktifkan mode fallback minimal:

- `PG_COMPAT_MODE=minimal`

Mode ini menonaktifkan operasi compatibility yang mahal (mis. `aggregate`/`distinct`) dan membatasi update operator.

## Migrasi Data Historis (Opsional)

Script sync koleksi legacy ke schema `native_app.*` ada di:

- [backend/sync_native_pg.py](backend/sync_native_pg.py)

Contoh eksekusi:

```bash
cd backend
MONGO_URL='mongodb://legacy-mongo-host:27017/' DB_NAME='thinq_procura' PG_NATIVE_DSN='postgresql://procura:password@postgres:5432/postgres' python sync_native_pg.py
```

Mode incremental berbasis watermark `updated_at` atau `created_at`:

```bash
cd backend
MONGO_URL='mongodb://legacy-mongo-host:27017/' DB_NAME='thinq_procura' PG_NATIVE_DSN='postgresql://procura:password@postgres:5432/postgres' python sync_native_pg.py --incremental
```

Repository PostgreSQL native tahap awal untuk modul prioritas ada di:

- [backend/native_pg_repositories.py](backend/native_pg_repositories.py)

Read path aplikasi sekarang sudah berada di adapter PostgreSQL pusat via `get_db()`.

## Benchmark Query PR/PO

Untuk validasi tuning index endpoint list PR/PO, jalankan:

```bash
cd backend
PG_NATIVE_DSN='postgresql://procura:password@postgres:5432/postgres' python benchmark_pr_po_explain.py
```

Output berisi `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` untuk query count dan list pada beberapa skenario filter/search.

Catatan:

- gunakan kredensial PostgreSQL production yang valid pada `PG_NATIVE_DSN`
- alternatif aman: jalankan benchmark dari dalam container backend agar host/user/password konsisten dengan runtime