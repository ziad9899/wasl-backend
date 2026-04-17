# WASL — Architecture

وثيقة معمارية شاملة لمشروع واصل (منصة Marketplace للخدمات المنزلية في المملكة العربية السعودية).
الهدف: تحمّل 40–70 ألف مستخدم في السنة الأولى، الامتثال لـ PDPL، تكامل مالي موثوق، وقابلية التوسّع الأفقي.

---

## 1. مخطط النظام

```
                           ┌──────────────────────────────────────────┐
                           │                CLIENTS                    │
                           │  iOS App   Android App   Admin Web        │
                           └──────────────┬───────────────────────────┘
                                          │ HTTPS (TLS 1.3)
                                          │ WebSocket (wss)
                                          ▼
                       ┌─────────────────────────────────────┐
                       │   CloudFront / CDN (KSA edge)        │
                       │   WAF + DDoS + mTLS admin              │
                       └─────────────────┬───────────────────┘
                                         │
                                         ▼
                       ┌─────────────────────────────────────┐
                       │   Application Load Balancer          │
                       │   Sticky sessions (WS), Health probes │
                       └─────┬────────────────────┬──────────┘
                             │                    │
               ┌─────────────▼───────────┐  ┌─────▼─────────────────┐
               │   API Node (TS/Express) │  │   API Node #2,#3,...  │
               │   Socket.IO + Adapter   │  │   (identical)          │
               └─┬──┬──┬──┬──┬──────────┘  └────────────────────────┘
                 │  │  │  │  │
    ┌────────────┘  │  │  │  └─────────────────────────────┐
    │               │  │  └────────────┐                   │
    ▼               ▼  ▼               ▼                   ▼
┌─────────┐  ┌──────────┐  ┌─────────────┐  ┌────────────────────────────┐
│ MongoDB │  │  Redis 7 │  │  BullMQ     │  │  Integrations              │
│  Atlas  │  │  Cluster │  │  Workers    │  │  ─────────────              │
│ me-     │  │  (same   │  │  (separate  │  │  Authentica (OTP v2)       │
│ central │  │  region) │  │   process)  │  │  Moyasar (Apple Pay + Mada)│
│ Dammam  │  │          │  │             │  │  Tabby (BNPL)              │
│ M30+    │  │ Pub/Sub  │  │  Queues:    │  │  Firebase FCM              │
│ replica │  │  Rate    │  │  - broadcast│  │  Cloudinary / S3 KSA       │
│ set RS  │  │  limit   │  │  - fcm      │  │  Unifonic (Masked Voice)   │
│ TLS+IP  │  │  Idempot │  │  - payouts  │  │  Sentry (APM)              │
│ allow   │  │  Sockets │  │  - rating   │  │                            │
│         │  │  Queues  │  │  - fraud    │  └────────────────────────────┘
└─────────┘  └──────────┘  │  - masked   │
                           │  - cleanup  │
                           └─────────────┘
```

الطبقات الرئيسية من الأعلى للأسفل:

1. **Edge layer** — CloudFront/AWS WAF، rate limit على IP، geo-blocking (KSA فقط في V1 إن احتاج).
2. **Load balancer** — ALB مع sticky sessions لـ WebSocket.
3. **API nodes** — عمليات Node.js stateless، كل عملية تحتضن HTTP + Socket.IO عبر نفس الـ port. عددها قابل للتوسع تلقائياً حسب CPU.
4. **Workers** — عمليات مستقلة لتشغيل BullMQ jobs. لا تستقبل traffic مباشر.
5. **State tier** — MongoDB Atlas و Redis Cluster، كلاهما داخل KSA region.
6. **Integrations** — خدمات طرف ثالث معزولة خلف module خاص لكل واحدة.

---

## 2. Stack التقني

| الطبقة | الاختيار | السبب |
|---|---|---|
| Runtime | Node.js 20 LTS | استقرار + ES2023 |
| اللغة | TypeScript 5.x (strict) | type safety لمشروع مالي |
| HTTP framework | Express 4 | نضج + ecosystem |
| Validation | Zod | schema + type inference |
| ORM | Mongoose 8 | يدعم transactions + populate |
| DB | MongoDB Atlas M30+ (Dammam) | PDPL residency |
| Cache/Pub-Sub | Redis 7.2+ (Sharded) | adapter + BullMQ + rate limit |
| Real-time | Socket.IO 4 + `@socket.io/redis-adapter` sharded | horizontal scaling |
| Queues | BullMQ | Redis-native، reliable |
| Logging | pino + pino-http | JSON structured، APM-friendly |
| Password | argon2 | FIPS/OWASP recommended |
| Date | date-fns + date-fns-tz (Asia/Riyadh) | immutable، tree-shakable |
| File upload | multer 2 + Cloudinary (DPA) / S3 KSA | PDPL-aware |
| APM | Sentry + Prometheus (prom-client) | observability |
| Auth | JWT (RS256) + refresh rotation | stateless + rotateable |
| OTP | Authentica API v2 | local KSA provider |
| Payments | Moyasar (Apple Pay/Mada/Visa) + Tabby SDK | licensed in KSA |
| Push | Firebase Admin SDK | iOS + Android unified |
| Masked voice | Unifonic | local licensed |
| Containerization | Docker + Docker Compose (dev) / ECS Fargate (prod) | — |

**حزم محذوفة مقارنة بالكود الحالي:** `bcryptjs`, `winston`, `express-validator`, `xss-clean`, `express-mongo-sanitize`, `bull`, `morgan`.

---

## 3. Modules & Folder Layout

```
src/
  config/
    env.ts                (Zod-validated process.env)
    database.ts           (mongoose connect + events)
    redis.ts              (ioredis clients — main, sub, bullmq)
    logger.ts             (pino)
    sentry.ts
  constants/
    order-status.ts
    service-categories.ts
    commission.ts
    error-codes.ts
    ledger-accounts.ts
  shared/
    errors/
      base.ts             (DomainError)
      validation.ts
      not-found.ts
      auth.ts
      payment.ts
      conflict.ts
      rate-limit.ts
    middleware/
      async-handler.ts
      auth.ts             (JWT protect, restrictTo)
      rbac.ts             (permissions)
      validate.ts         (Zod adapter)
      rate-limit.ts       (rate-limiter-flexible)
      idempotency.ts
      working-hours.ts
      audit-log.ts
      correlation-id.ts
      error-handler.ts
    utils/
      geo.ts
      money.ts            (Dinero-like helper: SAR halalas)
      phone.ts            (E.164 normalization)
      pagination.ts
      crypto.ts           (hmac, hash)
    types/
      api.ts
      express.d.ts
  modules/
    auth/
      auth.controller.ts
      auth.service.ts
      auth.routes.ts
      auth.schema.ts
    admin/
      admin.controller.ts
      admin.service.ts
      admin.routes.ts
      admin.schema.ts
      admin.auth.ts       (separate password + MFA)
    customers/
      customers.controller.ts
      customers.service.ts
      customers.routes.ts
      customers.schema.ts
    providers/
      providers.controller.ts
      providers.service.ts
      providers.repository.ts
      providers.routes.ts
      providers.schema.ts
      providers.model.ts
    orders/
      orders.controller.ts
      orders.service.ts
      orders.broadcast.service.ts
      orders.repository.ts
      orders.routes.ts
      orders.schema.ts
      orders.model.ts
      orders.state-machine.ts
    bidding/
      bidding.controller.ts
      bidding.service.ts
      bidding.routes.ts
      bidding.schema.ts
      bidding.model.ts
    wallet/
      wallet.controller.ts
      wallet.routes.ts
      wallet.schema.ts
      ledger.service.ts
      accounts.model.ts
      ledger-transaction.model.ts
      posting.model.ts
      payout.service.ts
      payout.model.ts
      withdrawal.model.ts
    services-catalog/
      catalog.controller.ts
      catalog.routes.ts
      service-subcategory.model.ts
      car-wash-price.model.ts
      banner.model.ts
    ratings/
      ratings.controller.ts
      ratings.service.ts
      ratings.routes.ts
      ratings.model.ts
    chat/
      chat.controller.ts
      chat.service.ts
      chat.routes.ts
      chat.model.ts
      message.model.ts
    notifications/
      notifications.controller.ts
      notifications.service.ts
      notifications.routes.ts
      notification.model.ts
    coupons/
      coupons.controller.ts
      coupons.service.ts
      coupons.routes.ts
      coupon.model.ts
    referral/
      referral.service.ts
      referral.controller.ts
      referral.routes.ts
    masked-phone/
      masked-phone.service.ts
      masked-phone.routes.ts
      masked-phone-session.model.ts
    audit-log/
      audit-log.model.ts
      audit-log.service.ts
    dsr/
      dsr.controller.ts    (PDPL data subject requests)
      dsr.service.ts
      dsr.model.ts
    payments/
      payments.controller.ts
      payments.service.ts
      payments.routes.ts
      payments.schema.ts
      tabby/
        tabby.client.ts
        tabby.webhook.ts
      moyasar/
        moyasar.client.ts
        moyasar.webhook.ts
      cash/
        cash-settlement.service.ts
    fraud/
      fraud.service.ts
      fraud-flag.model.ts
      risk-score.service.ts
  queues/
    index.ts
    orders-broadcast.queue.ts
    orders-broadcast.worker.ts
    notifications-fcm.queue.ts
    notifications-fcm.worker.ts
    payouts-weekly.queue.ts
    payouts-weekly.worker.ts
    analytics-daily.queue.ts
    analytics-daily.worker.ts
    ratings-recalc.queue.ts
    ratings-recalc.worker.ts
    masked-phone-expire.queue.ts
    masked-phone-expire.worker.ts
    cleanup.queue.ts
    cleanup.worker.ts
    fraud-analysis.queue.ts
    fraud-analysis.worker.ts
  sockets/
    index.ts                (adapter init)
    auth.ts
    presence.service.ts    (Redis-backed)
    handlers/
      chat.ts
      order.ts
      location.ts
  integrations/
    authentica/
      authentica.client.ts
    cloudinary/
      cloudinary.service.ts
    fcm/
      fcm.service.ts
    tabby/
      (re-export from modules/payments/tabby)
    moyasar/
      (re-export)
    unifonic/
      unifonic.voice.ts
  jobs/
    daily-stats.cron.ts
    suspension-check.cron.ts
    data-retention.cron.ts
  server.ts                 (HTTP + WS bootstrap only)
  app.ts                    (express app, middlewares, routes)
```

---

## 4. Data Model (ملخص — التفاصيل في DATA_MODEL.md)

الـ Collections الرئيسية وعلاقاتها:

```
User ─────1:1───── Provider
  │         │
  │         ├── uploads ─── Document (embedded)
  │         └── holds ──── Account (wallet type = provider_wallet)
  │
  ├── owns ──── Account (wallet type = customer_wallet)
  ├── has many ─ Address (embedded)
  ├── has many ─ DeviceToken (embedded array)
  ├── has many ─ Order (as client)
  ├── has many ─ Review (as fromUser / toUser)
  ├── has many ─ Referral (as referrer)
  └── has many ─ Notification

Order ──1:many── OrderItem       (multi-service support)
  │
  ├── 1:many ── Bid                (if pricingType=bid)
  ├── 1:many ── BroadcastAttempt
  ├── 1:1 ───── Chat
  ├── 1:1 ───── MaskedPhoneSession (active during order)
  └── 1:1 ───── LedgerTransaction (at settlement)

LedgerTransaction ─1:many─ Posting (≥2 entries, sum to zero)
  Posting ─── refs ─── Account

WithdrawalRequest ── refs ── User (provider) + Account
  └── 1:many grouped by ── PayoutBatch (weekly)

Coupon ── has many ── usedBy (refs User)

Admin ── separate from User, has MFA secret
```

كل Collection لها TTL index، compound indexes ESR-compliant، و `createdAt` index للتقارير. الفهارس في `DATA_MODEL.md`.

---

## 5. API Contract (مختصر — الشرح في API_SPEC.md)

كل الـ endpoints تحت `/api/v1/`. الأنواع الرئيسية:

| Namespace | Routes (عدد) | الغرض |
|---|---|---|
| `/auth` | 5 | OTP + JWT + refresh + logout |
| `/users/me` | 9 | ملف شخصي + عناوين + device token + wallet |
| `/providers` | 8 | تسجيل + مستندات + status + location + مراجعات |
| `/catalog` | 5 | بانرات + فئات خدمات + أسعار غسيل السيارات |
| `/orders` | 10 | إنشاء + accept/reject + status + photos + price + nearby |
| `/bids` | 4 | submit + list + accept + reject |
| `/chats` | 5 | conversations + messages + media |
| `/payments` | 7 | wallet/topup/withdraw + Tabby init + Moyasar init + coupon validate |
| `/payments/webhooks` | 2 | `tabby`, `moyasar` (HMAC verified) |
| `/reviews` | 2 | submit + list by user |
| `/notifications` | 4 | list + read + markAll + unread count |
| `/referral` | 2 | my-code + redeem |
| `/masked-phone` | 1 | request session (returns masked number) |
| `/dsr` | 3 | export my data + erasure request + consent mgmt |
| `/admin/*` | ~30 | كامل dashboard |

Conventions:
- Request body → Zod validation على كل endpoint.
- Response unified envelope: `{ success: boolean, data: T, meta?: { pagination } }` أو `{ success: false, error: { code, message, details } }`.
- JSON only. uploads = multipart على 3 endpoints محددة.
- `Idempotency-Key` header إلزامي على: `POST /orders`, كل `/payments/*` write, `/wallet/topup`, `/wallet/withdraw`, `/bids`.
- Correlation: header `X-Request-Id` (إن غاب، نولّده) يمتد خلال جميع logs.

---

## 6. Order Broadcasting Flow

### 6.1 Fixed-Price Service (غسيل السيارات)

```
Customer              API              BroadcastQueue         Provider(sorted by distance)
   │                   │                     │                        │
   │  POST /orders     │                     │                        │
   ├──────────────────▶│                     │                        │
   │                   │ Create Order        │                        │
   │                   │ status=pending      │                        │
   │                   │ pricingType=fixed   │                        │
   │                   │                     │                        │
   │◀── 201 Created ───┤                     │                        │
   │                   │                     │                        │
   │                   │ enqueue broadcast   │                        │
   │                   ├────────────────────▶│                        │
   │                   │                     │ find nearby (2dsphere) │
   │                   │                     │ exclude rejected       │
   │                   │                     │ order by distance asc  │
   │                   │                     │                        │
   │                   │                     │ pick top 1             │
   │                   │                     │ mark broadcasting      │
   │                   │                     │ addToSet broadcastedTo │
   │                   │                     ├───── FCM + socket ────▶│
   │                   │                     │                        │
   │                   │                     │ schedule delayed job   │
   │                   │                     │ "broadcast.timeout"    │
   │                   │                     │ delay: 60s             │
   │                   │                     │                        │
   │                   │                     │                        │ ┌─ accepts ─┐
   │                   │◀────── PATCH /orders/:id/accept ─────────────┤           │
   │                   │ atomic findOneAndUpdate                      │           │
   │                   │ status=broadcasting→accepted                 │           │
   │                   │                     │                        │           │
   │                   │ emit order:accepted to user:clientId         │           │
   │◀── socket ────────┤                     │                        │           │
   │                   │                     │                        │           │
   │                   │ cancel delayed job  │                        │           │
   │                   │                     │                        └───────────┘
   │                   │                     │                              OR
   │                   │                     │                        ┌─ timeout ─┐
   │                   │                     │  (60s passed)          │           │
   │                   │                     │◀── worker wakes ───────┤           │
   │                   │                     │ check status still    │           │
   │                   │                     │ = broadcasting         │           │
   │                   │                     │ addToSet rejectedBy    │           │
   │                   │                     │ re-enqueue broadcast   │           │
   │                   │                     │ attempts++             │           │
   │                   │                     │ if attempts > 5:       │           │
   │                   │                     │   status=no_providers  │           │
   │                   │                     │   notify client        │           │
   │                   │                     │                        └───────────┘
```

### 6.2 Bid-Based Service (كل الباقي)

```
Customer              API              BroadcastQueue         Many Providers (fan-out)
   │                   │                     │                        │
   │  POST /orders     │                     │                        │
   ├──────────────────▶│ pricingType=bid     │                        │
   │                   │                     │                        │
   │                   │ enqueue bid-broadcast│                        │
   │                   ├────────────────────▶│                        │
   │                   │                     │ find all nearby        │
   │                   │                     │ radius=config.radius   │
   │                   │                     │ limit=20               │
   │                   │                     │                        │
   │                   │                     ├── FCM + socket fan-out ▶│ ...n providers
   │                   │                     │                        │
   │                   │                     │ status=broadcasting    │
   │                   │                     │ expiresAt=now+10m      │
   │                   │                     │                        │
   │                   │                     │                        │ ─ Bid submitted
   │                   │◀────── POST /bids (by each provider) ────────│
   │                   │ Bid created         │                        │
   │                   │ emit bid:new to user:clientId                │
   │◀── socket ────────┤                     │                        │
   │                   │                     │                        │
   │  PATCH /bids/:id/accept                 │                        │
   ├──────────────────▶│                     │                        │
   │                   │ transaction:        │                        │
   │                   │  - accept chosen bid│                        │
   │                   │  - reject others    │                        │
   │                   │  - order: status=accepted + providerId + price│
   │                   │                     │                        │
   │                   │ emit bid:accepted to provider + others rejected│
   │                   │                     │                        │
   │                   │                     │                        │ expired (10m)?
   │                   │                     │ worker cleans up: status=no_bids │
```

---

## 7. Order State Machine

```
                ┌────────────┐
                │  pending   │  (created, not yet broadcast)
                └─────┬──────┘
                      │ broadcast enqueued
                      ▼
                ┌──────────────┐       timeout×5 reached
                │ broadcasting │───────────────────────────┐
                └─────┬────────┘                           ▼
                      │ accepted by provider    ┌──────────────────────┐
                      │ (fixed) OR chosen bid   │ no_providers         │
                      ▼                         │ (terminal, notify)    │
                ┌──────────┐                    └──────────────────────┘
                │ accepted │
                └─────┬────┘
                      │ provider moves to site
                      ▼
                ┌────────────┐
                │ on_the_way │ ─── before photo uploaded ──▶ still on_the_way
                └─────┬──────┘
                      │
                      ▼
                ┌─────────┐
                │ arrived │
                └────┬────┘
                     │ provider starts work
                     ▼
                ┌─────────────┐
                │ in_progress │
                └─────┬───────┘
                      │ provider finishes + after photos uploaded
                      ▼
                ┌──────────────┐  payment captured  ┌──────────┐
                │ completed    │──────────────────▶ │ settled  │ (terminal)
                └──────────────┘                    └──────────┘

Cancellation rules:
  - Customer can cancel ONLY while status ∈ {pending, broadcasting}
  - Provider CANNOT cancel after accepting (business rule Q#23)
  - Admin can force-cancel any state with reason (audit logged)

Enforcement: state transitions go through a pure function
  transition(currentStatus, action, actor) → nextStatus | throw InvalidTransition
```

الـ state machine مُطبق في `orders.state-machine.ts` كدالة نقية، تُستدعى من controller قبل أي كتابة.

---

## 8. Wallet & Ledger Design

### 8.1 Chart of Accounts

كل Account له `type` وmalk واحد (`User.id` للمحافظ الشخصية، أو `SYSTEM` للحسابات النظامية):

| Account Type | Owner | وصف |
|---|---|---|
| `customer_wallet` | User(client) | رصيد العميل القابل للإنفاق |
| `provider_wallet` | User(provider) | رصيد المزوّد (earnings - debts) |
| `provider_commission_debt` | User(provider) | عمولة مستحقة على المزوّد من طلبات كاش |
| `platform_revenue` | SYSTEM | إجمالي العمولات المستلمة |
| `platform_refunds` | SYSTEM | مسترجع للعملاء |
| `cash_in_transit` | SYSTEM | نقد استلمه مزوّد لم يُقرّه بعد |
| `payment_gateway_clearing` | SYSTEM | أموال في طريقها من Moyasar/Tabby |
| `payout_pending` | SYSTEM | pooled للدفع الأسبوعي |

### 8.2 Posting Rules

كل LedgerTransaction له ≥2 Postings. مجموع `debit - credit` = 0 بالهللة.

**مثال 1 — دفع بالمحفظة:** (order_total = 100 SAR، commission = 10%)

```
LedgerTransaction { id: tx_001, kind: "order_payment_wallet", orderId, idempotencyKey }
Postings:
  1. DEBIT  customer_wallet(client)   10000 halalas   "order payment"
  2. CREDIT provider_wallet(provider)  9000 halalas   "earning"
  3. CREDIT platform_revenue           1000 halalas   "commission 10%"

Σ = -10000 + 9000 + 1000 = 0 ✓
```

**مثال 2 — دفع كاش (provider يقرّ الاستلام):**

```
LedgerTransaction { id: tx_002, kind: "order_settlement_cash", orderId }
Postings:
  1. DEBIT  cash_in_transit            10000 halalas
  2. CREDIT provider_wallet             9000 halalas
  3. CREDIT platform_revenue            1000 halalas
  (المبلغ الكلي في العمود الأيمن — المزوّد استلم نقداً يعادل 10000، نخصم 1000 كعمولة)

ثم:
LedgerTransaction { id: tx_003, kind: "cash_commission_debt" }
  1. DEBIT  provider_commission_debt(provider) 1000 halalas
  2. CREDIT cash_in_transit                      1000 halalas
```

المزوّد يجب أن يسدّد 1000 هللة للمنصة (عبر خصم تلقائي من أول دفع إلكتروني أو top-up wallet).

### 8.3 Idempotency

`LedgerTransaction.idempotencyKey` unique index (TTL 30 يوم). أي retry بنفس المفتاح يُعيد نفس الـ transaction ولا يخلق posts جديدة.

### 8.4 Reconciliation

Job يومي يتحقق:
- كل account: balance المخزّن = Σ(postings) المحسوبة.
- Σ(all balances) في النظام = 0 (closed system).
- أي اختلال → Sentry + pager.

### 8.5 Concurrency

كل operation يفتح mongoose `withTransaction`. ReadConcern = `snapshot`. WriteConcern = `majority`. Account `version` field للـ optimistic lock؛ `findOneAndUpdate({ _id, version }, { $inc: { version: 1 } })`.

---

## 9. Real-time Architecture

### 9.1 Socket.IO Rooms

- `user:<userId>` — broadcast موجّه (كل رسالة شخصية)
- `order:<orderId>` — participants (client + provider + admin) يشاهدون تحديث حالة
- `chat:<chatId>` — الرسائل النصية والوسائط
- `admin:live` — لوحة مراقبة live

### 9.2 Presence

`Redis SET online:users` + مفتاح `presence:user:<id> = <instanceId>` مع TTL 60s يُحدَّث بـ heartbeat كل 20s. `SREM` عند disconnect.

### 9.3 Events الصادرة من الخادم

| Event | إلى من | متى |
|---|---|---|
| `order:new_request` | `user:<providerId>` | broadcasting |
| `order:accepted` | `user:<clientId>` + `order:<orderId>` | bid accept or fixed accept |
| `order:status_update` | `order:<orderId>` | كل transition |
| `order:price_set` | `user:<clientId>` | provider يسجل السعر |
| `order:no_providers` | `user:<clientId>` | timeout×5 |
| `bid:new` | `user:<clientId>` | provider يرسل bid |
| `bid:accepted` | `user:<providerId>` | client يختار |
| `bid:rejected` | `user:<providerId>` | auto-reject بقية bids |
| `provider:location_update` | `order:<orderId>` | track live |
| `chat:new_message` | `chat:<chatId>` | رسالة جديدة |
| `chat:typing` / `chat:stop_typing` | `chat:<chatId>` | UX |
| `payment:captured` | `user:<clientId>` + `order:<orderId>` | webhook |
| `system:announcement` | `role:all` أو `role:provider` | admin broadcast |

### 9.4 Events الواردة من العميل

- `provider:update_location { lat, lng, orderId? }` — يحدّث Provider.currentLocation + يبث لغرفة الطلب.
- `provider:heartbeat` — يبقي Redis presence حياً.
- `order:join { orderId }` / `order:leave`.
- `chat:join { chatId }`.
- `chat:send_message { chatId, type, content, location? }` — مُحفَّظ في DB + مُبَث.
- `chat:typing { chatId }` / `chat:stop_typing`.

### 9.5 Scaling

- `@socket.io/redis-adapter` (sharded، Redis 7+)
- ALB sticky sessions (ALB-native cookies)
- كل Node instance يحمل ~5k WS concurrent (ceiling ~10k)
- ~3–4 instances كافية لـ peak 40k concurrent عند 70k مستخدم (25–30% online ratio)

---

## 10. Background Jobs (BullMQ Queues)

| Queue | Concurrency | الغرض |
|---|---|---|
| `orders.broadcast` | 20 | pick next provider, emit, schedule timeout |
| `orders.broadcast-timeout` | 20 | delayed, checks if still broadcasting, re-fires |
| `notifications.fcm` | 50 | chunked FCM multicast (500 tokens/batch) |
| `payouts.weekly` | 5 | generate weekly payout batches per provider |
| `analytics.daily` | 2 | rollup daily stats → admin dashboard cache |
| `ratings.recalc` | 10 | after review submit, recompute user ratings |
| `masked-phone.expire` | 5 | close session 24h after order complete |
| `fraud.analysis` | 10 | score provider behavior (velocity, cancellation rate) |
| `cleanup.expired-otp` | 1 | cron, TTL cleanup |
| `cleanup.expired-idempotency` | 1 | cron, Redis TTL handles most |
| `referral.apply-bonus` | 10 | after referee's first completed order |
| `ledger.reconcile` | 1 | daily integrity check |

All queues:
- `defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 500 }`
- Dead-letter queue via `removeOnFail: false` for critical (payouts, ledger) — manual inspection.

---

## 11. Security Layers

من الخارج إلى الداخل:

1. **Edge:**
   - CloudFront TLS 1.3.
   - AWS WAF: OWASP managed rules + rate-based rule 2000 req/5min/IP.
   - Geo-block (optional V1): KSA + GCC only.

2. **Load balancer:**
   - ALB health checks `/health`.
   - mTLS على `/api/admin/*` (Admin panel يقدم client cert).

3. **Application:**
   - Helmet (CSP strict، HSTS preload).
   - CORS allowlist (mobile bundle IDs + admin panel domain only).
   - `express.json({ limit: '100kb' })` — small, uploads منفصلة.
   - Body Zod validation على كل route.
   - Rate limiting per-endpoint (rate-limiter-flexible + Redis):
     - OTP send: 3/5min/phone + 5/hour/phone + 10/day/IP
     - OTP verify: 5/5min/phone
     - Auth: 20/15min/IP
     - Payments write: 20/min/user
     - Orders create: 5/min/user
     - Default: 100/min/user
   - Idempotency-Key على mutations المالية.

4. **Auth:**
   - Short-lived access token (15m) + long-lived refresh (30d).
   - Refresh rotation mandatory: old refresh invalidated on use.
   - Refresh token stored as HttpOnly cookie (web admin) أو secure storage (mobile).
   - Admin: separate password (argon2 2id، memory=19456, iterations=2) + TOTP MFA.
   - JWT: RS256، keys rotated quarterly، jwks endpoint.

5. **Data:**
   - MongoDB TLS + IP allowlist (ECS/EKS tasks only).
   - Redis AUTH + TLS.
   - KMS encryption at rest.
   - Field-level encryption for PII (national ID number، بصمة).
   - OTP hashed (argon2 low params).

6. **Secrets:**
   - AWS Secrets Manager (rotated every 90 days).
   - لا .env في production.

7. **Audit:**
   - كل admin action → `AuditLog` (immutable).
   - كل login/logout/failed-auth.
   - كل ledger transaction.
   - كل DSR request.

8. **Anti-fraud:**
   - Device fingerprint على mobile SDK.
   - IP collision detection (client/provider في نفس IP بنفس الطلب = flag).
   - Velocity limits per provider (بحد أقصى 30 bid/يوم، 50 طلب مقبول/يوم).
   - Location sanity check (سرعة max = 200 km/h).
   - ML-ready: `FraudFlag` model يجمع إشارات لتدريب لاحق.

---

## 12. Scalability Plan — من 10k إلى 70k

### مرحلة 1: MVP launch (0–10k مستخدم، ~500 concurrent)

- 2× API instances (ECS Fargate، 1 vCPU / 2 GB)
- 2× BullMQ worker instances (0.5 vCPU / 1 GB)
- MongoDB Atlas M30 (Dammam، 3-node replica set)
- Redis Cluster M10 (3 nodes)
- Cloudinary standard plan

### مرحلة 2: Growth (10k–30k مستخدم)

- Auto-scale API: 3–5 instances
- Auto-scale workers: 3–4 instances
- MongoDB M40 + 2 read-replicas (تقارير admin على read preference `secondary`)
- Redis Cluster M20 (6 nodes، 3 shards × 2 replicas)
- Sharded Socket.IO adapter
- CDN warm for static assets

### مرحلة 3: Scale (30k–70k+)

- API: 6–10 instances behind ALB
- Workers: 6–8 instances
- MongoDB M50 مع sharding (shard key `createdAt` للـ Order collection بعد 10M docs)
- Redis Enterprise Cloud (KSA region) مع active-active أو read replicas
- APM: Sentry Performance + Prometheus + Grafana
- Separate queue instances per priority (critical queues معزولة عن non-critical)
- Caching: Mongoose + Redis query cache for hot lookups (services catalog, config)

### Load Assumptions (tested targets)

| Metric | MVP target | Scale target |
|---|---|---|
| Concurrent WS | 500 | 20k |
| API req/sec | 100 | 3k |
| Order creation rate | 10/min | 500/min peak |
| FCM/day | 10k | 500k |
| DB ops/sec | 500 | 15k |

---

## 13. Deployment

### Topology

- **Cloud:** AWS `me-central-1` (Bahrain) primary، مع MongoDB Atlas على `me-central-2 (Dammam)`. Redis Cloud KSA dedicated cluster.
- **Env:** `dev`, `staging`, `prod` — separate accounts + isolated VPCs.
- **Container:** Docker images مُبنية في CI، مدفوعة لـ ECR، deploy عبر ECS Fargate.
- **Secrets:** AWS Secrets Manager (per env)، قابل للـ rotation.
- **DNS:** Route53 + ACM certificates.

### PDPL Residency Matrix

| Data | Storage | Region | Justification |
|---|---|---|---|
| User profiles, addresses | MongoDB Atlas | Dammam (KSA) | ✅ PDPL |
| Orders, ledger | MongoDB Atlas | Dammam (KSA) | ✅ PDPL |
| Sessions, cache | Redis Cluster | KSA / Bahrain | ✅ (Bahrain acceptable per SDAIA guidelines with DPA) |
| User uploads (KYC docs) | Cloudinary (with DPA + KSA region) أو S3 `me-south-1` (Bahrain) | Bahrain fallback | ⚠️ Cloudinary KSA region preferred |
| FCM device tokens | Firebase (Google US/EU) | outside KSA | 🟠 حلّ: token-only، لا PII مرتبط، DPA + SCC |
| Application logs | CloudWatch KSA | KSA | ✅ |

### CI/CD

- **GitHub Actions / GitLab CI:**
  1. PR → lint (eslint) + typecheck + unit tests + integration tests (في memory Mongo + Redis)
  2. Main → build image → push ECR → deploy staging
  3. Manual promote → prod
- **Database migrations:** `migrate-mongo` — forward-only scripts in `db/migrations/`.
- **Feature flags:** `Config` collection (runtime toggleable) + env-level compile flags.

### Monitoring & Alerts

- **Metrics:** Prometheus scraping `/metrics` (prom-client middleware).
- **Logs:** pino → CloudWatch structured.
- **APM:** Sentry (errors + performance transactions).
- **Uptime:** Better Uptime / Pingdom.
- **Paging:** PagerDuty — على: ledger imbalance، payment webhook 5xx rate، FCM error rate > 5%، DB primary failover.

### Disaster Recovery

- MongoDB Atlas continuous backup (PITR 48h)، snapshot retention 30 يوم.
- Redis RDB + AOF.
- Docker images immutable، rollback = redeploy previous tag.
- RTO < 1h، RPO < 5m للـ DB.

---

## 14. Ethics & Compliance Notes

- **PDPL:** DSR endpoints (export/delete)، DPO تعيين، breach reporting runbook 72h.
- **Privacy:** Masked phone قبل الوصل، لا تخزين CVV/PAN (PCI — كله على processor).
- **Children:** Q#8 أجاب "لا حد أدنى" لكن نفرض ≥18 داخلياً لحماية المنصة قانونياً (checkbox عند التسجيل).
- **Provider KYC:** مستندات مشفّرة، يُحذف منها المحتوى الحساس بعد رفض التسجيل (retain decision فقط 5 سنوات).
- **Data retention:**
  - Orders: 7 سنوات (طلبات المبيعات SOCPA).
  - Messages: 12 شهر (business purpose).
  - Logs: 90 يوم (incident triage).
  - DSR deletions: 30 يوم من الطلب.

---

## 15. Ownership & Handover

- **Source:** repository خاص على GitHub/GitLab، scope: Client only (per Q#49).
- **Tech docs:** هذه الوثائق + OpenAPI spec generated من Zod schemas.
- **Runbooks:** `docs/runbooks/` — deploy, rollback, DB restore, incident response.
- **Training:** 2 أشخاص (per Q#51) — جلسات + admin panel tutorial video.
