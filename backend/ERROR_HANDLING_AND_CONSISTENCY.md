# Error Handling & Consistency Analysis

This document summarizes **inconsistencies** that can cause runtime errors (like `Cast to ObjectId failed`), and the **fixes and patterns** applied to prevent them.

---

## 1. Root cause of the issue you hit

**Symptom:** `CastError: Cast to ObjectId failed for value "" (type string) at path "_id" for model "Category"`

**Cause:**  
- Some product(s) had `category: ""` (empty string) stored in the DB.  
- When the app ran `Product.find().populate('category')`, Mongoose collected all `category` values (including `""`) and ran `Category.find({ _id: { $in: [ ..., "" ] } })`.  
- Mongoose cannot cast `""` to ObjectId, so it threw.

**Lesson:** Any user or API input that is later used as an ObjectId (in queries, refs, or populate) must be validated **before** use. Empty string, invalid hex, or wrong length can all trigger CastError.

---

## 2. Shared utility: `@/common/utils/objectid.util.ts`

A single place for ID handling:

| Function | Use case |
|----------|----------|
| **`isValidObjectIdString(value)`** | Check if a value is a non-empty, 24-char hex string (valid ObjectId). Use before adding to filters or `$in` arrays. |
| **`parseObjectId(value, fieldName?)`** | Convert to `Types.ObjectId` or throw `BadRequestException`. Use for **required** IDs (path/query/body). |
| **`parseObjectIdOptional(value, fieldName?)`** | Same as above but returns `undefined` for empty/invalid. Use for **optional** IDs. |
| **`parseObjectIdArray(values, fieldName?)`** | Filter array to valid IDs and return `Types.ObjectId[]`. Use for arrays like `allowedUsers`, `allowedCategories` so `""` is never passed to `$in`. |

**Rule of thumb:**  
- **Required ID** (e.g. `:id`, `storeId`) → `parseObjectId(id, 'id')` at the start of the service method.  
- **Optional ID** (e.g. `?category=`) → `parseObjectIdOptional(category, 'category')` or `isValidObjectIdString(category)` then `parseObjectId`.  
- **Array of IDs** → `parseObjectIdArray(ids, 'allowedUsers')` so invalid/empty entries are skipped.

---

## 3. Global error handling: CastError → 400

**File:** `common/filters/http-exception.filter.ts`

- **Before:** Unhandled Mongoose `CastError` was treated as 500 and logged as “Unhandled exception”.  
- **After:** If the error is a Mongoose **CastError** (e.g. invalid ObjectId), the filter returns **400 Bad Request** with a message like:  
  `Invalid value for "path": "value" is not a valid ID.`

So even when a service forgets to validate, the API still returns 400 instead of 500, and the client gets a clear “invalid ID” message.

---

## 4. Where validation was added or tightened

### Products (`products.service.ts`)

- **create:** `category` validated with `parseObjectId(dto.category, 'category')`.  
- **findAll:**  
  - If `category` query is provided: only applied when `isValidObjectIdString(category)`; otherwise not used.  
  - If no category filter: `filter.category = { $type: 'objectId' }` so only products with a valid category ref are loaded (avoids passing `""` into `populate('category')`).  
- **findById, findBySlug, findBySku:** Only call `populate('category')` when `product.category` is a valid ObjectId string; otherwise leave category unpopulated (avoids CastError).  
- **findByCategory:** If `categoryId` is invalid, returns `[]` instead of querying.  
- **findFeatured:** Filter `category: { $type: 'objectId' }` so only valid refs are populated.  
- **update:** `dto.category` validated with `parseObjectId` when present.

### Categories (`categories.service.ts`)

- **create:** `parent` set only when valid: `parseObjectIdOptional(dto.parent, 'parent')` (empty string not converted).  
- **findAll:** `parent` query only used when `isValidObjectIdString(parent)`.  
- **findSubcategories:** If `parentId` is invalid, returns `[]`.  
- **update:** `id` and `dto.parent` validated with `parseObjectId` / `parseObjectIdOptional` before use.  
- **delete:** `id` validated with `parseObjectId(id, 'id')`.

### Store stock (`store-stock.service.ts`)

- **getStockByStore:** `storeId` and optional `category` validated; only valid ObjectIds used in match/lookup.  
- **getStockForProduct, getStockForStoreProduct:** `productId` (and `storeId` where used) validated with `parseObjectId`.  
- **setStock, decrementStock, incrementStock, bulkSetStock, getLowStockByStore, initializeStockForProduct:** All `storeId` / `productId` (and item IDs in bulk) validated with `parseObjectId` before use.

### Store sales (`store-sales.service.ts`)

- **create:** `dto.storeId` and each `item.productId` validated with `parseObjectId` before building the sale and deducting stock.

### Coupons (`coupons.service.ts`)

- **create:** `allowedUsers`, `allowedCategories`, `allowedProducts` passed through `parseObjectIdArray()` so empty or invalid IDs are dropped (no CastError in `$in`).  
- **update:** Same for the three arrays; `id` validated with `parseObjectId(id, 'id')`.  
- **delete:** `id` validated with `parseObjectId(id, 'id')`.

### Feedback (`feedback.service.ts`)

- **create:** `userId` required; `orderId` and `productId` optional → `parseObjectId(userId, 'userId')` and `parseObjectIdOptional(dto.orderId/productId)`.  
- **findAll:** `productId` filter only applied when `isValidObjectIdString(productId)`.  
- **getPublicReviews:** `productId` validated with `parseObjectId(productId, 'productId')`.

### Cart (`cart.service.ts`)

- **addItem:** `dto.productId` validated with `parseObjectId(dto.productId, 'productId')` before loading product and adding to cart.  
- **updateItemQuantity:** `productId` param validated with `parseObjectId(productId, 'productId')`.

---

## 5. Additional modules hardened (all remaining)

The following modules now use `parseObjectId` / `parseObjectIdOptional` / `isValidObjectIdString` / `parseObjectIdArray` for all ID inputs:

- **Orders:** `userId`, `items[].productId`, order `id` in create, findAll, findById, findUserOrders, updateStatus, updatePaymentStatus, cancelOrder, addNote, updateShipping, setPriorityTags, reorder.  
- **Users:** `id` / `userId` in findById, update, addAddress, updateAddress, removeAddress, blockUser, unblockUser, updateOrderStats, updateLastInteraction, delete.  
- **Admin:** `id` in findById, update, resetPassword, deactivate, delete.  
- **Payments:** `orderId`, `userId` in createOrder and initiateRefund.  
- **Audit:** `targetId` in log (optional) and findAll filter (optional).  
- **Analytics:** `storeId` in getStoreDashboardStats, getTopSellingByStore, getTopCustomersByStore.  
- **Stores:** `id` in findById, update; `storeId` in resetStorePassword.  
- **Feedback:** `id` in findById, respond, updateStatus; `userId` in findUserFeedback.  
- **Cart:** `productId` in addItem, updateItemQuantity, removeItem; `userId` in findOrCreateCart; `cartId` in markAbandonedReminderSent, markAsAbandoned.

Any remaining Mongoose CastErrors (e.g. from internal code paths) are still turned into **400** by the global CastError handler.

---

## 6. DTO / validation pipe

- **ValidationPipe** is enabled globally (`main.ts`) with `whitelist: true` and `forbidNonWhitelisted: true`.  
- Use **`@IsMongoId()`** in DTOs for ID fields where the value must be a valid MongoDB ObjectId string (e.g. feedback DTOs already use it for some fields).  
- Note: `@IsMongoId()` allows any 24-char hex string; it does not check that the referenced document exists. Existence checks remain in the service (e.g. `findById` then throw `NotFoundException`).

---

## 7. Checklist for new or updated code

1. **Path/query/body IDs**  
   - Required ID → `parseObjectId(value, 'fieldName')` at the start of the service method.  
   - Optional ID → `parseObjectIdOptional(value, 'fieldName')` or `isValidObjectIdString(value)` then `parseObjectId`.

2. **Arrays of IDs**  
   - Use `parseObjectIdArray(arr, 'fieldName')` so empty or invalid entries never reach `$in` or refs.

3. **Populate**  
   - If a ref can be missing or invalid in the DB, either:  
     - Filter documents so only valid refs are loaded (e.g. `category: { $type: 'objectId' }`), or  
     - Load the document first and only call `populate('ref')` when the ref field is a valid ObjectId string.

4. **Create/Update**  
   - For any field that is stored as ObjectId (category, parent, storeId, etc.), validate with `parseObjectId` / `parseObjectIdOptional` / `parseObjectIdArray` before assign or save.

5. **Errors**  
   - Rely on the global CastError filter for uncaught invalid IDs (400 + message).  
   - Use `BadRequestException` for business-rule validation (e.g. “Insufficient stock”) and `NotFoundException` when an ID is valid but the resource is missing.

---

## 8. Summary

- **Single shared utility** for ObjectId validation and parsing: `@/common/utils/objectid.util.ts`.  
- **Global CastError handling** in `http-exception.filter.ts`: invalid ObjectIds return 400 with a clear message.  
- **All modules** that accept IDs from params/query/body now use the shared util: products, categories, store-stock, store-sales, coupons, feedback, cart, orders, users, admin, payments, audit, analytics, stores. Invalid IDs are caught early and return a consistent “Invalid X: must be a 24-character hex string” message; any uncaught CastErrors still return 400 via the global filter.

Applying these patterns consistently will prevent “Cast to ObjectId failed” and similar issues and give clients predictable 400 responses for invalid IDs.

---

## 9. Repository pattern

Data access is centralized in **repositories** that extend `@/common/repository/base.repository.ts`. Services use repositories instead of injecting Mongoose models directly.

**Modules using repositories:** Products, Categories, Users, Orders, Cart, Coupons, Stores, Store-stock, Store-sales, Feedback (`FeedbackRepository`), Payments (`PaymentRepository`; uses `OrderRepository` from OrdersModule), Audit (`AuditLogRepository`), Admin (`AdminUserRepository`), Settings (`SettingsRepository`), Chatbot (`ChatSessionRepository`), WhatsApp (`MessageLogRepository`), Notifications (uses `MessageLogRepository` from WhatsAppModule), Analytics (`AnalyticsSnapshotRepository` + other repos via getModel for aggregates), Auth (uses `AdminUserRepository`, `UserRepository`, `StoreRepository`).

**Base repository** provides: `findById`, `findByIdString`, `findOne`, `find`, `countDocuments`, `create`, `updateOne`, `findByIdAndUpdate`, `deleteOne`, `aggregate`, and `getModel()`. Entity repositories add methods like `findOneBySlug`, `findAllPaginated`. New modules should add a repository and keep services free of direct model usage.
