# Redis Pub/Sub — Panduan Deploy Production

## Kapan Perlu Redis?
Aktifkan Redis pub/sub **hanya bila** aplikasi di-scale ke multi-worker uvicorn atau multi-instance
(mis. `--workers 4` atau di-deploy ke banyak pod Kubernetes di belakang load-balancer).

Dalam single-worker mode (default preview & development), fan-out SSE sudah berjalan sempurna
via in-process `asyncio.Queue` di `routes_notifications.py::_subscribers`. Tidak butuh Redis.

## Kenapa?
Server-Sent Events adalah HTTP long-connection yang **sticky** ke satu worker. Bila user A
tersambung SSE ke worker-1, tapi event `create_notification` untuk user A dijalankan di
worker-2 (mis. saat vendor kirim RFQ reply), event tidak akan sampai kecuali ada mekanisme
pub/sub antar-worker. Redis menyelesaikan ini dengan channel broadcasting.

## Deploy Checklist

### 1. Sediakan Redis
- **DigitalOcean / AWS Elasticache**: 512 MB tier sudah cukup.
- **Docker lokal**: `docker run -d --name redis -p 6379:6379 redis:7-alpine`
- **Managed (Upstash / Redis Cloud)**: free tier 30 MB tersedia.

### 2. Install client
```bash
cd /app/backend
pip install "redis>=4.2"
pip freeze > requirements.txt
```

### 3. Set env
Tambahkan ke `/app/backend/.env` (jangan di-hardcode ke code):
```
REDIS_URL=redis://:PASSWORD@HOST:6379/0
```
Format lain yang didukung:
- Tanpa password: `redis://HOST:6379/0`
- TLS (Upstash): `rediss://:PASSWORD@HOST:6379/0`
- Sentinel: gunakan `redis-py` sentinel URL format.

### 4. Restart backend
```bash
sudo supervisorctl restart backend
```

Cek log — Anda akan lihat:
```
epr.redis - INFO - Redis pub/sub connected: redis://...
```

### 5. Subscribe worker (opsional untuk multi-worker fan-in)
`redis_pubsub.py::subscribe_worker(callback)` sudah tersedia. Untuk mengaktifkan fan-in,
tambahkan ke startup event di `server.py`:

```python
from redis_pubsub import subscribe_worker
from routes_notifications import _publish

@app.on_event("startup")
async def _start_redis_sub():
    asyncio.create_task(subscribe_worker(lambda uid, payload: _publish(uid, payload)))
```

Setiap worker akan:
1. Subscribe ke pattern `epr:notif:*`
2. Ketika ada pesan masuk dari worker lain, forward ke `_subscribers` local — yang lalu
   push ke SSE clients yang sedang connect di worker ini.

### 6. Test end-to-end
Buka 2 tab browser dengan user yang sama (bell SSE aktif). Trigger RFQ reply dari terminal:
```bash
curl -X POST $API_URL/api/vendor-portal/rfqs/PO_ID/reply \
     -H "Authorization: Bearer $VENDOR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"can_fulfill":true,"items":[]}'
```
Kedua tab (mungkin di worker berbeda) harus menerima toast notifikasi hampir bersamaan.

## Monitoring
- **Metric**: `redis-cli info clients` → jumlah subscriber (harus = jumlah worker aktif).
- **Log**: level WARNING di `epr.redis` logger indikasi Redis down — SSE otomatis fallback ke
  in-process mode (client SSE di worker itu tetap dapat notif lokalnya).

## Troubleshooting
| Gejala | Kemungkinan Penyebab | Fix |
|---|---|---|
| SSE tidak update tab kedua | Redis subscribe task tidak jalan | Tambah `subscribe_worker` task di startup event |
| Log "Redis unavailable" saat startup | URL salah / firewall | Verifikasi `redis-cli -u $REDIS_URL ping` |
| Duplicate notifications | Dua worker publish + subscribe sendiri (loop) | Filter di `subscribe_worker`: skip payload yang originatenya sama |
| Latency > 500ms | Redis di region berbeda | Deploy Redis same-region |

## Rollback ke Single-Worker
1. Unset `REDIS_URL` di `.env`
2. Restart backend
3. `_get_client()` akan return None dan `publish_to_redis` menjadi no-op → fallback ke
   in-process fan-out (bekerja tapi hanya untuk worker yang sama).

## Alternatif
Bila tidak ingin dependency baru, opsi lain:
- **PostgreSQL LISTEN/NOTIFY** — jika sudah pakai Postgres.
- **NATS** — lightweight, tapi butuh install.
- **MongoDB Change Streams** — sudah pakai MongoDB; watch collection `notifications`. Trade-off:
  latency ~200-500ms dan butuh replica set.

Untuk sekarang **Redis paling sederhana + latency <10ms + tooling matang**.
