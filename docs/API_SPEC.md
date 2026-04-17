# WASL — API Specification

Base URL: `https://api.wasl.sa/v1`
Auth: `Authorization: Bearer <access_token>` (ما عدا public routes)
Content-Type: `application/json` (ما عدا multipart endpoints)
Errors: Unified envelope `{ success: false, error: { code, message, details? } }`

---

## Conventions

### Response Envelope

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "pagination": { "page": 1, "limit": 20, "total": 234 } }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The 'phone' field is required",
    "details": [{ "field": "phone", "rule": "required" }]
  }
}
```

### Error Codes (Canonical)

| Code | HTTP | متى |
|---|---|---|
| `VALIDATION_FAILED` | 422 | Zod failure |
| `UNAUTHORIZED` | 401 | لا token أو expired |
| `FORBIDDEN` | 403 | role/permission mismatch |
| `NOT_FOUND` | 404 | resource مفقود |
| `CONFLICT` | 409 | duplicate / state conflict |
| `RATE_LIMITED` | 429 | rate limit |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | key مستخدم بـ body مختلف |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | الطلب السابق ما زال يُعالَج |
| `PAYMENT_DECLINED` | 402 | bank reject |
| `INSUFFICIENT_BALANCE` | 400 | wallet |
| `SERVICE_UNAVAILABLE` | 503 | working hours / maintenance |
| `INTERNAL_ERROR` | 500 | — |

### Rate Limit Headers

```
X-RateLimit-Limit:      100
X-RateLimit-Remaining:  97
X-RateLimit-Reset:      1744901234
```

### Pagination

Query: `?page=1&limit=20` — max limit = 100.
Response meta as shown.

### Idempotency

على endpoints محددة (مسماة أدناه)، client يُرسل:
```
Idempotency-Key: <uuid-v4>
```
TTL الخادم: 24 ساعة. إعادة نفس المفتاح + نفس البصمة (body hash) = نفس response. مختلف البصمة = `409 IDEMPOTENCY_KEY_CONFLICT`.

---

## 1. Auth

### POST `/auth/send-otp`

يُرسل OTP عبر Authentica v2.

- **Auth:** لا
- **Rate limit:** 3/5min/phone + 5/hour/phone + 10/day/IP
- **Body (Zod):**
  ```ts
  { phone: z.string().regex(/^\+9665\d{8}$/) }
  ```
- **200:** `{ success: true, data: { sent: true, expiresInSeconds: 300 } }`
- **Errors:** 429 (rate), 502 (Authentica down)

### POST `/auth/verify-otp`

يتحقق من OTP ويصدر tokens.

- **Auth:** لا
- **Rate limit:** 5/5min/phone
- **Body:**
  ```ts
  {
    phone:  z.string().regex(/^\+9665\d{8}$/),
    code:   z.string().length(6),
    deviceToken: z.string().optional(),
    devicePlatform: z.enum(['ios', 'android']).optional()
  }
  ```
- **200:**
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "...",
      "refreshToken": "...",
      "isNew": true,
      "user": { "_id": "...", "phone": "...", "role": "client", "status": "pending_profile" }
    }
  }
  ```
- **Errors:** 400 (invalid/expired), 429

### PUT `/auth/complete-profile`

إكمال بعد OTP الأول (اسم + بريد + دور).

- **Auth:** ✓ (access token)
- **Body:**
  ```ts
  {
    name:         z.string().min(2).max(60),
    email:        z.string().email().optional(),
    role:         z.enum(['client', 'provider']).optional(),
    language:     z.enum(['ar', 'en']).default('ar'),
    referralCode: z.string().length(8).optional(),
    consentPdpl:  z.literal(true)
  }
  ```
- **200:** user profile
- **Errors:** 422, 409 (email exists)

### POST `/auth/refresh`

rotation of refresh token — old refresh invalidated.

- **Auth:** لا (يستخدم refresh body)
- **Body:** `{ refreshToken: string }`
- **200:** `{ accessToken, refreshToken }` (new pair)
- **Errors:** 401

### POST `/auth/logout`

- **Auth:** ✓
- **Body:** `{ deviceToken?: string }`
- **200:** `{ success: true }`

---

## 2. Users (Me)

جميع الـ endpoints تحت `/users/me/*` تتطلب auth.

### GET `/users/me`

Returns profile + computed fields (walletBalance, unreadNotifications, activeOrderCount).

### PUT `/users/me`

Update name, email, language.

- **Body:**
  ```ts
  {
    name:     z.string().min(2).max(60).optional(),
    email:    z.string().email().optional(),
    language: z.enum(['ar', 'en']).optional()
  }
  ```

### PUT `/users/me/avatar`

Multipart (`avatar` field، max 5MB، jpg/png/webp).

### POST `/users/me/addresses`

- **Body:**
  ```ts
  {
    label:     z.string().min(1).max(40),
    details:   z.string().max(200).optional(),
    lat:       z.number().min(15).max(33),
    lng:       z.number().min(33).max(55),
    isDefault: z.boolean().optional()
  }
  ```
- **201:** `{ addresses: [...] }`

### PUT `/users/me/addresses/:addressId`

Partial update same schema.

### DELETE `/users/me/addresses/:addressId`

204 على النجاح.

### PUT `/users/me/device-token`

- **Body:**
  ```ts
  {
    deviceToken: z.string().min(20),
    platform:    z.enum(['ios', 'android'])
  }
  ```

### GET `/users/me/wallet`

Returns `{ balance: halalas, currency: 'SAR', isLocked: bool }`.

### GET `/users/me/transactions?page=&limit=&type=`

Paginated ledger postings for user's accounts.

---

## 3. Providers

### POST `/providers/register`

بعد OTP login، client يختار `role=provider` ويكمل ملفه.

- **Auth:** ✓
- **Body:**
  ```ts
  {
    specialty:     z.array(serviceCategoryEnum).min(1),
    subCategories: z.array(z.string()).optional(),
    vehicle: z.object({
      type:        z.string().optional(),
      model:       z.string().optional(),
      year:        z.number().int().min(1990).max(2030).optional(),
      plateNumber: z.string().optional()
    }).optional(),
    serviceRadius: z.number().min(1).max(50).default(10),
    bankInfo: z.object({
      iban:        z.string().regex(/^SA\d{22}$/),
      bankName:    z.string(),
      accountName: z.string()
    })
  }
  ```
- **201:** provider doc with `approvalStatus: "pending"`

### POST `/providers/documents`

Multipart upload لكل مستند بشكل منفصل.

- **Auth:** ✓ (provider)
- **Rate limit:** 10/min
- **Form:**
  - `document` (file)
  - `docType` — enum `nationalId`, `residencePermit`, `drivingLicense`, `profilePhoto`, `professionCard`
  - `side` — optional `front`/`back` (للمستندات ذات وجهين)

### GET `/providers/profile`

### PUT `/providers/profile`

Update vehicle, bankInfo, serviceRadius, subCategories.

### PATCH `/providers/status`

- **Body:** `{ isOnline: boolean }`
- **Guard:** يرفض إذا `approvalStatus !== 'approved'`.

### PATCH `/providers/location`

Rate-limited to 1/5s per user (location spam protection).

- **Body:** `{ lat, lng }`

### GET `/providers/:id/reviews?page=&limit=`

Public reviews visible to all (client_to_provider only).

### GET `/providers/:id`

Public profile: name, avatar, rating, specialty, completedOrders. No PII.

---

## 4. Services Catalog (Public)

### GET `/catalog/banners`

Active banners (language header respected).

### GET `/catalog/categories`

Service categories + subcategories tree.

### GET `/catalog/car-wash-prices`

جدول الأسعار الفعّال.

### GET `/catalog/config/public`

Subset من Config آمن للعرض (workingHours, maintenanceMode, paymentMethods.enabled).

---

## 5. Orders

### POST `/orders`

**Idempotency:** ✓ (مطلوب)
- **Auth:** ✓ (client)
- **Rate limit:** 5/min/user
- **Headers:** `Idempotency-Key: <uuid>`
- **Body:**
  ```ts
  {
    items: z.array(z.object({
      serviceCategory: serviceCategoryEnum,
      subCategoryId:   z.string().optional(),
      details:         z.record(z.any()),    // validated بـ schema خاصة لكل category
      vehicleSize:     z.enum(['small','medium','large']).optional(), // car_wash
      washType:        z.string().optional() // car_wash
    })).min(1).max(5),
    addressId:     z.string().optional(),
    location: z.object({
      lat: z.number(),
      lng: z.number(),
      address: z.string().optional()
    }),
    paymentMethod: z.enum(['wallet','card','apple_pay','tabby','cash']),
    couponCode:    z.string().optional(),
    notes:         z.string().max(500).optional()
  }
  ```
- **201:** Order document مع `status=pending`، broadcasting بدأ asynchronously.
- **Errors:** 422, 503 (working hours), 400 (coupon invalid)

### GET `/orders/my?status=&page=&limit=`

Filter by status. Default: sorted by createdAt desc.

### GET `/orders/:id`

Access control: client owner، provider assigned، or admin.

### PATCH `/orders/:id/accept`

Provider-only. Atomic accept (findOneAndUpdate).

- **Auth:** ✓ (provider)
- **200:** updated order
- **Errors:** 409 (order already taken/no longer available)

### PATCH `/orders/:id/reject`

Provider-only. Adds to rejectedBy، triggers re-broadcast.

### PATCH `/orders/:id/price`

Provider-only (before customer approval).

- **Body:** `{ price: number (halalas), note?: string }`
- **200:** updated order with new agreedPrice + commission

### PATCH `/orders/:id/status`

- **Body:** `{ status: enum, note?: string }`
- **Valid transitions enforced via state machine.**
- **Cancellation after accept = 403** (business rule).

### POST `/orders/:id/photos`

Multipart، `phase=before|after`، up to 10 photos.

- **Auth:** ✓ (provider only)
- **Guard:** `phase='after'` يتطلب status ∈ `arrived`, `in_progress`, `completed`.

### GET `/orders/:id/providers`

Client يطلب قائمة المزوّدين القريبين (للـ "manual choose" style).

### PATCH `/orders/:id/cancel`

Client-only، قبل الـ accept.

- **Body:** `{ reason: string }`

### GET `/orders/:id/timeline`

Full status history.

---

## 6. Bids

### POST `/bids`

**Idempotency:** ✓

- **Auth:** ✓ (provider)
- **Rate limit:** 30/min (anti-fraud velocity)
- **Body:**
  ```ts
  {
    orderId:            z.string(),
    price:              z.number().int().min(100), // halalas ≥ 1 SAR
    note:               z.string().max(500).optional(),
    arrivalTimeMinutes: z.number().int().min(1).max(240).optional()
  }
  ```
- **Headers:** `X-Device-Fingerprint: <hash>` (mobile SDK generates)
- **201:** bid doc
- **Errors:** 409 (duplicate bid per provider per order، or order not broadcasting), 403 (suspended)

### GET `/bids/order/:orderId?sort=price`

- **Auth:** ✓ (client owner or admin)
- Default sorted by price asc.
- Includes provider summary (name, avatar, rating).

### PATCH `/bids/:id/accept`

**Idempotency:** ✓

- **Auth:** ✓ (client)
- Atomic within transaction: accept chosen + reject others + update order.

### PATCH `/bids/:id/reject`

- **Auth:** ✓ (client)

---

## 7. Chat

### GET `/chats/conversations?page=&limit=`

List user's chats with last message preview.

### GET `/chats/order/:orderId`

Create-or-get chat for an order. Requires order has `providerId`.

### GET `/chats/:chatId/messages?page=&limit=&before=`

`before` = message _id for cursor-based pagination (newer-than-cursor). Falls back to offset if omitted.

### POST `/chats/:chatId/messages`

- **Rate limit:** 60/min/user
- **Body:**
  ```ts
  {
    type:    z.enum(['text', 'location']).default('text'),
    content: z.string().max(2000).optional(),
    location: z.object({ lat: z.number(), lng: z.number() }).optional()
  }
  ```
- Must provide content (text) or location (location).

### POST `/chats/:chatId/media`

Multipart. Single image max 5MB. Returns message doc.

---

## 8. Payments

### POST `/payments/coupon/validate`

- **Auth:** ✓
- **Body:** `{ code: string, orderValue: number (halalas) }`
- **200:** `{ coupon: { code, discountAmount, ... } }` or 400

### POST `/payments/wallet/topup`

**Idempotency:** ✓

Initiates a top-up via Moyasar.

- **Auth:** ✓ (client)
- **Rate limit:** 3/min
- **Body:** `{ amount: z.number().int().min(1000).max(500000) }` (min 10 SAR, max 5000 SAR)
- **201:** `{ checkoutUrl, sessionId }` — redirect URL.
- Actual credit happens via Moyasar webhook.

### POST `/payments/wallet/pay`

**Idempotency:** ✓

Pay existing order with wallet balance.

- **Auth:** ✓ (client)
- **Body:** `{ orderId: string }`
- **200:** `{ order }` مع paymentStatus=captured
- **Errors:** 400 (INSUFFICIENT_BALANCE), 409 (already paid)

### POST `/payments/wallet/withdraw`

**Idempotency:** ✓

Provider payout request.

- **Auth:** ✓ (provider)
- **Rate limit:** 3/min
- **Body:** `{ amount: halalas, otpCode: string }` — OTP required for withdrawal.
- **201:** `WithdrawalRequest` with `status=pending`.

### POST `/payments/checkout/card`

**Idempotency:** ✓

Pay with card/Apple Pay via Moyasar.

- **Auth:** ✓
- **Body:** `{ orderId, paymentMethod: 'card'|'apple_pay', returnUrl }`
- **201:** `{ checkoutUrl, sessionId }`

### POST `/payments/checkout/tabby`

**Idempotency:** ✓

- **Auth:** ✓
- **Body:** `{ orderId, returnUrl, cancelUrl }`
- **201:** `{ checkoutUrl, tabbyPaymentId }`

### GET `/payments/transactions?page=&limit=`

User's payment history (derived from ledger).

---

## 9. Payment Webhooks (internal, IP-locked)

### POST `/payments/webhooks/tabby`

- **Auth:** HMAC-SHA256 verification via `X-Signature` header.
- **IP allowlist:** Tabby KSA IPs فقط.
- **Body:** Tabby event payload.
- **200:** `{ received: true }` — لا تُرجع details.
- Actions:
  - `payment.captured` → ledger posting + order.paymentStatus=captured
  - `payment.refunded` → reversal posting
  - `payment.failed` → order.paymentStatus=unpaid, notify client

### POST `/payments/webhooks/moyasar`

- **Auth:** HMAC via shared secret.
- **IP allowlist:** Moyasar IPs.
- Similar actions: paid, refunded, voided.

---

## 10. Reviews

### POST `/reviews`

- **Auth:** ✓
- **Body:**
  ```ts
  {
    orderId: z.string(),
    rating:  z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional()
  }
  ```
- **Guards:**
  - Order.status = `completed`.
  - Reviewer is client or provider.
  - Not already reviewed (409).
- Side effects (async via queue): recalc toUser rating، checkAutoSuspend.

### GET `/reviews/user/:userId?page=&limit=`

Public reviews (role=client_to_provider, isVisibleToPublic, not deleted).

---

## 11. Notifications

### GET `/notifications?page=&limit=&unread=`

### PATCH `/notifications/:id/read`

### PATCH `/notifications/read-all`

### GET `/notifications/unread-count`

---

## 12. Referral

### GET `/referral/my-code`

Returns user's referralCode + stats (referred count, rewards earned).

### POST `/referral/redeem`

- **Body:** `{ code: string }`
- Applied at registration; if already registered, returns 409.

---

## 13. Masked Phone

### POST `/masked-phone/session`

**Idempotency:** ✓

- **Auth:** ✓
- **Body:** `{ orderId: string }`
- **Guards:** caller is client or provider of order; status ∈ `accepted`, `on_the_way`, `arrived`, `in_progress`.
- **200:** `{ maskedNumber: "+966-XXXX", expiresAt: ISO }`
- المكالمة الفعلية تمر عبر Unifonic؛ WASL لا يستضيف الـ call نفسه.

---

## 14. DSR (PDPL)

### POST `/dsr/export`

- **Auth:** ✓
- **Body:** `{ reason?: string }`
- **Rate limit:** 1/month/user
- **202 Accepted:** request queued. When ready، user receives push + email with signed URL (expires 7 يوم).

### POST `/dsr/erasure`

- **Auth:** ✓ + OTP verification step separate (sensitive).
- **Body:** `{ otpCode: string }`
- **202 Accepted:** account scheduled for deletion in 30 يوم (cancelable during grace).

### PATCH `/dsr/consent`

- **Body:** `{ marketing: boolean }`

---

## 15. Admin

جميعها تحت `/admin/*`. يتطلب Admin JWT + MFA-verified claim.

### Admin Auth

#### POST `/admin/auth/login`

- **Auth:** لا
- **Rate limit:** 5/5min/IP + 3/15min/email
- **Body:** `{ email, password }`
- **200:** `{ accessToken, refreshToken, mfaRequired: true }` إذا MFA مفعّل، otherwise tokens كاملة.

#### POST `/admin/auth/verify-mfa`

- **Body:** `{ mfaToken: string, code: string }` — TOTP.
- **200:** `{ accessToken, refreshToken }` final.

#### POST `/admin/auth/logout`

### Dashboard

#### GET `/admin/dashboard/stats`

Totals: users, providers, orders (today/month/all), revenue, active orders, pending providers.

#### GET `/admin/dashboard/live`

Live metrics (concurrent users, active orders by status). Cached 10s.

### Users

- `GET /admin/users?search=&role=&status=&page=`
- `GET /admin/users/:id`
- `PATCH /admin/users/:id/suspend` — body `{ note }`
- `PATCH /admin/users/:id/activate`
- `DELETE /admin/users/:id` — soft delete (DSR-aware)

### Providers

- `GET /admin/providers/pending?page=`
- `PATCH /admin/providers/:id/approve`
- `PATCH /admin/providers/:id/reject` — body `{ note }`
- `PATCH /admin/providers/:id/documents/:docType/verify` — body `{ verified: true }`
- `GET /admin/providers/:id/performance`

### Orders

- `GET /admin/orders?status=&category=&from=&to=&page=`
- `GET /admin/orders/:id`
- `PATCH /admin/orders/:id/force-cancel` — body `{ reason }` — audit-logged
- `POST /admin/orders/:id/refund` — body `{ reason, amount? }` — defaults to full

### Bids

- `GET /admin/bids?orderId=&page=`

### Financial Reports

- `GET /admin/reports/revenue?from=&to=&groupBy=day|month`
- `GET /admin/reports/providers-performance?page=`
- `GET /admin/reports/ledger/account/:accountId?from=&to=`
- `GET /admin/reports/ledger/trial-balance`
- `POST /admin/reports/export/:reportType` — CSV/Excel async → email link

### Payouts

- `GET /admin/payouts?status=&page=`
- `GET /admin/payouts/:id`
- `PATCH /admin/payouts/:id/approve`
- `PATCH /admin/payouts/:id/reject` — body `{ reason }`
- `POST /admin/payouts/weekly/generate` — manual trigger
- `POST /admin/payouts/:id/export-sarie` — generates bank file

### Withdrawals

- `GET /admin/withdrawals?status=&page=`
- `PATCH /admin/withdrawals/:id/approve`
- `PATCH /admin/withdrawals/:id/reject`

### Reviews

- `GET /admin/reviews?role=&page=`
- `DELETE /admin/reviews/:id` — body `{ reason }` — audit-logged

### Coupons

- `GET /admin/coupons?active=&page=`
- `POST /admin/coupons` — full Coupon body
- `PUT /admin/coupons/:id`
- `PATCH /admin/coupons/:id/toggle`
- `DELETE /admin/coupons/:id`

### Configuration

- `GET /admin/configs`
- `PUT /admin/configs` — body `{ key, value }`
- `GET /admin/configs/history` — audit trail

### Catalog

- `CRUD /admin/catalog/subcategories`
- `CRUD /admin/catalog/car-wash-prices`
- `CRUD /admin/catalog/banners`

### Notifications

- `POST /admin/notifications/broadcast` — body `{ title_ar, title_en, body_ar, body_en, role, segment? }`
- `GET /admin/notifications/jobs` — queue status

### Audit Log

- `GET /admin/audit-logs?actor=&target=&action=&from=&to=&page=`

### DSR

- `GET /admin/dsr?status=&page=`
- `PATCH /admin/dsr/:id/process` — body `{ action: 'approve'|'reject', reason? }`

### Fraud

- `GET /admin/fraud-flags?severity=&resolved=&page=`
- `PATCH /admin/fraud-flags/:id/resolve` — body `{ action, note }`

### System Health

- `GET /admin/health/queues` — BullMQ status per queue
- `GET /admin/health/reconciliation` — ledger trial balance status
- `GET /admin/health/integrations` — last webhook times, FCM quota usage

---

## 16. Internal / Health

### GET `/health`

Returns 200 if process alive. No auth.

### GET `/health/deep`

Checks Mongo + Redis + BullMQ queues. Returns 200 with component status or 503.

- **Auth:** ✓ (internal token عبر `X-Health-Token` env)

### GET `/metrics`

Prometheus exposition. Restricted via WAF + internal IP.

---

## 17. Pagination & Filtering Conventions

- `?page=<n>` و `?limit=<n>` — قاعدة موحدة.
- `?sort=<field>:<asc|desc>` — لبعض endpoints (reviews, bids, admin lists).
- `?from=<ISO>` و `?to=<ISO>` — لـ date-range filters.
- Cursor pagination يُستخدم في: chat messages، audit logs (قوائم طويلة جداً).

---

## 18. Versioning

- URL versioning: `/v1/...`.
- breaking changes → `/v2/` جديد مع overlap ≥6 أشهر.
- `Deprecation: true` header + `Sunset: <date>` للـ endpoints المنتهية.

---

## 19. OpenAPI Generation

كل Zod schema يُحوَّل إلى OpenAPI 3.1 عبر `zod-to-openapi`. spec مُنشور على:
- `/docs` (Swagger UI، limited to staging)
- `/openapi.json` (raw)

Frontend team تستهلكه عبر `openapi-generator` لـ TypeScript client + Dart client (Flutter).

---

## 20. Rate Limit Summary Table

| Endpoint | Limit |
|---|---|
| `POST /auth/send-otp` | 3/5min/phone, 5/h/phone, 10/day/IP |
| `POST /auth/verify-otp` | 5/5min/phone |
| `POST /admin/auth/login` | 5/5min/IP, 3/15min/email |
| `POST /orders` | 5/min/user |
| `POST /bids` | 30/min/provider |
| `POST /payments/*` | 20/min/user |
| `POST /payments/wallet/topup` | 3/min/user |
| `POST /payments/wallet/withdraw` | 3/min/user |
| `POST /chats/:id/messages` | 60/min/user |
| `POST /chats/:id/media` | 10/min/user |
| `PATCH /providers/location` | 1/5s/user |
| `POST /dsr/export` | 1/month/user |
| Default | 100/min/user |
| Global (IP) | 1000/min/IP |

---

## 21. Idempotency-Protected Endpoints

| Endpoint | TTL |
|---|---|
| `POST /orders` | 24h |
| `POST /bids` | 24h |
| `PATCH /bids/:id/accept` | 24h |
| `POST /payments/wallet/topup` | 24h |
| `POST /payments/wallet/pay` | 24h |
| `POST /payments/wallet/withdraw` | 24h |
| `POST /payments/checkout/card` | 24h |
| `POST /payments/checkout/tabby` | 24h |
| `POST /masked-phone/session` | 1h |

كل الباقي: idempotency اختيارية (الـ client قد يرسل header لكن غير إلزامي).
