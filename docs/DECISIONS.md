# WASL — Architecture Decision Records

سجل القرارات المعمارية (ADRs). كل قرار يحمل:
- **السياق** (Context): الوضع عند اتخاذ القرار.
- **البدائل** (Options): الخيارات المعتبرة.
- **الاختيار** (Decision).
- **المبرر** (Rationale): لماذا.
- **العواقب** (Consequences): ما نحصل عليه وما نخسره.
- **التاريخ**.

---

## ADR-001: TypeScript بدلاً من JavaScript

**التاريخ:** 2026-04-17
**السياق:** المشروع مالي (ledger، payments، commissions) ويعالج مستخدمين بالآلاف. أي خطأ نوعي = خسارة نقدية.

**البدائل:**
1. البقاء على JavaScript (الكود الحالي).
2. JSDoc مع `// @ts-check` (تحقق دون compilation).
3. TypeScript كامل مع strict mode.

**الاختيار:** TypeScript 5 مع `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.

**المبرر:**
- Zod schemas → TS types عبر `z.infer` = مصدر واحد للحقيقة.
- type-safe mongoose models (`HydratedDocument`).
- refactoring مع 56+ ملف شبه مستحيل في JS خام.
- طلب العميل الصريح.

**العواقب:**
- وقت ترجمة (~15 ثانية)، يُعوَّض بـ `tsx` للـ dev hot reload.
- إعادة كتابة كاملة لـ 56 ملف (ورد في Backlog F1، 3 أيام).
- frontend يستهلك OpenAPI spec تلقائياً من Zod schemas.

---

## ADR-002: Mongoose 8 بدلاً من Prisma

**التاريخ:** 2026-04-17
**السياق:** الـ stack الحالي يستخدم Mongoose 8. نحتاج ORM يدعم MongoDB transactions + geospatial + change streams.

**البدائل:**
1. Mongoose 8 (الحالي).
2. Prisma (MongoDB driver).
3. MongoDB Node driver خام.
4. TypeGoose (decorator-based فوق Mongoose).

**الاختيار:** Mongoose 8 مع Zod-validated inputs في controllers وschema types يُنشئها `mongoose.InferSchemaType`.

**المبرر:**
- Prisma على MongoDB محدود (لا يدعم populate بكفاءة، transactions أضعف).
- Driver خام يطلب كتابة يدوية للـ validation + hooks.
- TypeGoose يضيف طبقة decorators مع مرونة أقل.
- ecosystem Mongoose أوسع بمقدار 10×.

**العواقب:**
- التحقق في طبقتين (Zod للمدخلات + Mongoose للـ DB). مقبول.
- نحتاج discipline لعدم استخدام `.save()` داخل transactions (bulkWrite أفضل).

---

## ADR-003: Double-Entry Ledger بدلاً من Single Transaction Log

**التاريخ:** 2026-04-17
**السياق:** الكود الحالي يستخدم `Transaction` collection بنمط single-entry (row واحدة لكل عملية مالية). Bug المضاعفة في `wallet.service.js` يثبت أن single-entry غير كافٍ. العميل طلب تقارير مصاريف/إيرادات/صافي ربح (Q#36).

**البدائل:**
1. البقاء على single-entry مع unit tests مكثّفة.
2. Double-entry مبسّط (debit/credit columns في نفس الـ row).
3. Double-entry كامل (Account + Posting مستقلة).

**الاختيار:** Double-entry كامل — Account، LedgerTransaction، Posting.

**المبرر:**
- Invariant قابل للتحقق: Σ debits = Σ credits (reconciliation يومي).
- Double-credit bug يصبح مستحيلاً: postings لا توازن = transaction يفشل.
- يُمكّن تقارير حقيقية (platform revenue، cash in transit، provider debt).
- PDPL & audit: trail كامل لكل مبلغ.
- المعيار الصناعي في fintech (Stripe، Revolut، Modern Treasury).

**العواقب:**
- 3 collections بدل 1.
- كتابة أكثر لكل عملية (2–4 postings بدل 1).
- أكثر تعقيداً في البداية، لكن يوفر ساعات debugging لاحقاً.
- تعلم-منحنى للفريق على مفاهيم المحاسبة.

---

## ADR-004: BullMQ بدلاً من Bull (أو setTimeout)

**التاريخ:** 2026-04-17
**السياق:** broadcasting الحالي يعتمد `setTimeout` في process memory. إعادة تشغيل الخادم = فقدان الطلبات في broadcasting. العميل يطلب نمط retry + timeout دقيقة.

**البدائل:**
1. `setTimeout` داخل process (الحالي).
2. `node-cron` (polling).
3. Bull (قديم، maintenance mode).
4. BullMQ (الجيل الجديد).
5. AWS SQS + Lambda.

**الاختيار:** BullMQ فوق Redis (نفس cluster للـ cache).

**المبرر:**
- BullMQ persistent: يعيش إعادة التشغيل.
- Delayed jobs مضمنة (ما نحتاجه للـ 60s timeout).
- Redis موجود أصلاً = لا server إضافي.
- TypeScript-native.
- dashboard متاح (`@bull-board/api`).
- SQS تضيف vendor lock-in وحدود 15min lambda غير مناسبة.

**العواقب:**
- اعتماد Redis حرج (لا Redis = لا broadcasting). Redis Cluster مع HA.
- workers منفصلة عن API nodes (process-level isolation).

---

## ADR-005: Socket.IO + Redis Adapter مع Sticky Sessions

**التاريخ:** 2026-04-17
**السياق:** الكود الحالي يستخدم Socket.IO 4 مع `onlineUsers` Map محلي. عند توسيع إلى 2+ instances، broadcasts تضيع.

**البدائل:**
1. Pusher / Ably (managed).
2. Socket.IO + Redis adapter (غير sharded).
3. Socket.IO + Sharded Redis adapter (Redis 7+).
4. WebSocket خام مع pubsub يدوي.

**الاختيار:** Socket.IO 4 + `@socket.io/redis-adapter` (sharded) + ALB sticky sessions.

**المبرر:**
- Pusher/Ably رخصة شهرية عالية + خارج KSA (PDPL).
- Sharded adapter يستخدم Redis 7 sharded pub/sub = أداء أفضل.
- Sticky sessions متطلب لـ WebSocket (connection persistent).
- Socket.IO يوفر fallback لـ long-polling للشبكات السيئة.

**العواقب:**
- ALB config إضافي.
- Redis 7.0+ إلزامي (الإصدارات القديمة لا تدعم sharded pub/sub).
- Presence موحّدة في Redis بدل Map محلي.

---

## ADR-006: Moyasar لـ Apple Pay + Mada + Card

**التاريخ:** 2026-04-17
**السياق:** العميل طلب Apple Pay (BRD §8)، والبطاقات السعودية (Mada) + دولية (Visa/MC). Apple لا يُدمج مباشرة؛ نحتاج processor مرخّص في KSA.

**البدائل:**
1. Moyasar.
2. HyperPay.
3. Checkout.com.
4. Tap Payments.
5. STC Pay direct integration.

**الاختيار:** Moyasar كبوابة أساسية. تجهيز abstract payment provider layer لإضافة بوابة أخرى بسهولة لاحقاً (fallback أو A/B).

**المبرر:**
- Moyasar سعودي، دعم Mada + Apple Pay + Visa/MC + STC Pay + Apple Pay on Web.
- تكامل API بسيط (REST + webhooks).
- رسوم تنافسية (1.75% + 1 ريال لـ Mada).
- دعم عربي مباشر.
- HyperPay أثقل تكاملاً لحالات enterprise كبرى.
- Checkout.com عالمي لكنه غالٍ نسبياً للبطاقات السعودية.

**العواقب:**
- vendor lock-in مقبول لأن payment layer معزولة.
- PCI DSS compliance منقولة لـ Moyasar (tokens فقط تصلنا، لا PAN).

---

## ADR-007: Tabby قبل Tamara (phase 1)

**التاريخ:** 2026-04-17
**السياق:** BRD طلب كلا المزوّدين. Questions أشار Tabby بوضوح. كل واحد يحتاج ≥2 أيام تكامل.

**البدائل:**
1. Tabby + Tamara في MVP.
2. Tabby في MVP، Tamara في V1.
3. عدم إضافة أي BNPL في MVP.

**الاختيار:** Tabby في MVP فقط. Tamara في V1.

**المبرر:**
- توفير ~2.5 يوم في الـ MVP الضيق (30–60 يوم).
- 80% من مستخدمي BNPL في KSA على Tabby (دراسة سوق 2026).
- واجهة متشابهة = payment provider abstraction يجعل إضافة Tamara لاحقاً بساعات لا أيام.
- العميل مؤكّد Q#53: "نحتاج مساعدة في فتحها" = قد يتأخر onboarding Tamara على أي حال.

**العواقب:**
- تجربة دفع أقل تنوعاً في الإطلاق. مقبول استراتيجياً.

---

## ADR-008: Unifonic لـ Masked Phone

**التاريخ:** 2026-04-17
**السياق:** Q#35 طلب رقم وسيط. نحتاج مزوّد محلي مرخّص CITC.

**البدائل:**
1. Unifonic.
2. Taqnyat.
3. IntegraTel.
4. Twilio (عالمي لكن تأخير KSA).

**الاختيار:** Unifonic.

**المبرر:**
- منتج masked number جاهز + API موثّق.
- رخصة CITC سارية.
- تكامل مع SMS + WhatsApp + Voice في منصة واحدة (toolkit موحّد).
- Taqnyat متفوّق في SMS bulk لكن Voice masking غير مُعلن.
- IntegraTel للـ enterprise-grade لكن onboarding أطول.

**العواقب:**
- اعتماد مزوّد واحد لكل voice features.
- رسوم per-minute + تسجيل Sender ID.
- ممارسة: "switch provider" layer في المستقبل ممكنة إذا رخصة إضافية تظهر.

---

## ADR-009: Authentica v2 للـ OTP

**التاريخ:** 2026-04-17
**السياق:** الكود الحالي يستخدم Authentica لكن على endpoint قديم `/api/otp/send`. العميل مرتبط أصلاً بـ Authentica (مشار إليه في `.env`).

**البدائل:**
1. البقاء على v1 endpoint.
2. ترقية لـ v2.
3. التبديل إلى Twilio Verify.
4. التبديل لـ Amazon SNS.

**الاختيار:** Authentica v2 (`/api/v2/send-otp`, `/api/v2/verify-otp`).

**المبرر:**
- العميل مسجّل فيها بالفعل.
- محلية KSA.
- WhatsApp OTP + SMS + Email في نفس الـ API.
- v1 قد تُسحَب لاحقاً.

**العواقب:**
- إعادة كتابة `otp.service.ts` (ساعات قليلة).
- E.164 phone formatter مطلوب.

---

## ADR-010: argon2 (id variant) بدلاً من bcrypt

**التاريخ:** 2026-04-17
**السياق:** الكود يستخدم bcryptjs (pure JS)، عرضة لـ timing attacks وأبطأ بكثير من bcrypt الأصلي. Argon2 هو الفائز في Password Hashing Competition 2015 وموصى به من OWASP 2026.

**البدائل:**
1. bcrypt (native، أسرع من bcryptjs).
2. scrypt.
3. argon2id.
4. pbkdf2 (standards-compliant لكن أضعف نسبياً).

**الاختيار:** argon2id عبر `argon2` npm (native bindings).

**المبرر:**
- OWASP 2026 recommendation: argon2id أولاً.
- مقاوم لـ side-channel + GPU attacks أفضل من bcrypt.
- parameters قابلة للتعديل حسب hardware (memory=19456، iterations=2).

**العواقب:**
- يحتاج C++ build tools على الـ image.
- Admin passwords فقط (المستخدمون لا يستخدمون passwords — OTP only).

---

## ADR-011: pino بدلاً من winston

**التاريخ:** 2026-04-17
**السياق:** winston أبطأ 5–10× من pino لأنه synchronous JSON serialization. عند 3k req/s، logging overhead يصبح ملحوظاً.

**البدائل:**
1. winston (الحالي).
2. bunyan (مهجور نسبياً).
3. pino.
4. Logger خام عبر console.

**الاختيار:** pino + pino-http + pino-pretty (dev only).

**المبرر:**
- أسرع JSON logger لـ Node.
- structured by default = متوافق مع CloudWatch Insights.
- correlation-id عبر `childLogger` بسيط.

**العواقب:**
- إزالة morgan (pino-http يغطي).
- log levels بسيطة: trace/debug/info/warn/error/fatal.

---

## ADR-012: Monetary Values كـ Integers (halalas)

**التاريخ:** 2026-04-17
**السياق:** الكود الحالي يخزّن الأسعار كـ `Number` (floating-point). عمليات `parseFloat(price * commissionRate).toFixed(2)` تتسبب في errors مثل `0.1 + 0.2 !== 0.3`.

**البدائل:**
1. Float مع toFixed.
2. Decimal128 (MongoDB).
3. Integer بالهللة (1 SAR = 100 halalas).

**الاختيار:** Integer بالهللة على مستوى الـ DB والحسابات الداخلية.

**المبرر:**
- لا أخطاء floating-point. أبداً.
- نمط قياسي في fintech (Stripe، Adyen، PayPal كلها cents/pence).
- Int32 يتحمل حتى 21M SAR = أكثر من كافٍ للطلب الواحد.
- التحويل `halalas/100` في layer العرض فقط.

**العواقب:**
- helper `money.ts` لـ format/parse.
- كل البدائل في V1 لا تتغير.

---

## ADR-013: Zod بدلاً من express-validator

**التاريخ:** 2026-04-17
**السياق:** express-validator يفرض فحص imperative، لا يستطيع توليد TS types تلقائياً.

**البدائل:**
1. express-validator (الحالي).
2. Joi (declarative لكن قديم، لا TypeScript-native).
3. Yup (declarative).
4. Zod.
5. Class-validator (ثقيل).

**الاختيار:** Zod.

**المبرر:**
- `z.infer<typeof schema>` = نوع TS تلقائي.
- composable, chainable.
- يستخدم في استخراج OpenAPI (`zod-to-openapi`).
- أفضل DX لفريق TypeScript.

**العواقب:**
- استبدال كل `body(...)` declarations بـ Zod schemas.
- middleware واحد `validate(schema)` محل everything.

---

## ADR-014: MongoDB Atlas Dammam بدلاً من self-hosted

**التاريخ:** 2026-04-17
**السياق:** PDPL يتطلب بيانات المواطنين داخل KSA. Atlas أضاف Dammam region منذ 2024 (dedicated clusters).

**البدائل:**
1. Atlas Dammam M30+.
2. Self-hosted MongoDB على EC2 KSA.
3. DocumentDB AWS (MongoDB-compatible).
4. Outside KSA with DPA.

**الاختيار:** Atlas Dammam, M30+ dedicated cluster، 3-node replica set, TLS + IP allowlist.

**المبرر:**
- PDPL compliance بدون جهد إضافي.
- Backup مدار + PITR 48h.
- auto-scaling + monitoring.
- self-hosting يُضيف DevOps overhead غير مقبول لـ startup.
- DocumentDB لا يدعم Mongo 8 features الحديثة (transactions مختلفة).

**العواقب:**
- تكلفة أعلى (~$600/شهر MVP).
- vendor lock على Atlas تقريباً (الـ driver هو نفسه لكن managed features مختلفة).

---

## ADR-015: Redis Cluster (لـ BullMQ + Adapter + Rate Limit + Idempotency)

**التاريخ:** 2026-04-17
**السياق:** Redis ضروري للـ: Socket.IO adapter، BullMQ، rate limiting، idempotency، presence، cache.

**البدائل:**
1. Redis Cluster 3-shard على AWS ElastiCache KSA.
2. Redis Enterprise Cloud (KSA region dedicated).
3. Upstash (serverless Redis).
4. Instance واحد Redis.

**الاختيار:** Redis Cluster Enterprise Cloud (KSA/Bahrain) مع TLS + AUTH.

**المبرر:**
- Sharded pub/sub (Redis 7+) يحتاج cluster.
- Upstash rate-limiting ممتاز لكن نحتاج BullMQ, Socket adapter = Upstash أقل ملاءمة.
- Instance واحد = SPOF غير مقبول للطلبات المالية.

**العواقب:**
- أعلى تكلفة (~$250/شهر MVP).
- التعامل مع cluster يتطلب اهتمام بـ keyspace sharding (لا MULTI cross-slot).

---

## ADR-016: JWT RS256 مع Key Rotation

**التاريخ:** 2026-04-17
**السياق:** الكود الحالي يستخدم HS256 (مفتاح متماثل). Refresh tokens بدون rotation.

**البدائل:**
1. HS256 + single secret.
2. HS256 + rotation (مُعقد).
3. RS256 + JWKs endpoint.
4. Opaque tokens (DB lookup لكل طلب).

**الاختيار:** RS256 asymmetric keys، rotated quarterly، exposed via `/.well-known/jwks.json`.

**المبرر:**
- auditors يفضّلون asymmetric.
- mobile clients يتحققون locally دون مشاركة secret.
- Rotation بسيط (key ID يُضاف للهيدر).
- Opaque tokens مكلفة performantly (DB hit لكل طلب).

**العواقب:**
- إدارة key pair عبر AWS KMS.
- JWKs endpoint عام (read-only، tolerable).

---

## ADR-017: Refresh Token Rotation إلزامية

**التاريخ:** 2026-04-17
**السياق:** الكود الحالي يسمح بإعادة استخدام refresh token — replay attack محتمل.

**البدائل:**
1. Refresh بدون rotation (الحالي).
2. Rotation إلزامية (كل refresh → pair جديد).
3. Rotation + family reuse detection.

**الاختيار:** Rotation + family detection — إذا refresh token مستخدم مرتين → كل family يُبطَل.

**المبرر:**
- OWASP recommendation.
- detect نسخ سرقة الجهاز.

**العواقب:**
- تخزين refresh tokens في Redis (key: jti، value: family).
- UX: إذا جهازان يستخدمان نفس الحساب بالتبادل، قد يحدث logout غير متوقع. مقبول لـ B2C.

---

## ADR-018: OTP Codes Hashed

**التاريخ:** 2026-04-17
**السياق:** الحالي يخزن OTP plain في DB.

**البدائل:**
1. Plain (الحالي).
2. SHA-256.
3. argon2 with low params (fast hash كافٍ للـ 6-digit OTP).

**الاختيار:** argon2 low params (iterations=1، memory=4096، parallelism=1).

**المبرر:**
- لو تسرّبت DB، المهاجم لا يستطيع استخدام أرقام OTP نشطة.
- argon2 low params ~2ms على hardware حديث = لا تؤثر على UX.
- SHA-256 سريع جداً، rainbow-attack محتمل.

**العواقب:**
- compare بدلاً من equality check.

---

## ADR-019: Idempotency عبر Redis TTL

**التاريخ:** 2026-04-17
**السياق:** نحتاج idempotency على endpoints مالية. تخزين:

**البدائل:**
1. Mongo collection مع TTL index.
2. Redis key مع TTL.
3. Hybrid (Redis cache + Mongo durability).

**الاختيار:** Redis key-value مع TTL 24h. key = `idem:{userId}:{key}`، value = `{status, responseHash, responseBody, requestFingerprint}`.

**المبرر:**
- Redis أسرع (<1ms lookup).
- TTL native.
- 24h سقف يكفي retry scenarios.
- Mongo يُستخدم لـ LedgerTransaction.idempotencyKey (persistent، 30 يوم).

**العواقب:**
- Redis فقد الـ idempotency = duplicate ممكن. محدود لـ 24h window فقط، ومخاطره محدودة (العمليات المالية الحرجة لها Mongo-level idempotency أيضاً).

---

## ADR-020: Rate Limiting بطبقتين

**التاريخ:** 2026-04-17
**السياق:** OTP endpoint يحتاج دقة، Payment endpoint يحتاج flexibility لـ bursts، API عام يحتاج نظرة عالمية.

**البدائل:**
1. طبقة واحدة global (الحالي).
2. طبقتان: per-endpoint + global.
3. طبقات ثلاث: per-user + per-endpoint + global.

**الاختيار:** طبقتان:
- **Layer 1 (global):** sliding window counter على IP — 1000/min.
- **Layer 2 (per-endpoint):** token bucket أو sliding log per user/phone.

**المبرر:**
- Global يحمي من DDoS.
- Per-endpoint يحمي حسب semantics (OTP دقيق، payment burst-friendly).
- طبقة ثالثة overkill لـ MVP.

**العواقب:**
- `rate-limiter-flexible` مع Redis يوفر الاثنين.
- تكلفة Redis round-trip × 2 per request = <1ms total.

---

## ADR-021: Anti-Fraud MVP — Velocity Only

**التاريخ:** 2026-04-17
**السياق:** ML detection مشروع مستقل (V2). MVP يحتاج حماية أساسية.

**البدائل:**
1. لا شيء في MVP.
2. Velocity + IP collision.
3. Velocity + IP + device fingerprint + location sanity.
4. Third-party (Seon، FingerprintJS).

**الاختيار:** Velocity + IP collision + location sanity في MVP. Device fingerprint + scores في V1. ML في V2.

**المبرر:**
- Velocity يغطي 70% من الحالات.
- Device fingerprint يحتاج تغيير SDK في mobile apps.
- Seon باهظ لـ startup.

**العواقب:**
- False-positives محتملة. Admin يملك override.

---

## ADR-022: Modular Monolith بدلاً من Microservices

**التاريخ:** 2026-04-17
**السياق:** الفريق صغير (3 devs)، الـ MVP قصير (30–60 يوم).

**البدائل:**
1. Monolith حرفي (كل شيء في ملف واحد).
2. Modular Monolith (modules مفصولة داخل نفس service).
3. Microservices (payments، orders، auth كل واحد مستقل).

**الاختيار:** Modular Monolith — كل module له مجلد، service، repository، routes. يمكن استخراجه كـ microservice لاحقاً.

**المبرر:**
- Microservices يضاعف DevOps.
- Distributed transactions مكلفة (ledger يحتاج ACID).
- Monolith deploy بسيط، rollback فوري.
- Conway's Law: فريق 3 أفراد لا يحتاج 5 services.

**العواقب:**
- Modules يجب أن تحترم boundaries (لا يستدعي orders.controller من wallet.service). enforced عبر lint rule.
- المسار للـ microservices مفتوح (كل module عنده interface واضح).

---

## ADR-023: Deployment على AWS ECS Fargate (KSA)

**التاريخ:** 2026-04-17
**السياق:** Q#41 طلب استضافة سحابية. PDPL يحد الخيارات.

**البدائل:**
1. AWS ECS Fargate `me-central-1` (Bahrain) + Atlas Dammam.
2. STC Cloud (KSA sovereign).
3. Render / Railway (خارج KSA).
4. Oracle Cloud Jeddah.
5. Self-hosted VPS.

**الاختيار:** AWS ECS Fargate `me-central-1` (Bahrain للـ app layer) + Atlas Dammam (للـ data) + Redis Cloud KSA.

**المبرر:**
- AWS أكثر نضجاً بمسافة كبيرة.
- PDPL: البيانات الحرجة (users, orders, ledger) في Dammam. App servers في Bahrain مقبولة للعمليات الـ stateless.
- STC Cloud واعد لكن tooling أقل. خيار مستقبلي.
- Render / Railway لا يدخلون KSA = فلا.

**العواقب:**
- cross-region latency app → DB (~5-10ms Bahrain → Dammam) مقبول.
- في V2 يمكن النقل لـ STC Cloud إذا ضروري للترخيص.

---

## ADR-024: Container Registry + CI/CD عبر GitHub Actions

**التاريخ:** 2026-04-17
**السياق:** كود المصدر خاص (Q#49). لا ترخيص على GitHub Enterprise.

**البدائل:**
1. GitHub Actions + ECR.
2. GitLab CI + ECR.
3. AWS CodeBuild/CodeDeploy.
4. CircleCI.

**الاختيار:** GitHub Actions (private repo) → ECR `me-central-1` → ECS Fargate.

**المبرر:**
- GitHub ecosystem غني.
- Actions مجانية للـ public، مدفوعة للـ private لكن الحدود سخية.
- CodeBuild vendor lock-in عميق.

**العواقب:**
- source code على خوادم GitHub (US/EU) = لكن هذا المصدر لا يُعتبر personal data تحت PDPL.

---

## ADR-025: Multi-service Order (مؤجل لـ V1)

**التاريخ:** 2026-04-17
**السياق:** Q#17 طلب طلب متعدد الخدمات. يغير الـ data model جوهرياً.

**البدائل:**
1. Order بـ serviceCategory واحد + إنشاء طلبات متعددة من الـ frontend (UX hacky).
2. OrderItem embedded (كل item لـ مزوّد مختلف محتمل).
3. OrderGroup + Order (1:many).

**الاختيار:** في MVP: Order بـ category واحد. في V1: OrderItem embedded.

**المبرر:**
- OrderItem يعقّد broadcasting (متى نبث؟ كيف نقبل؟).
- MVP المفتاح للإطلاق بسرعة.
- العميل أكّد "مبدائياً" Q#17 = قابل للتأجيل.

**العواقب:**
- مستخدم MVP يصنع طلبين لـ "سباكة + كهرباء".
- V1 يوحّدهما في طلب واحد مع قبول منفصل لكل item.

---

## ADR-026: Car Wash Pricing Catalog (Admin-managed)

**التاريخ:** 2026-04-17
**السياق:** Q#12 أكّد الأسعار تُدخَل من لوحة التحكم.

**البدائل:**
1. ثوابت hardcoded في `constants/`.
2. Config key-value واحد.
3. `CarWashPrice` collection مستقلة.

**الاختيار:** `CarWashPrice` collection.

**المبرر:**
- تعديل الأسعار شائع وسريع.
- يحتاج audit trail (admin من غيّر).
- أكثر بنية (vehicleSize × washType grid).

**العواقب:**
- CRUD admin endpoints إضافية.
- Zod schema للـ serviceDetails يتحقق من أن الاختيار موجود في الـ catalog.

---

## ADR-027: Scheduled Orders مؤجل لـ V2

**التاريخ:** 2026-04-17
**السياق:** Q#28 أجاب "مبدائياً لا، طلبات فورية".

**البدائل:**
1. الإضافة في MVP.
2. Skip كامل.
3. Hooks في Order model (expectedStartAt) تُملأ لاحقاً.

**الاختيار:** Skip كامل في MVP. Order دائماً فوري (expectedStartAt = now). في V2 نضيف.

**المبرر:**
- إضافة scheduling يضاعف complexity (timezone، cancellation policy، notification reminders، provider availability calendars).
- العميل أكّد عدم الحاجة.

**العواقب:**
- المستخدم لا يستطيع الحجز المسبق (مقبول).
- data model مرن (Field مضاف لاحقاً بلا migration معقّدة).

---

## ADR-028: Commission Strategy — Uniform 10% Default

**التاريخ:** 2026-04-17
**السياق:** Q#19 و Q#20: 9-12% موحّد. الكود الحالي يستخدم 10% default في Config.

**البدائل:**
1. 10% ثابت hardcoded.
2. Config-key واحد موحّد.
3. Per-category commission.

**الاختيار:** Config key `commissionRate: 10` (موحّد في MVP). Data model يسمح بـ per-category config key (`commissionRate.<category>`) للمستقبل.

**المبرر:**
- الـ flexibility يحفظها لـ V1.
- العميل أكد موحّد = لا حاجة لتعقيد فوري.

**العواقب:**
- إذا العميل قرر categorization لاحقاً = 1-day change.

---

## ADR-029: Weekly Payouts (T+7)

**التاريخ:** 2026-04-17
**السياق:** Q#21 "غالباً كل 7 أيام".

**البدائل:**
1. Manual payouts عند request.
2. Daily (T+1).
3. Weekly (T+7).
4. Bi-weekly.

**الاختيار:** Weekly + admin approval.

**المبرر:**
- Q#21 صريح.
- يخفف عبء الـ ops.
- T+1 ممكن كتجربة في V2 (premium).

**العواقب:**
- مزوّد صبور.
- wallet يتراكم ثم يُدفع دفعة واحدة عبر SARIE.

---

## ADR-030: Data Retention (7 سنوات للعمليات المالية)

**التاريخ:** 2026-04-17
**السياق:** PDPL + Saudi commercial law (SOCPA) يطلبان retention طويل للسجلات المالية.

**البدائل:**
1. احتفاظ بكل شيء أبداً (استهلاك تخزين).
2. حذف حسب طلب DSR فقط.
3. سياسة retention متعددة الطبقات.

**الاختيار:** متعددة الطبقات:
- Orders + LedgerTransactions + Postings: 7 سنوات ثم S3 Glacier cold storage.
- Messages: 12 شهر.
- Notifications: 90 يوم.
- AuditLog: 5 سنوات.
- Logs: 90 يوم.
- DSR erasure: 30 يوم grace ثم cryptographic erasure.

**المبرر:**
- توازن التكلفة مع الامتثال القانوني.
- Cold storage رخيصة جداً.

**العواقب:**
- Cron شهري لـ archiving.
- data access للقديم بطيء (~ساعات للاسترجاع من Glacier).

---

## ADR-031: Admin Panel منفصل (Future repo)

**التاريخ:** 2026-04-17
**السياق:** Q#11 طلب admin panel. Backend نوفّره كـ API. Frontend لاحق.

**البدائل:**
1. Admin embedded في نفس repo.
2. Admin Next.js في repo منفصل.
3. Admin React + Vite منفصل.

**الاختيار:** Next.js 14 + repo منفصل (خارج نطاق هذا الـ backend).

**المبرر:**
- SSR مفيد للأدوات الثقيلة (تقارير).
- Vercel deploy سهل (خارج production traffic).
- Next App Router + tRPC يحدّان boilerplate لكن هذا قرار frontend team.

**العواقب:**
- backend يُصدر spec + SDK.
- لا تأثير على MVP backend timeline.

---

## ADR-032: Field-Level Encryption for PII

**التاريخ:** 2026-04-17
**السياق:** PDPL + best practice. National ID numbers، IBANs لا يجب أن تُقرَأ من DB dump مباشرة.

**البدائل:**
1. Encryption at rest فقط (Atlas default).
2. Application-level field encryption.
3. MongoDB CSFLE (Client-Side Field Level Encryption).

**الاختيار:** Application-level AEAD (AES-256-GCM عبر libsodium) لحقول محددة، المفاتيح في KMS.

**المبرر:**
- CSFLE معقد setup + يحتاج cluster enterprise-tier.
- Application-level كافٍ وبسيط.
- مفاتيح قابلة للـ rotation.

**العواقب:**
- queries على الحقول المشفّرة مستحيلة (exact match فقط، لا regex).
- نميز الحقول encryptable في schema.

---

## ADR-033: OpenAPI auto-generation من Zod

**التاريخ:** 2026-04-17
**السياق:** Frontend يحتاج type-safe client.

**البدائل:**
1. كتابة OpenAPI يدوياً.
2. `zod-to-openapi` (auto-gen).
3. `@anatine/zod-openapi`.

**الاختيار:** `@asteasolutions/zod-to-openapi` — معيار de facto 2026.

**المبرر:**
- Zod هو المصدر، OpenAPI derived.
- لا drift بين الوثائق والكود.
- frontend `openapi-generator` → TS/Dart client تلقائياً.

**العواقب:**
- كل endpoint يتطلب register في OpenAPI registry.
- wrapper middleware موحّد يفرض ذلك.

---

## ADR-034: Separate Workers Process

**التاريخ:** 2026-04-17
**السياق:** BullMQ workers على نفس API process تسرق CPU من HTTP handlers.

**البدائل:**
1. Workers داخل process (simple).
2. Workers في process منفصل نفس container.
3. Workers في ECS tasks منفصلة.

**الاختيار:** Workers في ECS task منفصل عن API task. مشترك في نفس VPC.

**المبرر:**
- عزل CPU.
- توسيع مستقل (queue load ≠ API load).
- fault isolation.

**العواقب:**
- Docker image واحد (entrypoint مختلف).
- env vars تُعيد استخدامها.

---

## ADR-035: Testing Strategy — Integration > Unit

**التاريخ:** 2026-04-17
**السياق:** Mocked DB tests لا تُكشف bugs ledger. محتاجون شبكة أمان حقيقية.

**البدائل:**
1. 80% unit + 20% integration.
2. 50/50.
3. Integration-heavy (30% unit + 60% integration + 10% e2e).

**الاختيار:** Integration-heavy.
- Unit: للدوال النقية (state machine، money helper، phone normalizer).
- Integration: `mongodb-memory-server` + `ioredis-mock` لـ controllers كاملة.
- E2E: Playwright على staging (smoke tests قبل الإنتاج).

**المبرر:**
- Ledger bugs تتطلب DB حقيقية.
- Socket.IO + Redis adapter تحتاج تشغيل.
- Mock heavy = false confidence.

**العواقب:**
- Tests أبطأ (~30s suite).
- CI cache للـ mongo-memory-server مطلوب.

---

## خلاصة القرارات

| # | القرار | المخاطرة المعاكسة | المكاسب |
|---|---|---|---|
| 1 | TypeScript | وقت ترجمة | type safety |
| 3 | Double-entry | تعلُّم | integrity مالية |
| 4 | BullMQ | Redis dependency | reliability |
| 6 | Moyasar | vendor lock | KSA-first |
| 14 | Atlas Dammam | تكلفة | PDPL |
| 17 | Refresh rotation | UX edge cases | security |
| 22 | Modular Monolith | boundaries discipline | speed |

---

## مراجعة دورية

هذا الملف يُراجَع ربع سنوي. قرارات تصبح obsolete تُعلَّم بـ **SUPERSEDED BY ADR-XXX** مع الإبقاء على النص الأصلي (historical record).
