# Native PostgreSQL Migration Scaffold

Folder ini adalah fondasi dan baseline runtime PostgreSQL native untuk backend.

Tujuannya bukan mengganti backend sekaligus, tetapi menyiapkan:

- schema PostgreSQL native
- model hybrid relational + `jsonb`
- partition range bulanan untuk seluruh tabel transaksi
- jalur migrasi bertahap tanpa harus langsung me-normalisasi seluruh payload nested

## Isi File

- `001_schema.sql`: schema awal native PostgreSQL
- `020_partitions.sql`: helper function untuk membuat partition bulanan dan pre-create window partisi

## Pendekatan Data Model

Untuk mempercepat migrasi, tabel native memakai pendekatan hybrid:

- kolom yang sering dipakai query dibuat relational
- seluruh payload dokumen asli disimpan di kolom `payload jsonb`

Ini memberi tiga keuntungan:

- query penting bisa langsung memakai index PostgreSQL
- data nested lama tidak harus langsung dipecah ke puluhan child table
- proses cutover bisa dilakukan bertahap per endpoint

## Partitioned Transaction Tables

Tabel berikut dipartisi per bulan berdasarkan `created_at`:

- `native_app.prs`
- `native_app.pos`
- `native_app.tenders`
- `native_app.goods_receipts`
- `native_app.goods_returns`
- `native_app.customs_docs`
- `native_app.shipments`
- `native_app.invoices`
- `native_app.ls_documents`
- `native_app.notifications`
- `native_app.po_messages`
- `native_app.bc_audit`

## Cara Menjalankan DDL

Masuk ke PostgreSQL lalu jalankan:

```sql
\i database/native_pg/001_schema.sql
\i database/native_pg/020_partitions.sql
```

## Tahap Optimasi Berikutnya

1. pertahankan adapter PostgreSQL pusat sebagai compatibility layer route lama
2. pindahkan endpoint transaksi paling berat ke repository native: `prs`, `pos`, `invoices`, `shipments`
3. evaluasi query plan endpoint kritikal dengan `EXPLAIN (ANALYZE, BUFFERS)`
4. lanjutkan normalisasi payload nested yang paling mahal secara bertahap

## Catatan Desain

- parent partitioned tables memakai `PRIMARY KEY (id, created_at)`
- ini dipilih agar partition range `created_at` tetap valid di PostgreSQL native
- lookup `id` tetap cepat karena ada index pada parent/partitioned table, tetapi constraint unique global pada `id` tunggal perlu diputuskan saat cutover penuh