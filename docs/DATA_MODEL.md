# WASL — Data Model

كل Collection موصوفة بالحقول، الأنواع، القيم الافتراضية، المطلوب، العلاقات، الفهارس، وقواعد التحقق.
جميع المبالغ تُخزَّن بالهللة (`halalas` = 1/100 SAR) كـ `Int32` لتفادي أخطاء عائمة.

---

## 1. User

يمثّل كل مستخدم في النظام باستثناء Admin (له collection منفصل).

| الحقل | النوع | مطلوب | Default | ملاحظات |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | — |
| `name` | String (2–60) | ✓ | — | يتم إكماله بعد OTP |
| `phone` | String E.164 | ✓ | — | `+9665XXXXXXXX`، فريد |
| `email` | String (lowercase, email format) | — | null | فريد لو وُجد (sparse) |
| `role` | Enum `client` \| `provider` | ✓ | `client` | provider يعيَّن بعد approval |
| `status` | Enum `pending_profile` \| `active` \| `suspended` \| `awaiting_approval` | ✓ | `pending_profile` | `awaiting_approval` للمزوّد قبل موافقة الإدارة |
| `avatar` | { url: String, publicId: String } | — | null | Cloudinary |
| `addresses` | Array&lt;Address&gt; | — | [] | مضمّنة (embedded)، `_id: true` |
| `currentLocation` | GeoJSON Point | — | null | يُحدَّث live لمقدم الخدمة |
| `deviceTokens` | Array&lt;{ token, platform: 'ios'\|'android', lastSeenAt }&gt; | — | [] | حد أقصى 5 |
| `language` | Enum `ar`, `en` | ✓ | `ar` | — |
| `referralCode` | String (8 أحرف upper) | ✓ | auto | فريد |
| `referredBy` | ObjectId → User | — | null | — |
| `isMinor` | Boolean | — | false | compliance flag |
| `consentPdplAt` | Date | — | null | timestamp موافقة PDPL |
| `consentMarketingAt` | Date | — | null | اشتراك تسويقي منفصل |
| `lastSeenAt` | Date | — | null | heartbeat |
| `deletedAt` | Date | — | null | soft delete (PDPL DSR) |
| `timestamps` | — | — | — | `createdAt`, `updatedAt` |

### Address (embedded sub-document)

| الحقل | النوع | مطلوب | Default | ملاحظات |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | — |
| `label` | String | ✓ | — | "منزل"، "عمل"، ... |
| `details` | String | — | '' | "شارع الأمير، مبنى 12" |
| `coordinates` | GeoJSON Point | ✓ | — | `[lng, lat]` |
| `isDefault` | Boolean | — | false | — |

### الفهارس

| Index | Type | السبب |
|---|---|---|
| `{ phone: 1 }` | unique | اللوقن عبر الهاتف |
| `{ email: 1 }` | unique sparse | البحث والتسجيل الاختياري |
| `{ role: 1, status: 1 }` | compound | قوائم الإدارة (pending providers) |
| `{ referralCode: 1 }` | unique sparse | redeem |
| `{ currentLocation: "2dsphere" }` | geospatial | tracking |
| `{ "addresses.coordinates": "2dsphere" }` | geospatial | order nearest |
| `{ createdAt: -1 }` | — | cohort analytics |
| `{ deletedAt: 1 }` | sparse | DSR cleanup jobs |

### Validation

- `phone` يمر عبر `phone.ts` normalizer → E.164، يرفض غير KSA إن حُدّد.
- `email` عند وجوده، lowercase + email regex (Zod + mongoose).
- `deviceTokens` unique per user (pre-save).
- `isMinor=true` يمنع استقبال قوائم خدمات كبار السن (business rule لاحقاً).

---

## 2. Admin

منفصل عن User لأسباب أمنية (password + MFA، لا OTP).

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `name` | String | ✓ | — |
| `email` | String | ✓ | — |
| `passwordHash` | String (argon2id) | ✓ | — |
| `mfaSecret` | String (encrypted) | — | null |
| `mfaEnabled` | Boolean | — | false |
| `permissions` | Array&lt;String&gt; | — | [] | e.g. `providers.approve`, `coupons.create` |
| `isSuperAdmin` | Boolean | — | false | — |
| `lastLoginAt` | Date | — | null | — |
| `failedLoginCount` | Number | — | 0 | auto-reset على نجاح |
| `lockedUntil` | Date | — | null | brute force protection |
| `timestamps` | — | — | — | — |

### الفهارس
- `{ email: 1 }` unique
- `{ permissions: 1 }` (للبحث عن من يملك صلاحية معينة)

---

## 3. Provider

ملف مهني مرتبط بـ User (1:1).

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `userId` | ObjectId → User | ✓ unique | — |
| `specialty` | Array&lt;ServiceCategoryEnum&gt; | ✓ | — | ≥1 |
| `subCategories` | Array&lt;ObjectId → ServiceSubCategory&gt; | — | [] |
| `documents` | DocumentsEmbedded | ✓ | — | (أدناه) |
| `vehicle` | { type, model, year, plateNumber } | — | {} |
| `approvalStatus` | Enum `pending`, `approved`, `rejected` | ✓ | `pending` |
| `approvalNote` | String | — | '' |
| `approvedAt` | Date | — | null |
| `approvedBy` | ObjectId → Admin | — | null |
| `isOnline` | Boolean | — | false |
| `lastOnlineAt` | Date | — | null |
| `currentLocation` | GeoJSON Point | — | null |
| `locationUpdatedAt` | Date | — | null |
| `serviceRadius` | Number (km) | ✓ | 10 | max 50 |
| `bankInfo` | { iban, bankName, accountName } | — | {} | encrypted at rest |
| `completedOrders` | Number | — | 0 | denorm |
| `cancelledOrders` | Number | — | 0 | denorm |
| `cancellationRate` | Number | — | 0 | computed |
| `avgRating` | Number (0–5) | — | 0 | denorm من Reviews |
| `ratingCount` | Number | — | 0 | denorm |
| `autoSuspended` | Boolean | — | false |
| `riskScore` | Number (0–100) | — | 0 | fraud signal |
| `timestamps` | — | — | — | — |

### Documents (embedded)

```
documents:
  nationalId:       { front: DocumentFile, back: DocumentFile, number: EncryptedString }
  residencePermit:  { front: DocumentFile, back: DocumentFile, number: EncryptedString, expiresAt: Date }
  drivingLicense:   DocumentFile
  profilePhoto:     DocumentFile
  professionCard:   DocumentFile   (optional)
```

### DocumentFile

| الحقل | النوع | ملاحظات |
|---|---|---|
| `url` | String | Cloudinary/S3 URL |
| `publicId` | String | لاحذف |
| `uploadedAt` | Date | — |
| `verified` | Boolean | admin verified manually |

### الفهارس

| Index | Type | السبب |
|---|---|---|
| `{ userId: 1 }` | unique | 1:1 link |
| `{ approvalStatus: 1, createdAt: 1 }` | compound | queue الإدارة |
| `{ approvalStatus: 1, isOnline: 1, specialty: 1, currentLocation: "2dsphere" }` | compound + geospatial | broadcasting query (ESR) |
| `{ autoSuspended: 1, approvalStatus: 1 }` | compound | dashboard |
| `{ avgRating: -1 }` | — | leaderboards |

### Validation

- `specialty` فرع enum مُحدد في `constants/service-categories.ts`.
- `bankInfo.iban` SA-IBAN validation (22 char، checksum).
- `serviceRadius` ∈ [1, 50].
- Pre-save: `cancellationRate = cancelledOrders / (completedOrders + cancelledOrders)`.

---

## 4. Order

الطلب — الكيان المركزي.

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `orderNumber` | String (`WSL-<ts36>-<rnd>`) | ✓ unique | auto |
| `clientId` | ObjectId → User | ✓ | — |
| `providerId` | ObjectId → User | — | null |
| `items` | Array&lt;OrderItem&gt; | ✓ | — | ≥1 |
| `pricingType` | Enum `fixed`, `bid` | ✓ | computed من items |
| `status` | OrderStatusEnum | ✓ | `pending` |
| `location` | GeoJSON Point + address | ✓ | — |
| `addressId` | ObjectId (ref Address) | — | null |
| `subtotal` | Int (halalas) | ✓ | 0 | قبل الخصومات |
| `discountAmount` | Int | — | 0 |
| `distanceFee` | Int | — | 0 |
| `totalPrice` | Int | ✓ | 0 |
| `commission` | { rate: Number, amount: Int } | ✓ | — |
| `providerPayout` | Int | — | 0 | totalPrice - commission |
| `paymentStatus` | Enum `unpaid`, `authorized`, `captured`, `refunded`, `settled` | ✓ | `unpaid` |
| `paymentMethod` | Enum `wallet`, `card`, `tabby`, `apple_pay`, `cash` | ✓ | `cash` |
| `paymentReference` | String | — | '' |
| `couponCode` | String | — | '' |
| `photos.before` | Array&lt;{ url, uploadedAt }&gt; | — | [] |
| `photos.after` | Array&lt;{ url, uploadedAt }&gt; | — | [] |
| `timeline` | Array&lt;{ status, note, actor, timestamp }&gt; | — | [] |
| `broadcastedTo` | Array&lt;ObjectId → User&gt; | — | [] |
| `rejectedBy` | Array&lt;ObjectId → User&gt; | — | [] |
| `broadcastAttemptCount` | Number | — | 0 |
| `estimatedArrivalMinutes` | Number | — | null |
| `chatId` | ObjectId → Chat | — | null |
| `maskedPhoneSessionId` | ObjectId → MaskedPhoneSession | — | null |
| `cancelledBy` | ObjectId | — | null |
| `cancellationReason` | String | — | '' |
| `expiresAt` | Date | — | null | 10m للـ bid-based |
| `version` | Number | — | 0 | optimistic lock |
| `timestamps` | — | — | — | — |

### OrderItem (embedded)

| الحقل | النوع | ملاحظات |
|---|---|---|
| `_id` | ObjectId | auto |
| `serviceCategory` | Enum | e.g. `car_wash` |
| `subCategoryId` | ObjectId | ref ServiceSubCategory |
| `details` | Mixed | schema-per-category (validated بـ Zod) |
| `price` | Int (halalas) | 0 إذا bid-based |
| `isFixedPrice` | Boolean | — |

### الفهارس

| Index | Type | السبب |
|---|---|---|
| `{ orderNumber: 1 }` | unique | — |
| `{ clientId: 1, createdAt: -1 }` | compound | "طلباتي" |
| `{ providerId: 1, createdAt: -1 }` | compound | "طلباتي المزوّد" |
| `{ status: 1, createdAt: -1 }` | compound | admin + monitoring |
| `{ "items.serviceCategory": 1, status: 1 }` | compound | reports |
| `{ location: "2dsphere" }` | geo | nearby orders |
| `{ paymentStatus: 1, status: 1 }` | compound | settlement cron |
| `{ expiresAt: 1 }` | TTL (0s، partial: `status=broadcasting`) | auto-expire |
| `{ createdAt: -1 }` | — | analytics |

### Validation

- `totalPrice = subtotal - discountAmount + distanceFee` (invariant).
- `commission.amount = round(subtotal × commission.rate)`.
- `providerPayout = totalPrice - commission.amount`.
- `pricingType=fixed` ⇒ كل item.isFixedPrice=true.
- `pricingType=bid` ⇒ item.price=0 على الإنشاء.

---

## 5. Bid

عروض الأسعار (لـ non-fixed services).

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `orderId` | ObjectId → Order | ✓ | — |
| `providerId` | ObjectId → User | ✓ | — |
| `price` | Int (halalas) | ✓ | — |
| `note` | String (max 500) | — | '' |
| `arrivalTimeMinutes` | Number | — | null |
| `status` | Enum `pending`, `accepted`, `rejected`, `expired` | ✓ | `pending` |
| `expiresAt` | Date | — | null |
| `deviceFingerprint` | String | — | null | anti-fraud |
| `ipAddress` | String (hashed) | — | null | anti-fraud |
| `timestamps` | — | — | — | — |

### الفهارس
- `{ orderId: 1, status: 1 }`
- `{ orderId: 1, price: 1 }` (ترتيب تصاعدي للعميل)
- `{ providerId: 1, createdAt: -1 }` (سجل المزوّد)
- `{ orderId: 1, providerId: 1 }` unique (lone bid per provider per order)
- `{ expiresAt: 1 }` TTL

### Validation

- `price > 0`.
- لا يمكن إضافة bid إلا إذا `order.status=broadcasting` و `order.pricingType=bid`.

---

## 6. Chat + Message

### Chat

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `orderId` | ObjectId → Order | ✓ unique | — |
| `clientId` | ObjectId → User | ✓ | — |
| `providerId` | ObjectId → User | ✓ | — |
| `lastMessage` | String | — | '' |
| `lastMessageAt` | Date | — | null |
| `lastMessageType` | Enum `text`, `image`, `location` | — | null |
| `unreadCount` | Map&lt;String, Number&gt; | — | {} | per userId |
| `isActive` | Boolean | — | true | closed 30d بعد order completion |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ orderId: 1 }` unique
- `{ clientId: 1, lastMessageAt: -1 }`
- `{ providerId: 1, lastMessageAt: -1 }`
- `{ isActive: 1, lastMessageAt: 1 }` (cleanup)

### Message

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `chatId` | ObjectId → Chat | ✓ | — |
| `senderId` | ObjectId → User | ✓ | — |
| `type` | Enum `text`, `image`, `location` | ✓ | `text` |
| `content` | String (max 2000) | — | '' |
| `mediaUrl` | String | — | '' |
| `mediaPublicId` | String | — | '' |
| `location` | { lat: Number, lng: Number } | — | null |
| `isRead` | Boolean | — | false |
| `readAt` | Date | — | null |
| `deletedAt` | Date | — | null |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ chatId: 1, createdAt: 1 }` — timeline read
- `{ senderId: 1 }` — reports
- `{ chatId: 1, isRead: 1 }` — unread lookups
- `{ createdAt: 1 }` TTL 12 شهر (لا نحفظ chats قديمة جداً)

---

## 7. Account (Ledger)

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `type` | AccountTypeEnum | ✓ | — | (customer_wallet, provider_wallet, ...) |
| `ownerId` | ObjectId → User | — | null | null للـ SYSTEM accounts |
| `ownerType` | Enum `user`, `system` | ✓ | `user` |
| `currency` | String | ✓ | `SAR` |
| `balance` | Int (halalas) | ✓ | 0 | denormalized |
| `version` | Number | ✓ | 0 | optimistic lock |
| `isLocked` | Boolean | — | false | admin freeze |
| `metadata` | Mixed | — | {} |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ ownerId: 1, type: 1 }` unique (مستخدم لا يملك حسابين من نفس النوع)
- `{ type: 1, ownerType: 1 }`

### AccountType Enum

```
customer_wallet | provider_wallet | provider_commission_debt
platform_revenue | platform_refunds | cash_in_transit
payment_gateway_clearing | payout_pending | referral_bonus_pool
```

---

## 8. LedgerTransaction + Posting

### LedgerTransaction

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `idempotencyKey` | String | ✓ unique | — |
| `kind` | TxKindEnum | ✓ | — | order_payment_wallet, order_settlement_cash, ... |
| `orderId` | ObjectId → Order | — | null |
| `initiatedBy` | ObjectId → User/Admin | — | null |
| `narration` | String | — | '' |
| `postedAt` | Date | ✓ | now |
| `reversedBy` | ObjectId → LedgerTransaction | — | null |
| `metadata` | Mixed | — | {} |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ idempotencyKey: 1 }` unique
- `{ orderId: 1 }`
- `{ kind: 1, postedAt: -1 }`
- `{ postedAt: -1 }`

### Posting

Append-only.

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `txId` | ObjectId → LedgerTransaction | ✓ | — |
| `accountId` | ObjectId → Account | ✓ | — |
| `direction` | Enum `DEBIT`, `CREDIT` | ✓ | — |
| `amount` | Int (halalas) | ✓ | — | > 0 |
| `balanceAfter` | Int | ✓ | — | snapshot |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ txId: 1 }`
- `{ accountId: 1, createdAt: -1 }` (account statement)
- `{ accountId: 1, direction: 1 }` (balance reconstruction)

### Invariant (enforced في الـ service)

```
Σ over postings of tx: Σ(direction=DEBIT) = Σ(direction=CREDIT)
```

---

## 9. WithdrawalRequest

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `providerId` | ObjectId → User | ✓ | — |
| `amount` | Int (halalas) | ✓ | — |
| `status` | Enum `pending`, `approved`, `processing`, `paid`, `rejected` | ✓ | `pending` |
| `bankIban` | String | ✓ | — | snapshot من Provider |
| `accountName` | String | ✓ | — |
| `rejectionReason` | String | — | '' |
| `processedBy` | ObjectId → Admin | — | null |
| `payoutBatchId` | ObjectId → PayoutBatch | — | null |
| `externalRef` | String | — | '' | SARIE reference |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ providerId: 1, createdAt: -1 }`
- `{ status: 1, createdAt: 1 }`
- `{ payoutBatchId: 1 }`

---

## 10. PayoutBatch

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `batchNumber` | String | ✓ unique | — |
| `weekStart` | Date | ✓ | — |
| `weekEnd` | Date | ✓ | — |
| `status` | Enum `building`, `ready`, `exported`, `completed`, `failed` | ✓ | `building` |
| `totalAmount` | Int (halalas) | ✓ | 0 |
| `itemCount` | Number | ✓ | 0 |
| `exportedFilePath` | String | — | '' | SARIE file path |
| `completedAt` | Date | — | null |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ batchNumber: 1 }` unique
- `{ weekStart: 1 }`
- `{ status: 1 }`

---

## 11. Coupon

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `code` | String (upper) | ✓ unique | — |
| `title_ar` | String | ✓ | — |
| `title_en` | String | ✓ | — |
| `discountType` | Enum `percentage`, `fixed` | ✓ | — |
| `discountValue` | Int | ✓ | — | percent 0–100 أو halalas |
| `maxUses` | Number | — | null |
| `usedCount` | Number | — | 0 |
| `maxUsesPerUser` | Number | — | 1 |
| `minOrderValue` | Int (halalas) | — | 0 |
| `maxDiscount` | Int | — | null |
| `applicableCategories` | Array&lt;ServiceCategoryEnum&gt; | — | [] | empty = all |
| `isActive` | Boolean | — | true |
| `startsAt` | Date | — | null |
| `expiresAt` | Date | — | null |
| `usedBy` | Array&lt;{ userId, orderId, at }&gt; | — | [] |
| `createdBy` | ObjectId → Admin | ✓ | — |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ code: 1 }` unique
- `{ isActive: 1, expiresAt: 1 }` (lookup valid)
- `{ createdAt: -1 }`

---

## 12. Review

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `orderId` | ObjectId → Order | ✓ | — |
| `fromUser` | ObjectId → User | ✓ | — |
| `toUser` | ObjectId → User | ✓ | — |
| `role` | Enum `client_to_provider`, `provider_to_client` | ✓ | — |
| `rating` | Int 1–5 | ✓ | — |
| `comment` | String (max 1000) | — | '' |
| `isVisibleToPublic` | Boolean | — | true | false لـ provider_to_client |
| `isDeletedByAdmin` | Boolean | — | false |
| `deletedByAdminId` | ObjectId → Admin | — | null |
| `deletedReason` | String | — | '' |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ orderId: 1, fromUser: 1 }` unique (مرة واحدة لكل طلب لكل طرف)
- `{ toUser: 1, role: 1, isVisibleToPublic: 1 }`
- `{ fromUser: 1 }`
- `{ rating: 1 }`

Business rule: pre-save يفرض `isVisibleToPublic=false` إذا `role='provider_to_client'` (Q#31).

---

## 13. Notification

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `userId` | ObjectId → User | ✓ | — |
| `type` | NotificationTypeEnum | ✓ | — |
| `title_ar` | String | ✓ | — |
| `title_en` | String | ✓ | — |
| `body_ar` | String | ✓ | — |
| `body_en` | String | ✓ | — |
| `data` | Mixed | — | {} |
| `isRead` | Boolean | — | false |
| `readAt` | Date | — | null |
| `channel` | Enum `push`, `in_app`, `both` | ✓ | `both` |
| `deliveryStatus` | Enum `queued`, `sent`, `failed` | ✓ | `queued` |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ userId: 1, createdAt: -1 }`
- `{ userId: 1, isRead: 1 }`
- `{ createdAt: 1 }` TTL 90 يوم

---

## 14. Otp

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `phone` | String E.164 | ✓ | — |
| `codeHash` | String (argon2) | ✓ | — | **لا نخزن الرمز الخام** |
| `purpose` | Enum `login`, `change_phone`, `withdrawal_confirm` | ✓ | `login` |
| `attempts` | Number | — | 0 |
| `isUsed` | Boolean | — | false |
| `usedAt` | Date | — | null |
| `requestedIp` | String | — | '' |
| `expiresAt` | Date | ✓ | — |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ phone: 1, createdAt: -1 }`
- `{ expiresAt: 1 }` TTL 0s

---

## 15. MaskedPhoneSession

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `orderId` | ObjectId → Order | ✓ | — |
| `clientPhone` | String E.164 | ✓ | — |
| `providerPhone` | String E.164 | ✓ | — |
| `maskedNumber` | String | ✓ | — |
| `providerName` | String (Unifonic) | ✓ | — |
| `externalSessionId` | String | ✓ | — |
| `status` | Enum `active`, `expired`, `terminated` | ✓ | `active` |
| `expiresAt` | Date | ✓ | — |
| `callHistory` | Array&lt;{ direction, startedAt, durationSec }&gt; | — | [] |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ orderId: 1 }` unique (active only via partial)
- `{ expiresAt: 1 }` TTL
- `{ externalSessionId: 1 }`

---

## 16. BroadcastAttempt

Audit log لكل محاولة broadcast.

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `orderId` | ObjectId → Order | ✓ | — |
| `attemptNumber` | Number | ✓ | — |
| `providersNotified` | Array&lt;ObjectId&gt; | — | [] |
| `winnerProviderId` | ObjectId | — | null |
| `outcome` | Enum `accepted`, `rejected`, `timeout`, `no_providers` | ✓ | — |
| `startedAt` | Date | ✓ | — |
| `endedAt` | Date | — | null |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ orderId: 1, attemptNumber: 1 }` unique
- `{ createdAt: -1 }`

---

## 17. ServiceSubCategory

فئات فرعية (أجهزة منزلية، تكييف، سباكة، كهرباء، ...).

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `parent` | ServiceCategoryEnum | ✓ | — |
| `keyAr` | String | ✓ | — |
| `keyEn` | String | ✓ | — |
| `slug` | String | ✓ unique | — |
| `icon` | String | — | '' |
| `sortOrder` | Number | — | 0 |
| `isActive` | Boolean | — | true |
| `requiresVehicle` | Boolean | — | false |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ parent: 1, isActive: 1, sortOrder: 1 }`
- `{ slug: 1 }` unique

---

## 18. CarWashPrice

جدول الأسعار الثابت (Q#12: "تدخل يدوياً من لوحة التحكم").

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `vehicleSize` | Enum `small`, `medium`, `large` | ✓ | — |
| `washType` | Enum `exterior_basic`, `exterior_wax`, `exterior_wax_double`, `exterior_plus_interior_basic`, `exterior_plus_interior_wax`, `exterior_plus_interior_double`, `interior_only` | ✓ | — |
| `price` | Int (halalas) | ✓ | — |
| `isActive` | Boolean | — | true |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ vehicleSize: 1, washType: 1 }` unique

---

## 19. Banner

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `title_ar` | String | ✓ | — |
| `title_en` | String | ✓ | — |
| `image_ar` | String | ✓ | — |
| `image_en` | String | ✓ | — |
| `linkType` | Enum `none`, `service`, `external`, `coupon` | ✓ | `none` |
| `linkPayload` | String | — | '' |
| `sortOrder` | Number | — | 0 |
| `isActive` | Boolean | — | true |
| `startsAt` | Date | — | null |
| `expiresAt` | Date | — | null |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ isActive: 1, sortOrder: 1 }`

---

## 20. Config (key-value)

ثوابت قابلة للتعديل من الإدارة (serviceRadius، workingHours، commissionRate، ...).

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `key` | String | ✓ unique | — |
| `value` | Mixed | ✓ | — |
| `type` | Enum `number`, `string`, `boolean`, `object` | ✓ | — |
| `category` | String | ✓ | — | pricing, geo, ops, ... |
| `updatedBy` | ObjectId → Admin | — | null |
| `timestamps` | — | — | — | — |

### Default Keys

```
serviceRadius          (number, km)       = 10
workingHours           (object)           = { start: "06:00", end: "23:00" }
commissionRate         (number, %)        = 10
orderAcceptanceWindow  (number, seconds)  = 60
distanceFeePerKm       (number, halalas)  = 0
minRatingThreshold     (number)           = 2
paymentMethods         (object)           = { cash: true, card: true, wallet: true, tabby: true, apple_pay: true }
maintenanceMode        (boolean)          = false
referralBonus          (number, halalas)  = 0
maxBidsPerOrder        (number)           = 10
maxBroadcastAttempts   (number)           = 5
minWithdrawal          (number, halalas)  = 10000
maxWithdrawalPerDay    (number, halalas)  = 500000
bidExpiryMinutes       (number)           = 10
timezoneOffset         (number, hours)    = 3
```

---

## 21. Referral

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `referrerId` | ObjectId → User | ✓ | — |
| `refereeId` | ObjectId → User | ✓ | — |
| `code` | String | ✓ | — |
| `status` | Enum `registered`, `qualified`, `rewarded` | ✓ | `registered` |
| `firstOrderId` | ObjectId → Order | — | null |
| `bonusAmount` | Int (halalas) | — | 0 |
| `rewardedAt` | Date | — | null |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ referrerId: 1, createdAt: -1 }`
- `{ refereeId: 1 }` unique (كل شخص يُحال مرة واحدة فقط)
- `{ status: 1 }`

---

## 22. AuditLog

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `actorType` | Enum `admin`, `system`, `user` | ✓ | — |
| `actorId` | ObjectId | — | null |
| `action` | String | ✓ | — | e.g. `provider.approve` |
| `targetType` | String | ✓ | — | `User`, `Order`, ... |
| `targetId` | ObjectId | — | null |
| `diff` | Mixed | — | {} | before/after |
| `ipAddress` | String | — | '' |
| `userAgent` | String | — | '' |
| `correlationId` | String | — | '' |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ actorType: 1, actorId: 1, createdAt: -1 }`
- `{ targetType: 1, targetId: 1, createdAt: -1 }`
- `{ action: 1 }`
- `{ createdAt: -1 }`

**immutability:** لا UPDATE ولا DELETE — enforced في repository layer (throws if attempted).

---

## 23. DSRRequest (PDPL Data Subject Request)

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `userId` | ObjectId → User | ✓ | — |
| `type` | Enum `export`, `erasure`, `rectification`, `consent_withdrawal` | ✓ | — |
| `status` | Enum `received`, `processing`, `completed`, `rejected` | ✓ | `received` |
| `requestedAt` | Date | ✓ | — |
| `completedAt` | Date | — | null |
| `exportUrl` | String | — | '' | signed S3 URL |
| `exportExpiresAt` | Date | — | null |
| `rejectionReason` | String | — | '' |
| `processedBy` | ObjectId → Admin | — | null |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ userId: 1, createdAt: -1 }`
- `{ status: 1, createdAt: 1 }`

---

## 24. FraudFlag

| الحقل | النوع | مطلوب | Default |
|---|---|---|---|
| `_id` | ObjectId | auto | — |
| `userId` | ObjectId → User | ✓ | — |
| `signal` | Enum `velocity`, `ip_collision`, `location_spoof`, `cancellation_spike`, `sybil_suspected`, `bid_ring_suspected` | ✓ | — |
| `severity` | Enum `low`, `medium`, `high` | ✓ | — |
| `details` | Mixed | — | {} |
| `resolvedAt` | Date | — | null |
| `resolvedBy` | ObjectId → Admin | — | null |
| `timestamps` | — | — | — | — |

الفهارس:
- `{ userId: 1, createdAt: -1 }`
- `{ signal: 1, severity: 1 }`
- `{ resolvedAt: 1 }` sparse

---

## 25. Enums (الثوابت)

### ServiceCategoryEnum
```
car_wash | appliance_repair | home_maintenance | cleaning | moving | pest_control
```

### OrderStatusEnum
```
pending | broadcasting | accepted | on_the_way | arrived |
in_progress | completed | cancelled | no_providers
```

### PaymentMethodEnum
```
wallet | card | apple_pay | tabby | cash
```

### NotificationTypeEnum
```
order_new | order_accepted | order_rejected | order_status_update
order_completed | order_cancelled | bid_new | bid_accepted | bid_rejected
payment_received | payment_failed | withdrawal_processed | withdrawal_rejected
account_approved | account_suspended | account_reactivated
referral_rewarded | promo | system | chat_message | masked_phone_ready
```

### TxKindEnum (Ledger)
```
order_payment_wallet | order_payment_card | order_payment_apple_pay | order_payment_tabby
order_settlement_cash | cash_commission_debt | wallet_topup | wallet_topup_refund
withdrawal_request | withdrawal_paid | withdrawal_rejected
refund | referral_bonus | coupon_application | reversal
```

---

## 26. ملخص الفهارس الجوهرية

| Collection | Index الأعلى أولوية |
|---|---|
| User | `{ phone: 1 }` unique + `{ role: 1, status: 1 }` |
| Provider | `{ approvalStatus: 1, isOnline: 1, specialty: 1, currentLocation: "2dsphere" }` |
| Order | `{ clientId: 1, createdAt: -1 }` + `{ location: "2dsphere" }` |
| Bid | `{ orderId: 1, price: 1 }` + `{ orderId: 1, providerId: 1 }` unique |
| Account | `{ ownerId: 1, type: 1 }` unique |
| LedgerTransaction | `{ idempotencyKey: 1 }` unique |
| Posting | `{ accountId: 1, createdAt: -1 }` |
| Otp | `{ expiresAt: 1 }` TTL + `{ phone: 1, createdAt: -1 }` |
| AuditLog | `{ targetType: 1, targetId: 1, createdAt: -1 }` |

---

## 27. قواعد عامة

- كل الأموال `Int32` بالهللة. التحويل في layer العرض فقط.
- كل الأوقات UTC في DB. التحويل لـ `Asia/Riyadh` في presentation.
- GeoJSON: `coordinates: [lng, lat]` دائماً (MongoDB 8 يتحقق).
- `_id` استخدم ObjectId إلا عند الحاجة لـ UUID v4 (idempotency keys).
- Hard delete ممنوع على: Order، LedgerTransaction، Posting، AuditLog. الباقي soft (`deletedAt`).
- Archiving policy: Orders + Reviews > 7 سنوات تُنقل لـ cold storage (S3 Glacier) عبر job شهري.
