# Backend vs Frontend Gap Analysis

## Summary

| Category | Backend Endpoints | Frontend Coverage | Status |
|----------|------------------|-------------------|--------|
| Auth | 6 endpoints | 5 implemented | 83% |
| Products | 12 endpoints | 11 implemented | 92% |
| Categories | 9 endpoints | 9 implemented | 100% |
| Users | 12 endpoints | 8 implemented | 67% |
| Orders | 14 endpoints | 10 implemented | 71% |
| Cart | 7 endpoints | 0 implemented | 0% ❌ |
| Coupons | 8 endpoints | 7 implemented | 88% |
| WhatsApp | 8 endpoints | 0 UI | 0% ❌ |
| Chatbot | 2 endpoints | 0 UI | 0% ❌ |
| Shiprocket | 4 endpoints | 0 UI | 0% ❌ |
| Analytics | 7 endpoints | 3 implemented | 43% |
| Settings | 5 endpoints | 2 implemented | 40% |
| Media | 5 endpoints | 3 implemented | 60% |

---

## CRITICAL MISSING FEATURES

### 1. Cart NOT Synced with Backend ❌
**Current State:** Cart uses only local Zustand store
**Backend Available:** Full cart API (`/cart/*` endpoints)
**Impact:**
- Cart doesn't persist across devices
- No server-side price/stock validation
- Abandoned cart tracking impossible

**Files to Update:**
- `/src/lib/cart-store.ts` - Add API sync
- `/src/app/(public)/cart/page.tsx` - Use API
- `/src/components/ecommerce/cart-item.tsx`
- `/src/components/ecommerce/cart-summary.tsx`

### 2. Coupon Application UI Missing ❌
**Current State:** No way for customers to apply coupons
**Backend Available:** `POST /coupons/validate`, cart coupon endpoints
**Impact:** Coupons created by admin cannot be used

**Files to Create/Update:**
- `/src/app/(public)/cart/page.tsx` - Add coupon input
- `/src/app/(public)/checkout/page.tsx` - Add coupon section

### 3. Shiprocket Integration UI Missing ❌
**Current State:** No shipping management in admin
**Backend Available:** Full Shiprocket API integration
**Impact:** Cannot create shipments, generate AWB, or track packages

**Files to Create:**
- Update `/src/app/admin/orders/[id]/page.tsx` - Add shipping actions

### 4. WhatsApp Management UI Missing ❌
**Current State:** API methods exist but no admin UI
**Backend Available:** Full WhatsApp messaging API
**Impact:** Cannot view conversations or send messages from admin

**Files to Create:**
- `/src/app/admin/whatsapp/page.tsx` - Conversation list
- `/src/app/admin/whatsapp/[phone]/page.tsx` - Conversation detail

---

## IMPORTANT MISSING FEATURES

### 5. Customer Profile Edit Missing
**Backend:** `PUT /users/me` - Update name, email
**Frontend:** Only address management exists

**Fix:** Add profile edit form to `/src/app/(public)/account/page.tsx`

### 6. Customer Order Cancellation Missing
**Backend:** `POST /orders/:id/cancel`
**Frontend:** No cancel button for customers

**Fix:** Add cancel button to `/src/app/(public)/account/orders/[id]/page.tsx`

### 7. Reorder Feature Missing
**Backend:** `POST /orders/reorder`
**Frontend:** No reorder button

**Fix:** Add reorder button to order history/detail pages

### 8. Admin Password Change Missing
**Backend:** `POST /auth/change-password`
**Frontend:** No UI for admin to change password

**Fix:** Add to `/src/app/admin/settings/page.tsx`

### 9. Product Analytics Missing
**Backend:** `GET /analytics/products` - Top sellers, low stock, popular
**Frontend:** No product analytics view

**Fix:** Add section to `/src/app/admin/analytics/page.tsx`

### 10. Chat Analytics Missing
**Backend:** `GET /analytics/chat` - Sessions, messages, conversions
**Frontend:** No chat analytics view

**Fix:** Add section to `/src/app/admin/analytics/page.tsx`

---

## MINOR MISSING FEATURES

### 11. Admin Create User
**Backend:** `POST /users`
**Frontend:** No UI to create users manually

### 12. Admin Delete User Button
**Backend:** `DELETE /users/:id`
**Frontend:** API exists, no button in UI

### 13. Order Priority Tags
**Backend:** `PUT /orders/:id/priority-tags`
**Frontend:** No UI to set priority tags

### 14. Historical Analytics Snapshots
**Backend:** `GET /analytics/snapshots`
**Frontend:** No historical data viewer

### 15. Product by SKU Lookup
**Backend:** `GET /products/sku/:sku`
**Frontend:** No SKU search feature

### 16. Low Stock Alerts Dashboard
**Backend:** `GET /products/low-stock`
**Frontend:** API used but no dedicated alert widget

### 17. Chatbot Session Viewer
**Backend:** `GET /chatbot/session/:phone`, `POST /chatbot/session/:phone/reset`
**Frontend:** No session management UI

---

## FULLY IMPLEMENTED FEATURES ✅

1. **Customer Authentication** - Email + OTP login/register
2. **Admin Authentication** - Email/password login/register
3. **Product Catalog** - Full CRUD with variants
4. **Category Management** - Hierarchical with images
5. **Order Management** - List, detail, status updates
6. **Customer Management** - List, block/unblock
7. **Coupon Management** - Full CRUD
8. **Address Management** - Customer addresses synced with backend
9. **Checkout Flow** - Order creation with API
10. **Image Uploads** - Cloudinary integration
11. **Basic Analytics** - Dashboard stats, revenue chart

---

## RECOMMENDED PRIORITY ORDER

### Phase 1 - Critical (Must Have)
1. ❌ Sync cart with backend API
2. ❌ Add coupon application UI to cart/checkout
3. ❌ Add Shiprocket shipping buttons to admin orders

### Phase 2 - Important
4. ❌ Add customer profile edit
5. ❌ Add customer order cancellation
6. ❌ Add reorder button
7. ❌ Add admin password change

### Phase 3 - Nice to Have
8. ❌ WhatsApp conversation viewer
9. ❌ Product analytics
10. ❌ Chat analytics
11. ❌ Historical snapshots
12. ❌ Chatbot session manager

---

## TECHNICAL NOTES

### Cart Sync Implementation Approach
```typescript
// Option 1: Hybrid - Local cart + sync on auth
// Keep local cart for guests, sync when logged in

// Option 2: Full Backend Cart
// Always use backend, require login for cart

// Recommended: Option 1 (better UX for guests)
```

### API Methods Already Available
All missing UI features have corresponding API methods in `/src/lib/api.ts`:
- Cart: getCart, addToCart, updateCartItem, removeFromCart, clearCart, applyCartCoupon
- Shipping: createShipment, trackShipment, getShippingRates
- WhatsApp: sendWhatsAppMessage, sendWhatsAppTemplate, getWhatsAppMessages
- Reorder: reorder(data)
- Profile: updateMyProfile(data)
