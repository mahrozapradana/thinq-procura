# Thinq Procura

Stack Docker untuk project ini sekarang memakai:

- Frontend React di Nginx
- Backend FastAPI (Python)
- Redis untuk pub/sub notifikasi
- PostgreSQL sebagai storage utama (native)

## Arsitektur Data Saat Ini

Backend route lama tetap menggunakan pola akses Mongo-like (`find`, `find_one`, `update_one`, `aggregate`, dan lainnya), tetapi sekarang dijalankan oleh adapter kompatibilitas PostgreSQL di [backend/pg_mongo_adapter.py](backend/pg_mongo_adapter.py). Titik masuk pusatnya ada di [backend/db_models.py](backend/db_models.py) lewat `get_db()`.

Artinya:

- runtime app tidak lagi bergantung pada Motor/FerretDB
- seluruh data akses route lama tetap hidup di atas PostgreSQL
- migrasi performa dilanjutkan bertahap route-per-route ke repository native

## File yang ditambahkan

- [docker-compose.yml](docker-compose.yml)
- [backend/Dockerfile](backend/Dockerfile)
- [frontend/Dockerfile](frontend/Dockerfile)
- [frontend/nginx.conf](frontend/nginx.conf)
- [.env.example](.env.example)
- [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md)
- [docker-compose.prod.yml](docker-compose.prod.yml)
- [database/native_pg/001_schema.sql](database/native_pg/001_schema.sql)
- [database/native_pg/020_partitions.sql](database/native_pg/020_partitions.sql)
- [backend/sync_native_pg.py](backend/sync_native_pg.py)
- [backend/native_pg_repositories.py](backend/native_pg_repositories.py)
- [ops/production/deploy-prod.sh](ops/production/deploy-prod.sh)
- [ops/production/backup-postgres.sh](ops/production/backup-postgres.sh)
- [ops/production/healthcheck-prod.sh](ops/production/healthcheck-prod.sh)
- [ops/production/rollback-prod.sh](ops/production/rollback-prod.sh)
- [ops/production/crontab.example](ops/production/crontab.example)

## Menjalankan stack

1. Copy [.env.example](.env.example) menjadi `.env` di root project lalu isi password/secret yang benar.
2. Jalankan `docker compose up -d --build` dari root project.
3. Akses frontend di `http://localhost:3000`.
4. Akses backend di `http://localhost:8000/api/`.

## Service yang dijalankan

- `postgres`: PostgreSQL 17
- `redis`: cache/pub-sub notifikasi
- `backend`: FastAPI app
- `frontend`: build React yang disajikan Nginx dan mem-proxy `/api` ke backend

## Catatan penting

- `REACT_APP_BACKEND_URL` sengaja dikosongkan untuk build Docker sehingga frontend memakai path relatif `/api` melalui proxy Nginx.
- Jika ingin upload file berjalan, isi `SUPABASE_URL` dan `SUPABASE_KEY` di `.env`.
- Indexing dan partition untuk tabel transaksi dikelola di [database/native_pg/001_schema.sql](database/native_pg/001_schema.sql) dan [database/native_pg/020_partitions.sql](database/native_pg/020_partitions.sql).
- Detail deployment production untuk tim DevOps ada di [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md).
- Override production yang lebih ketat ada di [docker-compose.prod.yml](docker-compose.prod.yml).
- Fondasi migrasi native PostgreSQL dan partition transaksi ada di [database/native_pg/README.md](database/native_pg/README.md).
- Repository native PostgreSQL tahap awal untuk PR, PO, invoice, dan shipment ada di [backend/native_pg_repositories.py](backend/native_pg_repositories.py).
- Tahap lanjutan yang direkomendasikan: rapikan route satu per satu agar menggunakan repository native langsung untuk performa query yang lebih baik.

Read-heavy endpoint yang sudah dipindahkan ke repository native:

- `/api/dashboard/vendor-analytics`
- `/api/reports/prs.csv`, `/api/reports/prs.pdf`
- `/api/reports/pos.csv`, `/api/reports/pos.pdf`
- `/api/reports/budgets.csv`, `/api/reports/budgets.pdf`
- `/api/analytics/branches-comparison`
- `/api/vendor-suggestions`

## Benchmark EXPLAIN ANALYZE

Untuk benchmark query endpoint list PR/PO (count + paginated list) gunakan script:

- [backend/benchmark_pr_po_explain.py](backend/benchmark_pr_po_explain.py)

Contoh:

```powershell
cd backend
set PG_NATIVE_DSN=postgresql://procura:password@localhost:5432/postgres
python benchmark_pr_po_explain.py
```

Script ini mengeksekusi `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` untuk beberapa skenario filter/search.

Jika gagal konek, pastikan `PG_NATIVE_DSN` memakai user/password PostgreSQL yang benar pada environment Anda.

## Compatibility Fallback Mode

Adapter di [backend/pg_mongo_adapter.py](backend/pg_mongo_adapter.py) mendukung mode:

- `PG_COMPAT_MODE=full` (default): semua fitur kompatibilitas yang sekarang dipakai route legacy.
- `PG_COMPAT_MODE=minimal`: hanya fallback minimal (misalnya update hanya `$set`, `aggregate`/`distinct` dinonaktifkan).

Mode `minimal` dipakai setelah coverage route native sudah cukup tinggi.
