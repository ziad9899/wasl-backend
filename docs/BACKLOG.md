# WASL — Backlog

خطة تنفيذ مرتّبة حسب الأولوية (P0/P1/P2) ومقسّمة على ثلاث مراحل إصدار: MVP، V1، V2.

**المعادلة الزمنية:** مطوّر senior واحد، 6 ساعات إنتاج فعلي/يوم. المدد تقديرية بالأيام.

**المصطلحات:**
- **P0** = Blocker: لا إطلاق بدونه.
- **P1** = Critical: مهم جداً للجودة والأمان لكن يمكن إطلاق MVP بدونه.
- **P2** = Important: يؤجَّل لـ V1/V2.

---

## MVP (30–45 يوم، هدف الإطلاق الأول محدود المدن)

### Foundation — P0

| # | المهمة | الملفات المتأثرة | الوقت | Dependencies |
|---|---|---|---|---|
| F1 | تحويل المشروع إلى TypeScript، إعداد `tsconfig.json` strict، `tsx` للـ dev، build pipeline | كل `.js` → `.ts`، `package.json`، `tsconfig.json` | 3 يوم | — |
| F2 | إعادة هيكلة للـ modules كما في ARCHITECTURE §3 | `src/*` كامل | 2 يوم | F1 |
| F3 | استبدال winston → pino، bcryptjs → argon2، express-validator → Zod، bull → bullmq، إزالة xss-clean + mongo-sanitize | `package.json`، كل controllers + middlewares | 2 يوم | F2 |
| F4 | طبقة env validation بـ Zod في `config/env.ts` | جديد | 0.5 يوم | F1 |
| F5 | error hierarchy: DomainError/Validation/NotFound/Auth/Payment/Conflict + `asyncHandler` + `errorHandler` middleware | `shared/errors/`، `shared/middleware/` | 1 يوم | F2 |
| F6 | unified response envelope helper + correlationId middleware + pino-http | `shared/utils/`، `shared/middleware/` | 0.5 يوم | F5 |
| F7 | Zod-based `validate()` middleware | `shared/middleware/validate.ts` | 0.25 يوم | F3 |
| F8 | إضافة `ioredis` pubClient/subClient، إعداد BullMQ، إعداد `@socket.io/redis-adapter` (sharded) | `config/redis.ts`، `sockets/index.ts` | 1 يوم | F2 |
| F9 | إضافة Redis-backed presence service (استبدال `onlineUsers` Map) | `sockets/presence.service.ts` | 0.5 يوم | F8 |
| F10 | إضافة rate-limiter-flexible على Redis، إزالة express-rate-limit | `shared/middleware/rate-limit.ts` | 1 يوم | F8 |
| F11 | idempotency middleware على Redis | `shared/middleware/idempotency.ts` | 1 يوم | F8 |
| F12 | Zod schemas لكل endpoint في MVP (~40 endpoint) | `modules/*/schema.ts` | 3 يوم | F7 |

**المجموع Foundation:** ~16 يوم.

### Core Models & Ledger — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| L1 | إعادة تصميم User model + Provider model لـ TS + إضافة `status=awaiting_approval` + حقول PDPL | `modules/providers/providers.model.ts`، `shared/user.model.ts` | 1 يوم | F2 |
| L2 | Admin model منفصل + password argon2 + MFA (TOTP عبر `otplib`) | `modules/admin/` | 1.5 يوم | L1 |
| L3 | Order model كامل (OrderItem embedded، state machine، timeline) + state-machine وظيفة نقية | `modules/orders/orders.model.ts`، `orders.state-machine.ts` | 2 يوم | L1 |
| L4 | Bid, Chat, Message, Review models + TS migration | `modules/bidding/`، `modules/chat/`، `modules/ratings/` | 1 يوم | L3 |
| L5 | **Ledger system:** Account + LedgerTransaction + Posting models + `ledger.service.ts` (postTransaction، getBalance، reconcile) + invariants | `modules/wallet/*` | 4 يوم | F2 |
| L6 | Migration script لإنشاء SYSTEM accounts (platform_revenue, cash_in_transit, ...) | `db/migrations/001-ledger-init.ts` | 0.5 يوم | L5 |
| L7 | Config model + seed (القيم الافتراضية كما في DATA_MODEL) | `modules/admin/config.*` | 0.5 يوم | L1 |
| L8 | Coupon, Notification, Otp, Referral, ServiceSubCategory, CarWashPrice, Banner, AuditLog, DSR models | Multiple | 2 يوم | L1 |
| L9 | BroadcastAttempt + MaskedPhoneSession + FraudFlag + WithdrawalRequest + PayoutBatch models | Multiple | 1.5 يوم | L3 |
| L10 | Indexes creation + verification script | `db/create-indexes.ts` | 0.5 يوم | جميع L |

**المجموع Models:** ~15 يوم.

### Auth & Users — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| A1 | Authentica v2 client (endpoint /api/v2/...) + E.164 normalization + OTP hashing بـ argon2 (low params) | `integrations/authentica/`، `modules/auth/auth.service.ts` | 1.5 يوم | L1 |
| A2 | JWT RS256 مع JWKs endpoint + refresh rotation + blacklist على Redis | `shared/utils/jwt.ts`، `modules/auth/` | 1.5 يوم | F8 |
| A3 | Auth endpoints (send-otp, verify-otp, complete-profile, refresh, logout) | `modules/auth/*` | 1 يوم | A1, A2 |
| A4 | `protect`, `restrictTo`, `requirePermission` middlewares | `shared/middleware/auth.ts` | 0.5 يوم | A2 |
| A5 | User endpoints (me، avatar، addresses، device-token، wallet، transactions) | `modules/customers/*` | 1 يوم | A3 |
| A6 | Cloudinary service (with DPA config) + upload middlewares | `integrations/cloudinary/`، `shared/middleware/upload.ts` | 0.5 يوم | — |
| A7 | PDPL consent capture في complete-profile + consent model | `modules/auth/`، `modules/dsr/` | 0.5 يوم | A3 |

**المجموع Auth:** ~6 يوم.

### Provider Flow — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| P1 | Provider register + documents upload (نوع لكل مستند على حدة) | `modules/providers/*` | 1 يوم | A5 |
| P2 | Admin approval flow + creation of provider_wallet + provider_commission_debt accounts عند approval | `modules/admin/`، `modules/providers/` | 1 يوم | P1, L5 |
| P3 | Provider profile update (vehicle, bankInfo، serviceRadius) + IBAN validation | `modules/providers/` | 0.5 يوم | P1 |
| P4 | Provider online/offline status + location update + socket event | `modules/providers/`، `sockets/handlers/location.ts` | 1 يوم | P1, F9 |
| P5 | Fix auth middleware to allow `awaiting_approval` users to complete document upload | `shared/middleware/auth.ts` | 0.25 يوم | A4 |

**المجموع Provider:** ~4 يوم.

### Orders — Broadcasting — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| O1 | Order create endpoint مع idempotency + coupon validation + working-hours + commission calc + address resolve + initial status=pending | `modules/orders/` | 2 يوم | L3, F11 |
| O2 | `orders.broadcast.service.ts`: findNearbyProviders (aggregate $geoNear مع $maxDistance)، pick strategy fixed vs bid | `modules/orders/` | 1.5 يوم | L3 |
| O3 | BullMQ queue `orders.broadcast` + worker + delayed timeout job + re-queue up to 5 attempts | `queues/orders-broadcast.*` | 2 يوم | O2, F8 |
| O4 | Accept/reject order endpoints (atomic findOneAndUpdate + socket emit + FCM) | `modules/orders/` | 1 يوم | O1 |
| O5 | setAgreedPrice endpoint (provider) + recalc commission | `modules/orders/` | 0.5 يوم | O1 |
| O6 | updateOrderStatus مع state-machine enforcement + photo-required guard عند status=completed | `modules/orders/` | 1 يوم | L3 |
| O7 | Upload order photos (before/after) + guard على phase | `modules/orders/` | 0.5 يوم | A6 |
| O8 | Cancel order endpoint + business rule (no cancel after accept) | `modules/orders/` | 0.25 يوم | O6 |
| O9 | Order listing + detail + timeline + nearby-providers | `modules/orders/` | 1 يوم | O1 |

**المجموع Orders:** ~10 يوم.

### Bidding — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| B1 | Submit bid endpoint + idempotency + velocity check + expiry | `modules/bidding/` | 1 يوم | O1 |
| B2 | List bids sorted by price (or rating، configurable) | `modules/bidding/` | 0.5 يوم | B1 |
| B3 | Accept bid (transaction: accept + reject others + update order + socket events) | `modules/bidding/` | 1 يوم | B1 |
| B4 | Reject bid | `modules/bidding/` | 0.25 يوم | B1 |
| B5 | Bid auto-expire via cron (TTL index للـ cleanup) | `modules/bidding/` | 0.25 يوم | B1 |

**المجموع Bidding:** ~3 يوم.

### Wallet & Payments — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| W1 | Wallet balance + ledger-derived transactions endpoints | `modules/wallet/wallet.controller.ts` | 0.5 يوم | L5 |
| W2 | Pay order with wallet flow (`LedgerTransaction` kind=order_payment_wallet + postings) | `modules/wallet/`، `modules/payments/` | 1 يوم | L5 |
| W3 | Moyasar integration: client + create checkout session for topup + for card/apple_pay order payment + webhook handler (HMAC + IP) | `modules/payments/moyasar/` | 3 يوم | L5 |
| W4 | Tabby integration: client + checkout session + webhook (HMAC + IP allowlist KSA 2026 IPs) | `modules/payments/tabby/` | 2.5 يوم | L5 |
| W5 | Cash settlement flow: `cash_in_transit` + provider confirmation endpoint + commission debt posting | `modules/payments/cash/` | 1.5 يوم | L5 |
| W6 | Withdrawal request endpoint + OTP confirmation + balance check + admin approval flow | `modules/wallet/` | 1.5 يوم | W1 |
| W7 | Coupon validate endpoint + application during order create | `modules/coupons/` | 1 يوم | L8 |
| W8 | Idempotency applied على كل write payment endpoint | Multiple | 0.25 يوم | F11 |

**المجموع Wallet/Payments:** ~11 يوم.

### Chat — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| C1 | getOrCreateChat + getConversations + getMessages (cursor pagination) | `modules/chat/` | 1 يوم | L4 |
| C2 | sendMessage (text/location) + sendMediaMessage | `modules/chat/` | 0.75 يوم | L4, A6 |
| C3 | Socket handlers: chat:send_message, typing, stop_typing + FCM fallback إذا recipient offline | `sockets/handlers/chat.ts` | 1 يوم | F8, F9 |
| C4 | Chat auto-close 30 يوم بعد order completion (cron) | `jobs/chat-cleanup.cron.ts` | 0.25 يوم | C1 |

**المجموع Chat:** ~3 يوم.

### Notifications — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| N1 | FCM service: chunked multicast (500/batch) + invalid token cleanup | `integrations/fcm/fcm.service.ts` | 1 يوم | L8 |
| N2 | BullMQ queue `notifications.fcm` + worker + retry with backoff | `queues/notifications-fcm.*` | 1 يوم | N1, F8 |
| N3 | Notification endpoints (list, read, read-all, unread-count) | `modules/notifications/` | 0.5 يوم | L8 |
| N4 | Templates (order_new, order_accepted, ...) AR + EN، ربط مع order/bid/wallet events | `modules/notifications/templates.ts` | 1 يوم | N1 |

**المجموع Notifications:** ~3.5 يوم.

### Reviews — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| R1 | Submit review (client_to_provider, provider_to_client) + 409 on duplicate + isVisibleToPublic rule | `modules/ratings/` | 0.5 يوم | L4 |
| R2 | Rating recalculation via BullMQ queue | `queues/ratings-recalc.*` | 0.5 يوم | R1 |
| R3 | Auto-suspend logic (avg <2 + min 10 reviews OR 3 consecutive <2) | `modules/ratings/ratings.service.ts` | 0.5 يوم | R2 |
| R4 | Public reviews list endpoint | `modules/ratings/` | 0.25 يوم | R1 |

**المجموع Reviews:** ~2 يوم.

### Admin Panel Backend — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| AD1 | Admin login + MFA verify + refresh | `modules/admin/admin.auth.ts` | 1 يوم | L2 |
| AD2 | Dashboard stats endpoint + live metrics (cached) | `modules/admin/` | 1 يوم | جميع models |
| AD3 | Users CRUD (list/suspend/activate/soft-delete) | `modules/admin/` | 0.75 يوم | L1 |
| AD4 | Providers approval (approve/reject/verify document) | `modules/admin/` | 0.75 يوم | P2 |
| AD5 | Orders list/detail/force-cancel/refund | `modules/admin/` | 1 يوم | O1 |
| AD6 | Reviews list + delete | `modules/admin/` | 0.25 يوم | R1 |
| AD7 | Coupons CRUD | `modules/admin/` | 0.5 يوم | L8 |
| AD8 | Config get/update + history | `modules/admin/` | 0.5 يوم | L7 |
| AD9 | Catalog CRUD (subcategories، car-wash-prices، banners) | `modules/admin/` | 1 يوم | L8 |
| AD10 | Revenue report + provider performance + ledger statements | `modules/admin/` | 1.5 يوم | L5 |
| AD11 | Broadcast notification | `modules/admin/` | 0.25 يوم | N1 |
| AD12 | Audit log middleware on all admin mutations + query endpoint | `shared/middleware/audit-log.ts`، `modules/admin/` | 1 يوم | — |

**المجموع Admin:** ~9.5 يوم.

### Security, Observability, Deploy — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| S1 | Helmet strict CSP، CORS allowlist، body limit 100KB | `app.ts` | 0.25 يوم | F2 |
| S2 | Field-level encryption for PII (nationalId number, IBAN) باستخدام KMS/libsodium | `shared/utils/crypto.ts` | 1 يوم | — |
| S3 | Sentry integration (errors + performance transactions) | `config/sentry.ts` | 0.5 يوم | F3 |
| S4 | Prometheus metrics (prom-client) على HTTP + queues + ledger invariant status | `shared/middleware/metrics.ts` | 1 يوم | F3 |
| S5 | Health endpoints (`/health`, `/health/deep`, `/metrics`) | `app.ts` | 0.25 يوم | — |
| S6 | Dockerfile multi-stage + docker-compose dev | Root | 0.5 يوم | — |
| S7 | GitHub Actions CI: lint + typecheck + test + build + deploy staging | `.github/workflows/` | 1 يوم | F1 |
| S8 | AWS ECS Fargate task definition + ALB + ACM + Route53 | `infra/terraform/` | 2 يوم | S6 |
| S9 | MongoDB Atlas Dammam region setup + IP allowlist + backup | Manual | 0.5 يوم | — |
| S10 | Redis Cluster provisioning + TLS + AUTH | Manual | 0.5 يوم | — |
| S11 | Secrets Manager integration (loader في startup) | `config/env.ts` | 0.5 يوم | F4 |

**المجموع Sec/Ops:** ~8 يوم.

### PDPL Basics — P0

| # | المهمة | الملفات | الوقت | Deps |
|---|---|---|---|---|
| PD1 | Consent flags على User (pdpl, marketing) + capture عند onboarding | `modules/auth/`، `modules/customers/` | 0.5 يوم | A7 |
| PD2 | DSR export endpoint (async job يُنتج JSON + signed S3 URL) | `modules/dsr/` | 2 يوم | L8 |
| PD3 | DSR erasure endpoint مع 30-day grace + OTP confirmation | `modules/dsr/` | 1.5 يوم | L8 |
| PD4 | Data retention cron (soft delete old messages، archive orders >7y) | `jobs/data-retention.cron.ts` | 1 يوم | — |

**المجموع PDPL:** ~5 يوم.

---

### MVP Total: ~96 يوم × 1 senior

مع مطوّرَين متوازِيَين (senior + mid) ← ~50–60 يوم تقويم. مع 3 مطوّرَين ← 35–40 يوم. 

**العميل طلب إطلاق 30–60 يوم** (Q#46). يلزم **3 مطوّرَين على الأقل** للالتزام بالجدول، أو قصر الـ MVP على خدمتَين (غسيل + صيانة) وتأجيل الباقي.

---

## V1 (بعد MVP، 30–45 يوم إضافي)

### Core V1 — P1

| # | المهمة | الوقت | الغرض |
|---|---|---|---|
| V1-1 | Masked phone (Unifonic integration) + session model + auto-expire | 3 يوم | Q#35 |
| V1-2 | Referral bonus system (reward on referee first completed order) + account referral_bonus_pool + payout | 2 يوم | Q#65 |
| V1-3 | Multi-service order (OrderItem الحقيقي، معالجة كل item لمزوّد مختلف محتمل) | 4 يوم | Q#17 |
| V1-4 | Sub-categories الكاملة (تكييف، سباكة، إلخ) + UI للاختيار | 2 يوم | BRD §5.2/5.3 |
| V1-5 | Car wash pricing from admin-entered catalog (بدل السعر الثابت) | 1 يوم | Q#12 |
| V1-6 | Service details schemas لكل category (Zod لكل فرع) | 2 يوم | BRD §5 |
| V1-7 | Tamara integration (ADD to Tabby-style) | 2 يوم | BRD §8 |
| V1-8 | Weekly payout batch (SARIE file generation + admin approval) | 3 يوم | Q#21 |
| V1-9 | Fraud detection module (velocity، cancellation rate، IP collision، location sanity) + FraudFlag model ui | 4 يوم | Anti-fraud |
| V1-10 | Provider earnings dashboard (day/week/month + chart data endpoints) | 1.5 يوم | BRD §7.3 |
| V1-11 | Preferred providers (client يستطيع assignment قبل broadcasting إن كان المزوّد online) | 1.5 يوم | Q#27 |
| V1-12 | Distance fee calculation (per-km بدل ثابت) + مسافة محسوبة من Google Distance Matrix | 1.5 يوم | Q#15 |
| V1-13 | Refund flow (admin-triggered) — reversal posting + notify | 1.5 يوم | — |
| V1-14 | Admin panel frontend (separate repo، لكن backend endpoints جاهزة في MVP) | — | Q#11 |
| V1-15 | OpenAPI spec auto-gen + `/docs` endpoint | 1 يوم | Q#50 |
| V1-16 | Ledger daily reconcile job + pager alert عند imbalance | 1 يوم | — |
| V1-17 | rate limit per-user متقدّمة (طبقتان token-bucket + sliding window) | 0.5 يوم | — |
| V1-18 | Language middleware محسّن + localization bundle | 0.5 يوم | Q#4 |
| V1-19 | Banner + marketing content system كامل | 1 يوم | BRD §4.2 |

**المجموع V1:** ~33 يوم × 1 senior.

### Security Hardening — P1

| # | المهمة | الوقت |
|---|---|---|
| V1-S1 | mTLS على admin endpoints | 1 يوم |
| V1-S2 | Device fingerprint collection + storage + anti-sybil checks | 1.5 يوم |
| V1-S3 | Session revocation registry + concurrent session limits | 1 يوم |
| V1-S4 | Admin panel IP allowlist (Saudi IPs only) | 0.25 يوم |
| V1-S5 | AWS WAF managed rules + rate-based + geo-blocking | 0.5 يوم |

---

## V2 (بعد V1، 30+ يوم)

### Growth Features — P2

| # | المهمة | الوقت |
|---|---|---|
| V2-1 | Scheduled orders (booking for future date/time) | 5 يوم |
| V2-2 | Surge pricing / dynamic commission based on demand | 3 يوم |
| V2-3 | ML-based fraud scoring (feature pipeline + model serving) | 7 يوم |
| V2-4 | Loyalty program (points، tiers) | 5 يوم |
| V2-5 | Provider certifications (شهادات مهنية مفعّلة) + verification workflow | 3 يوم |
| V2-6 | In-app support ticket system (بدل الشات للشكاوى الرسمية) | 4 يوم |
| V2-7 | Promotions engine (time-based flash offers، category-targeted) | 3 يوم |
| V2-8 | Multi-address per order (pickup + drop-off لـ moving) | 2 يوم |
| V2-9 | Provider wallets fast payout (daily instead of weekly، premium tier) | 2 يوم |
| V2-10 | Advanced analytics: cohort، retention، LTV | 4 يوم |
| V2-11 | Push personalization (quiet hours، per-topic subscription) | 2 يوم |
| V2-12 | Internationalization (beyond ar/en — فلبينية، أوردو لحقيقة السوق) | 3 يوم |

### Platform Scale — P2

| # | المهمة | الوقت |
|---|---|---|
| V2-S1 | MongoDB Sharding (Order collection بعد 10M docs) | 3 يوم |
| V2-S2 | Read-replicas routing للتقارير | 1 يوم |
| V2-S3 | Queue prioritization (critical separated) | 1 يوم |
| V2-S4 | Edge caching للـ catalog | 2 يوم |
| V2-S5 | APM performance budgets + alerts | 1 يوم |

---

## P0 Priority Fixes (يجب قبل أي عمل جديد)

الملف القائم في المشروع حالياً يحتاج إصلاحات فورية قبل إضافة أي ميزة. هذه مهام تأتي قبل كل ما سبق:

| # | المهمة | الوقت | السبب |
|---|---|---|---|
| FIX-1 | ملء الملفات الفارغة الثلاث (`utils/response.js`, `middleware/errorHandler.js`, `routes/notification.routes.js`) أو حذف الاستيراد | 0.5 يوم | الإقلاع مكسور |
| FIX-2 | إصلاح bug `processOrderPayment` (double credit + مسار `provider.earnings.total` غير موجود) | 0.25 يوم | ثغرة مالية |
| FIX-3 | تعطيل `POST /wallet/topup` الحالي (لا يعبر بوابة دفع) | 0.1 يوم | ثغرة مالية |
| FIX-4 | إصلاح `$or` المكرر في order.controller coupon filter | 0.1 يوم | bug منطقي |
| FIX-5 | إضافة admin login endpoint + seed كلمة مرور حقيقية | 0.5 يوم | لا مصادقة للإدارة |

**المجموع Fixes:** ~1.5 يوم.

إذا قرر العميل إيقاف التطوير الحالي والاستعاضة عنه بإعادة كتابة كاملة حسب الـ MVP plan، هذه الإصلاحات تُهمَل (الملفات المعاد كتابتها لن تحتوي هذه المشاكل).

---

## Dependencies Graph (Critical Path)

```
F1 → F2 → F3 → F5 → F6 → F7
         → F8 → F9 → F10 → F11 → F12
L1 → L2 → L3 → L4 → L5 → L6
                        → L7 → L8 → L9 → L10
A1 → A2 → A3 → A4 → A5 → A6 → A7
P1 → P2 → P3 → P4
O1 → O2 → O3 → O4 → O5 → O6 → O7 → O8 → O9
B1 → B2, B3, B4, B5
W1 → W2, W3, W4, W5, W6, W7, W8
C1 → C2 → C3 → C4
N1 → N2 → N3, N4
R1 → R2 → R3 → R4
AD1–AD12 متوازي بعد L و A
S1–S11 معظمها متوازي
PD1 → PD2 → PD3 → PD4
```

**Critical path للإطلاق:** F1→F2→L5 (ledger) + O1→O2→O3 (orders broadcasting) + W3 (Moyasar). تأخير أي واحدة يؤخر الإطلاق.

---

## Staffing Recommendation

- **Backend Lead (senior):** Architecture، ledger، payments، security.
- **Backend Dev 2 (senior):** Orders، bidding، broadcasting، sockets.
- **Backend Dev 3 (mid):** Admin، notifications، chat، catalog.
- **DevOps (part-time):** Infra, CI/CD, monitoring.
- **QA (part-time):** Integration tests، load tests قبل الإطلاق.

بـ 3 مطوّرَين + DevOps = 40–45 يوم للـ MVP (مطابق للجدول Q#46).
