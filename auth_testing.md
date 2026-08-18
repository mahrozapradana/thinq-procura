# Auth Testing

## Admin
- Email: `mahrozapradana46@gmail.com`
- Password: `admin123`
- Role: `admin`

## Endpoints
- POST /api/auth/login  – body `{email, password}`, sets httpOnly cookies + returns `{user, access_token}`
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/vendor/register – public

## Quick test
```
curl -c /tmp/c.txt -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"mahrozapradana46@gmail.com","password":"admin123"}'
curl -b /tmp/c.txt http://localhost:8001/api/auth/me
```
