# WASL API — دليل مطوّر الواجهة الأمامية (Flutter/Android/iOS/React Native)

هذا الدليل عملي. اقرأه من أوّله إلى آخره مرّة، ثم استخدمه كمرجع أثناء التطوير.

---

## 1. الإعدادات الأساسية

| العنصر | القيمة |
|---|---|
| Base URL (development) | `http://localhost:5000` |
| Base URL (staging) | `https://staging-api.wasl.sa` |
| Base URL (production) | `https://api.wasl.sa` |
| Content-Type | `application/json` (ما عدا ملفات الرفع) |
| Socket URL | نفس Base URL (HTTP بدون `/api`) |
| زمن كل طلب (افتراضي) | 30 ثانية |

**Headers قياسية يجب تمريرها:**

| Header | متى |
|---|---|
| `Authorization: Bearer <accessToken>` | كل endpoint محمي |
| `Accept-Language: ar` أو `en` | اختياري لتحديد لغة الإشعارات والبانرات |
| `Idempotency-Key: <uuid-v4>` | **إلزامي** على الـ endpoints المالية (سأذكرها) |
| `X-Request-Id: <uuid>` | اختياري، يظهر في logs السيرفر للتتبع |
| `X-Device-Fingerprint: <hash>` | اختياري، لكن موصى به لمقدمي الخدمة عند تقديم عرض سعر |

---

## 2. شكل Response الموحّد

**نجاح:**
```json
{
  "success": true,
  "message": "success",
  "data": { ... },
  "meta": { "pagination": { "page": 1, "limit": 20, "total": 234, "pages": 12, "hasNext": true, "hasPrev": false } }
}
```

**فشل:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The 'phone' field is required",
    "details": [{ "field": "phone", "message": "Invalid value" }]
  }
}
```

**رموز الأخطاء الموحّدة:**

| الرمز | HTTP | متى |
|---|---|---|
| `VALIDATION_FAILED` | 422 | فشل التحقق من البيانات |
| `UNAUTHORIZED` | 401 | لا يوجد token أو منتهي |
| `FORBIDDEN` | 403 | لا صلاحية أو الحساب موقوف |
| `NOT_FOUND` | 404 | المورد غير موجود |
| `CONFLICT` | 409 | صراع حالة (حجز مكرر، كوبون مستخدم) |
| `IDEMPOTENCY_KEY_MISSING` | 400 | نسيت إرسال المفتاح |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | أعدت نفس المفتاح ببيانات مختلفة |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | نفس الطلب قيد المعالجة |
| `PAYMENT_DECLINED` | 402 | البنك رفض الدفع |
| `INSUFFICIENT_BALANCE` | 400 | الرصيد لا يكفي |
| `RATE_LIMITED` | 429 | تجاوزت الحد |
| `SERVICE_UNAVAILABLE` | 503 | خارج ساعات العمل أو maintenance |
| `DUPLICATE_KEY` | 409 | بريد/جوال مسجّل |

**تعامل مع الأخطاء (Flutter/Dart مثال):**
```dart
final res = await http.post(uri, body: body, headers: headers);
final json = jsonDecode(res.body);
if (json['success'] == false) {
  final code = json['error']['code'];
  final msg  = json['error']['message'];
  if (code == 'UNAUTHORIZED') { /* انتقل لشاشة الدخول */ }
  else if (code == 'RATE_LIMITED') { /* اعرض للمستخدم انتظر */ }
  else { /* اعرض msg */ }
}
```

---

## 3. المال: كل المبالغ بالهللة (halalas)

كل المبالغ في الـ API **integer بالهللة** (1 ريال = 100 هللة).

- عرض للعميل: اقسم على 100 وأظهر `.toFixed(2) + " ريال"`.
- إدخال من العميل: اضرب × 100 قبل الإرسال.

أمثلة: `amount: 2500` = 25.00 ريال. `totalPrice: 15000` = 150.00 ريال.

---

## 4. Idempotency Key — متى وكيف

**الغرض:** يمنع الدفع المزدوج عند إعادة الإرسال بسبب ضعف شبكة.

**الاستخدام:** ولّد UUID v4 جديد لكل عملية جديدة واحتفظ به داخل شاشة الدفع. إذا فشلت الشبكة وأعدت الإرسال، **أرسل نفس المفتاح نفس البيانات**. الخادم سيعيد نفس response بدون إعادة تنفيذ.

```dart
import 'package:uuid/uuid.dart';
final key = const Uuid().v4();

await http.post(
  Uri.parse('$base/api/orders'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type':  'application/json',
    'Idempotency-Key': key,
  },
  body: jsonEncode(orderPayload),
);
```

**Endpoints تتطلب `Idempotency-Key` (إلزامي):**

- `POST /api/orders`
- `POST /api/bids`
- `PATCH /api/bids/:id/accept`
- `POST /api/payments/wallet/pay`
- `POST /api/payments/wallet/topup`
- `POST /api/payments/wallet/withdraw`
- `POST /api/payments/checkout/card`
- `POST /api/payments/checkout/tabby`

---

## 5. Auth Flow (OTP → JWT)

### الشاشة الأولى: إدخال الجوال → استقبال OTP

**`POST /api/auth/send-otp`**
```json
Request:  { "phone": "+966501234567" }
Response: { "success": true, "data": { "sent": true, "expiresInSeconds": 300 } }
```

**ملاحظة:** في development mode فقط يرجع الحقل `devCode` مع OTP، استعمله للاختبار.

**صيغ الأرقام المقبولة:** `+966501234567`, `966501234567`, `00966501234567`, `0501234567`, `501234567`. الخادم يطبّعها كلها إلى `+9665XXXXXXXX`.

### الشاشة الثانية: إدخال OTP → JWT

**`POST /api/auth/verify-otp`**
```json
Request:
{
  "phone": "+966501234567",
  "code": "123456",
  "deviceToken": "fcm-token-here",
  "devicePlatform": "ios"
}

Response:
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "isNew": true,
    "user": {
      "_id": "...",
      "phone": "+966501234567",
      "role": "client",
      "status": "pending_profile",
      "language": "ar",
      "referralCode": "ARF3XD6I"
    }
  }
}
```

- `isNew: true` = مستخدم جديد، انتقل لشاشة إكمال الملف.
- `isNew: false` = مستخدم قديم، ادخل مباشرة.
- `status: "pending_profile"` = يجب إكمال البيانات قبل استخدام التطبيق.

### الشاشة الثالثة (للمستخدمين الجدد): إكمال الملف

**`PUT /api/auth/register`** (محمي بـ accessToken)
```json
Request:
{
  "name": "محمد أحمد",
  "email": "user@example.com",
  "role": "client",
  "language": "ar",
  "referralCode": "ARF3XD6I",
  "consentPdpl": true,
  "consentMarketing": true
}

Response:
{
  "success": true,
  "data": {
    "user": { "_id": "...", "name": "...", "status": "active", ... }
  }
}
```

- `consentPdpl: true` **إلزامي** — موافقة المستخدم على سياسة الخصوصية.
- لو اختار `role: "provider"` → الحساب يدخل حالة `awaiting_approval`، ويُكمل بيانات المقدم في شاشة لاحقة.

### تجديد الـ token

**`POST /api/auth/refresh-token`**
```json
Request:  { "refreshToken": "..." }
Response: { "data": { "accessToken": "...", "refreshToken": "..." } }
```

**مهم:** كل refresh يُرجع refresh token جديد. **ارمِ القديم واحفظ الجديد**.

### Logout

**`POST /api/auth/logout`** (محمي)
```json
Request:  { "deviceToken": "fcm-token-to-remove" }
Response: { "success": true }
```

---

## 6. حفظ الـ Tokens في العميل

- **iOS:** Keychain (مكتبة `flutter_secure_storage` مثلاً).
- **Android:** EncryptedSharedPreferences (`flutter_secure_storage`).
- **لا تخزن في** `SharedPreferences` عادية ولا في الملفات.

**عمر الـ tokens:**
- accessToken: 15 دقيقة.
- refreshToken: 30 يوم.

**نمط تلقائي للتجديد (Dio interceptor):**
```dart
onError: (err, handler) async {
  if (err.response?.statusCode == 401) {
    final newTokens = await refreshToken();
    err.requestOptions.headers['Authorization'] = 'Bearer ${newTokens.accessToken}';
    final clone = await dio.fetch(err.requestOptions);
    return handler.resolve(clone);
  }
  return handler.next(err);
}
```

---

## 7. Endpoints مقسّمة حسب الشاشة

### 7.1 الصفحة الرئيسية (client)

| Endpoint | Auth | وصف |
|---|---|---|
| `GET /api/catalog/banners` | لا | بانرات الصفحة الرئيسية |
| `GET /api/catalog/categories` | لا | شجرة الخدمات + فروعها |
| `GET /api/catalog/car-wash-prices` | لا | جدول أسعار غسيل السيارات |
| `GET /api/catalog/config/public` | لا | ساعات العمل + وضع الصيانة |
| `GET /api/users/me` | ✓ | بيانات المستخدم + رصيد المحفظة |
| `GET /api/orders/my?status=active` | ✓ | الطلبات النشطة |

### 7.2 الملف الشخصي + العناوين

| Endpoint | Auth | Body |
|---|---|---|
| `GET /api/users/me` | ✓ | — |
| `PUT /api/users/me` | ✓ | `{ name, email, language }` |
| `PUT /api/users/me/avatar` | ✓ | multipart `avatar` (jpg/png/webp، 5MB) |
| `POST /api/users/me/addresses` | ✓ | `{ label, details, lat, lng, isDefault }` |
| `PUT /api/users/me/addresses/:id` | ✓ | same |
| `DELETE /api/users/me/addresses/:id` | ✓ | — |
| `PUT /api/users/me/device-token` | ✓ | `{ deviceToken, platform: 'ios'|'android' }` |

### 7.3 تسجيل مقدم الخدمة

| Endpoint | Auth | Body |
|---|---|---|
| `POST /api/providers/register` | ✓ | `{ specialty:[..], vehicle:{..}, bankInfo:{iban,bankName,accountName}, serviceRadius, subCategories:[..] }` |
| `POST /api/providers/documents` | ✓ | multipart `document` + `docType` + `side`(اختياري) |
| `GET /api/providers/profile` | ✓ provider | — |
| `PUT /api/providers/profile` | ✓ provider | نفس register |
| `PATCH /api/providers/status` | ✓ provider | `{ isOnline: bool }` |
| `PATCH /api/providers/location` | ✓ provider | `{ lat, lng }` |
| `GET /api/providers/:id/reviews` | لا | — |
| `GET /api/providers/:id` | لا | ملف عام |

**docType المقبولة:**
- `nationalId` مع `side: "front"` ثم `"back"`
- `residencePermit` مع `side: "front"` ثم `"back"`
- `drivingLicense` (بدون side)
- `profilePhoto`
- `professionCard`

### 7.4 إنشاء طلب (client)

**`POST /api/orders`** (يحتاج Idempotency-Key)

```json
Request (غسيل سيارة — سعر ثابت):
{
  "serviceCategory": "car_wash",
  "items": [
    {
      "serviceCategory": "car_wash",
      "vehicleSize": "medium",
      "washType": "exterior_plus_interior_wax",
      "details": { "make": "Toyota", "model": "Camry" }
    }
  ],
  "lat": 24.7136,
  "lng": 46.6753,
  "address": "الرياض، حي العليا",
  "paymentMethod": "wallet",
  "notes": ""
}

Request (صيانة — bid):
{
  "serviceCategory": "home_maintenance",
  "items": [
    {
      "serviceCategory": "home_maintenance",
      "subCategoryId": "...",
      "details": { "problem": "تسريب في المغسلة" }
    }
  ],
  "lat": 24.7136,
  "lng": 46.6753,
  "address": "حي الورود",
  "paymentMethod": "cash"
}

Response:
{
  "success": true,
  "data": {
    "order": {
      "_id": "...",
      "orderNumber": "WSL-ABCD-XYZ",
      "status": "pending",
      "pricingType": "fixed",
      "totalPrice": 6000,
      "commission": { "rate": 0.1, "amount": 600 },
      ...
    }
  }
}
```

**قيم serviceCategory:** `car_wash`, `appliance_repair`, `home_maintenance`, `cleaning`, `moving`, `pest_control`.

**قيم paymentMethod:** `wallet`, `card`, `apple_pay`, `tabby`, `cash`.

**قيم vehicleSize:** `small`, `medium`, `large`.

**قيم washType:** `exterior_basic`, `exterior_wax`, `exterior_wax_double`, `exterior_plus_interior_basic`, `exterior_plus_interior_wax`, `exterior_plus_interior_double`, `interior_only`.

### 7.5 متابعة الطلب

| Endpoint | Auth | وصف |
|---|---|---|
| `GET /api/orders/my?status=&page=&limit=` | ✓ client | طلباتي |
| `GET /api/orders/provider/my` | ✓ provider | طلبات المقدم |
| `GET /api/orders/:id` | ✓ | تفاصيل الطلب |
| `GET /api/orders/:id/timeline` | ✓ | سجل التحديثات |
| `GET /api/orders/:id/providers` | ✓ client | المزوّدين القريبين |
| `PATCH /api/orders/:id/cancel` | ✓ client | لا يمكن بعد الموافقة |

### 7.6 تدفق قبول/رفض الطلب (provider)

| Endpoint | وصف |
|---|---|
| `PATCH /api/orders/:id/accept` | قبول (عند fixed فقط، للـ bid استخدم `POST /api/bids`) |
| `PATCH /api/orders/:id/reject` | رفض |
| `PATCH /api/orders/:id/price` | إدخال السعر بعد الموافقة (body: `{ price: halalas }`) |
| `PATCH /api/orders/:id/status` | تحديث الحالة (body: `{ status, note }`) |
| `POST /api/orders/:id/photos` | رفع صور قبل/بعد (multipart + `phase: before|after`) |
| `PATCH /api/orders/:id/confirm-cash` | إقرار استلام النقد بعد الإنجاز |

**الحالات الصالحة للـ provider:** `on_the_way`, `arrived`, `in_progress`, `completed`.

**قاعدة حرجة:** صور قبل + بعد **إلزامية** قبل `status: completed` — الخادم يرفض التحديث بدونها.

### 7.7 المزايدة (Bidding)

| Endpoint | Auth | وصف |
|---|---|---|
| `POST /api/bids` | ✓ provider | تقديم عرض (يحتاج Idempotency-Key) |
| `GET /api/bids/order/:orderId` | ✓ client | قائمة العروض مرتبة بالسعر |
| `PATCH /api/bids/:id/accept` | ✓ client | قبول عرض (يحتاج Idempotency-Key) |
| `PATCH /api/bids/:id/reject` | ✓ client | رفض عرض |

**عينة تقديم عرض:**
```json
POST /api/bids
Headers: Idempotency-Key: <uuid>, X-Device-Fingerprint: <hash>
Body:
{
  "orderId": "...",
  "price": 8000,
  "arrivalTime": 30,
  "note": "أصل خلال نصف ساعة"
}
```

### 7.8 الدفع

| Endpoint | Auth | Body | ملاحظات |
|---|---|---|---|
| `POST /api/payments/coupon/validate` | ✓ | `{ code, orderValue }` | تحقق من كوبون |
| `POST /api/payments/wallet/pay` | ✓ client | `{ orderId }` | دفع بالمحفظة (ID-Key) |
| `POST /api/payments/wallet/topup` | ✓ client | `{ amount: halalas }` | ترجع `checkoutUrl` لـ Moyasar |
| `POST /api/payments/wallet/withdraw` | ✓ provider | `{ amount, otpCode }` | يتطلب OTP منفصل |
| `POST /api/payments/checkout/card` | ✓ client | `{ orderId, paymentMethod: 'card'|'apple_pay' }` | ترجع `checkoutUrl` |
| `POST /api/payments/checkout/tabby` | ✓ client | `{ orderId, returnUrl, cancelUrl }` | ترجع `checkoutUrl` |
| `GET /api/payments/wallet/balance` | ✓ | — | يرجع `{ balance, commissionDebt?, currency }` |
| `GET /api/payments/wallet/transactions` | ✓ | — | قائمة ledger |

**نمط Checkout Moyasar/Tabby:**
1. استدعِ endpoint المناسب → تحصل على `checkoutUrl`.
2. افتح الـ URL في WebView (أو Custom Tab/Safari) مع `returnUrl`/`cancelUrl`.
3. عند العودة إلى `returnUrl`، الخادم سيكون استلم webhook وحدّث الطلب.
4. أعد تحميل الطلب (`GET /api/orders/:id`) للتحقق من `paymentStatus`.

**طلب withdrawal للمزوّد (2 خطوات):**
```
1. POST /api/auth/send-otp  body={phone}                    → OTP للجوال
2. POST /api/payments/wallet/withdraw
   headers: Idempotency-Key
   body: { amount: 50000, otpCode: "123456" }
```

### 7.9 المحادثة (Chat)

| Endpoint | Auth | وصف |
|---|---|---|
| `GET /api/chats/conversations` | ✓ | قائمة محادثاتي |
| `GET /api/chats/order/:orderId` | ✓ | افتح/أنشئ شات الطلب |
| `GET /api/chats/:chatId/messages?page=&limit=` | ✓ | الرسائل (newest first) |
| `POST /api/chats/:chatId/messages` | ✓ | `{ type: 'text'|'location', content, location:{lat,lng} }` |
| `POST /api/chats/:chatId/media` | ✓ | multipart `media` للصور |

**الأفضل:** استخدم Socket.IO للرسائل اللحظية (أقل latency)، واحفظها عبر REST في حال عدم توفر الـ socket.

### 7.10 التقييمات

| Endpoint | Auth | Body |
|---|---|---|
| `POST /api/reviews` | ✓ | `{ orderId, rating: 1-5, comment }` — بعد `status: completed` فقط |
| `GET /api/reviews/user/:userId` | ✓ | التقييمات العامة (client_to_provider فقط) |

### 7.11 الإشعارات

| Endpoint | Auth | وصف |
|---|---|---|
| `GET /api/notifications?page=&limit=` | ✓ | قائمة الإشعارات |
| `GET /api/notifications/unread-count` | ✓ | عدد غير المقروء |
| `PATCH /api/notifications/:id/read` | ✓ | علّم كمقروء |
| `PATCH /api/notifications/read-all` | ✓ | علّم الكل مقروء |

### 7.12 الإحالة

| Endpoint | Auth | وصف |
|---|---|---|
| `GET /api/referral/my-code` | ✓ | كودي + إحصائياتي |
| `GET /api/referral/my-list` | ✓ | من أحلت |
| `POST /api/referral/redeem` | ✓ | `{ code }` — استخدام كود |

### 7.13 الرقم الوسيط

**`POST /api/masked-phone/session`**
```json
Request: { "orderId": "..." }
Response: {
  "maskedNumber": "+966801234567",
  "expiresAt": "...",
  "sessionId": "..."
}
```

افتح الرقم عبر `tel:` URL. الطرفان يتصلان عبر نفس الرقم الوسيط، والنظام يوجّه المكالمة تلقائياً.

### 7.14 PDPL (حقوق المستخدم)

| Endpoint | Auth | وصف |
|---|---|---|
| `POST /api/dsr/export` | ✓ | طلب تصدير بياناتي |
| `POST /api/dsr/erasure` | ✓ | حذف حسابي (يتطلب OTP منفصل) |
| `POST /api/dsr/erasure/cancel` | ✓ | إلغاء خلال 30 يوم |
| `PATCH /api/dsr/consent` | ✓ | تحديث الموافقات التسويقية |
| `GET /api/dsr/my` | ✓ | قائمة طلباتي |

---

## 8. Socket.IO — الأحداث اللحظية

### الاتصال

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

final socket = IO.io('http://localhost:5000', <String, dynamic>{
  'transports': ['websocket'],
  'auth': { 'token': 'Bearer $accessToken' },
  'reconnection': true,
  'reconnectionDelay': 2000,
});

socket.onConnect((_) => print('connected'));
socket.onDisconnect((_) => print('disconnected'));
```

**Auth:** أرسل `token` في handshake auth كما فوق.

### Rooms (join/leave)

```dart
socket.emit('join:order', orderId);      // للاشتراك في تحديثات طلب
socket.emit('leave:order', orderId);
socket.emit('join:chat', chatId);        // للاشتراك في شات
```

### أحداث صادرة من الخادم (استمع إليها)

| Event | الوصول | Payload |
|---|---|---|
| `order:new_request` | provider | طلب جديد قادم `{ orderId, orderNumber, serviceCategory, location, distance, timeoutSeconds }` |
| `order:accepted` | client + order room | `{ orderId, providerId, provider:{name,phone,avatar,rating} }` |
| `order:status_update` | order room | `{ orderId, status }` |
| `order:price_set` | client | `{ orderId, agreedPrice, totalPrice }` |
| `order:no_providers` | client | `{ orderId }` (لم يُقبل أحد) |
| `bid:new` | client | `{ orderId, bid:{price, note, provider} }` |
| `bid:accepted` | provider | `{ orderId, bidId, agreedPrice }` |
| `bid:rejected` | provider | `{ orderId }` |
| `provider:location_update` | order room | `{ orderId, lat, lng, providerId }` — تتبّع live |
| `chat:new_message` | chat room | `{ message: {..full..} }` |
| `chat:typing` | chat room | `{ userId, name }` |
| `chat:stop_typing` | chat room | `{ userId }` |

### أحداث ترسلها للخادم

```dart
socket.emit('provider:update_location', { 'lat': 24.71, 'lng': 46.67, 'orderId': '...' });
socket.emit('provider:set_online', { 'isOnline': true });
socket.emit('chat:send_message', { 'chatId': '...', 'type': 'text', 'content': 'مرحبا' });
socket.emit('chat:typing', { 'chatId': '...' });
socket.emit('chat:stop_typing', { 'chatId': '...' });
socket.emit('ping');  // صدى heartbeat، يرجع 'pong'
```

---

## 9. التدفقات الكاملة — مثال رحلة الطلب

### غسيل سيارة (fixed) من client

```
[1] GET /api/catalog/car-wash-prices
      → اعرض للمستخدم الخيارات
[2] POST /api/orders (Idempotency-Key)
      body: { serviceCategory: 'car_wash', items: [{vehicleSize, washType}], lat, lng, paymentMethod: 'wallet' }
      → order.status = 'pending', broadcasting يبدأ تلقائياً
[3] انضم لـ socket room: socket.emit('join:order', order._id)
[4] استمع على:
      - order:accepted → اعرض بيانات المقدم
      - order:no_providers → اعتذار
[5] بعد الإنجاز (provider يحدّث status=completed):
      POST /api/payments/wallet/pay body={orderId} (Idempotency-Key)
[6] POST /api/reviews body={orderId, rating, comment}
```

### صيانة (bid) من client

```
[1] POST /api/orders (Idempotency-Key)
      body: { serviceCategory: 'home_maintenance', items:[...], lat, lng, paymentMethod: 'cash' }
      → status = 'broadcasting'، بعدة مقدمين يتلقون notification
[2] استمع على bid:new → يظهر للعميل قائمة عروض
[3] PATCH /api/bids/:id/accept (Idempotency-Key)
      → status = 'accepted'، باقي bids ترفض تلقائياً
[4] استمع على order:status_update خلال التنفيذ
[5] بعد completed + provider يستلم كاش:
      provider يستدعي PATCH /api/orders/:id/confirm-cash
```

### Provider يتلقى طلباً (fixed)

```
[1] socket connect مع token
[2] استمع على 'order:new_request'
    {orderId, serviceCategory, location, timeoutSeconds: 60}
[3] إذا قبل: PATCH /api/orders/:id/accept
    إذا رفض أو انتهى المهل: الخادم يرسلها لمزوّد آخر
[4] بعد القبول: PATCH /api/orders/:id/status body={status: 'on_the_way'}
[5] عند الوصول: body={status: 'arrived'}
[6] رفع صور قبل: POST /api/orders/:id/photos multipart phase=before
[7] بدء العمل: body={status: 'in_progress'}
[8] رفع صور بعد: POST /api/orders/:id/photos multipart phase=after
[9] إكمال: body={status: 'completed'}
[10] إذا الدفع كاش: PATCH /api/orders/:id/confirm-cash
```

---

## 10. رفع الصور (Multipart)

**3 endpoints تستخدم multipart:**
- `PUT /api/users/me/avatar` — field: `avatar`
- `POST /api/providers/documents` — field: `document` + `docType` + `side?`
- `POST /api/orders/:id/photos` — field: `photos` (array حتى 10) + `phase: before|after`
- `POST /api/chats/:chatId/media` — field: `media`

**قيود:**
- الحد الأقصى: 5MB لكل صورة.
- الصيغ: jpg, jpeg, png, webp.
- يُحفظ على Cloudinary ويُرجع URL.

**مثال Flutter:**
```dart
final dio = Dio();
final formData = FormData.fromMap({
  'avatar': await MultipartFile.fromFile(path, filename: 'me.jpg'),
});
await dio.put('$base/api/users/me/avatar', data: formData,
  options: Options(headers: { 'Authorization': 'Bearer $token' }));
```

---

## 11. Rate Limits (حدود مهمة للـ UX)

| Endpoint | الحد |
|---|---|
| `send-otp` | 3 محاولات / 5 دقائق لنفس الرقم |
| `verify-otp` | 5 / 5 دقائق |
| admin login | 5 / 5 دقائق |
| `orders` create | 5 / دقيقة لكل مستخدم |
| `bids` | 30 / دقيقة لكل مزوّد (مع anti-fraud velocity check) |
| `payments/*` write | 20 / دقيقة |
| `chats/.../messages` | 60 / دقيقة |
| `providers/location` | 1 / 5 ثوان |

**التعامل:** عند استقبال `429 RATE_LIMITED`، اعرض رسالة واضحة واستخدم backoff قبل إعادة المحاولة.

---

## 12. بيئة التطوير — stubs للتكاملات

جميع التكاملات الخارجية (Moyasar, Tabby, Unifonic, Authentica) تعمل في **stub mode** في development، أي بدون اتصال فعلي بأي مزوّد.

### OTP في dev

`POST /api/auth/send-otp` يرجع في response الحقل `devCode` (6 أرقام). **لا يوجد SMS فعلي**. استخدم الرقم للتحقق مباشرة.

### Payment checkout stub

عند استدعاء `/api/payments/wallet/topup` أو `/api/payments/checkout/card` أو `/api/payments/checkout/tabby`:
- الـ response يحتوي `stub: true` و `checkoutUrl` يشير لـ stub (وهمي).
- لمحاكاة webhook ناجح/فاشل يدوياً (اختبار):

**`POST /api/payments/stub/simulate`** (dev only، بدون auth)
```json
Request:
{
  "sessionId": "moyasar-stub-xxx",
  "provider": "moyasar",
  "success": true,
  "amount": 5000,
  "metadata": { "userId": "...", "kind": "wallet_topup" }
}
Response: { "received": true }
```

بهذا الـ endpoint يمكنك محاكاة اكتمال الدفع وتحديث الطلب بالضبط كما لو جاء webhook من البوابة الحقيقية.

### Masked phone stub

`POST /api/masked-phone/session` يرجع رقماً وهمياً (مولّد عشوائياً يبدأ بـ `+9668`). لا اتصال فعلي — استخدمه لاختبار UI فقط.

---

## 13. تفاصيل حيوية لا تغفلها

1. **phone في كل مكان E.164**: `+9665XXXXXXXX`.
2. **المبالغ بالهللة**: 1 ريال = 100 هللة.
3. **Idempotency-Key**: UUID v4 جديد لكل عملية مالية.
4. **refreshToken rotation**: كل تجديد يُرجع جديداً، احفظه واستبدل القديم.
5. **لا تتصل بـ FCM مباشرة**: فقط أرسل `deviceToken` للخادم عبر `PUT /api/users/me/device-token`.
6. **Push notifications بصيغتي ar + en**: الخادم يختار حسب `user.language`. ضع منطق اختيار اللغة في الإعدادات.
7. **working hours**: إذا حاولت إنشاء طلب خارج 6ص–11م تحصل على `503 SERVICE_UNAVAILABLE`. اعرض رسالة لطيفة.
8. **cancellation policy**: لا يمكن للعميل الإلغاء بعد قبول المزوّد — أظهر ذلك في UI قبل القبول.
9. **timeout broadcasting**: دقيقة واحدة للمزوّد الأول ثم ينتقل تلقائياً. العميل يرى فقط `order:accepted` أو `order:no_providers`.
10. **صور قبل + بعد إلزامية**: امنع زر "إنهاء" حتى يرفع المزوّد الصورتين.

---

## 14. بوستمان / Insomnia

**Postman collection** سيُصدَّر تلقائياً من OpenAPI spec لاحقاً. حالياً كل endpoints موثّقة في `docs/API_SPEC.md`.

**أسهل طريقة للبدء:**
1. شغّل backend محلياً: `npm run seed && npm run dev`
2. افتح Postman → New Collection
3. استورد هذه الـ 3 requests للبداية:
   - `POST {{base}}/api/auth/send-otp` body `{"phone":"+966501234567"}`
   - `POST {{base}}/api/auth/verify-otp` body `{"phone":"...","code":"..."}`
   - `GET {{base}}/api/users/me` header `Authorization: Bearer {{token}}`
4. احفظ `{{token}}` في env variable من response الـ verify-otp.

---

## 15. أسئلة شائعة

**س: كيف أميز بين client و provider في UI؟**
ج: من `user.role` في response الـ verify-otp.

**س: العميل ينتقل من client إلى provider كيف؟**
ج: استدع `PUT /api/auth/register` مع `role: "provider"` ثم `POST /api/providers/register`. الحالة تصبح `awaiting_approval` حتى يوافق الإدمن.

**س: هل يمكن للعميل رفض مقدم لكن لا يلغي الطلب؟**
ج: نعم قبل القبول. بعد `order.status: accepted` يتحول لعقد ملزم (Q#23).

**س: كيف أعرف أن webhook الدفع تم؟**
ج: انتظر socket event `payment:captured` على `user:<clientId>` room، أو `poll` على `GET /api/orders/:id` بعد عودة المستخدم من الـ checkout page.

**س: ماذا لو انقطع socket؟**
ج: REST endpoints بديلة لكل حدث (`GET /api/orders/:id`, `/api/notifications`). Socket تحسين وليس إلزامي لعمل التطبيق.

---

## 16. دعم

**إن واجه المطوّر مشكلة:**
- تحقق من حقل `error.code` و `error.message` في response.
- راجع `X-Request-Id` من headers response وابعثه للـ backend team لتتبع الطلب في logs.
- في dev mode، logs الخادم تطبع كل request بـ pino.

**للاستفسارات المعمارية:** `docs/ARCHITECTURE.md`.
**لنموذج البيانات الكامل:** `docs/DATA_MODEL.md`.
**لمواصفات endpoints الرسمية:** `docs/API_SPEC.md`.
