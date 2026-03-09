# SKU System – How It Works & What It’s Connected To

## 1. Two levels of SKU

| Level | Where it lives | Uniqueness | Purpose |
|-------|----------------|------------|--------|
| **Product SKU** | `Product.sku` | **Unique across all products** (DB unique + service check) | Identifies the product (e.g. base item). |
| **Variant SKU** | `Product.variants[].sku` | **Only meaningful within one product** (no global uniqueness) | Identifies a variant (e.g. size/color) of that product. |

---

## 2. Where product SKU is stored and used

### Backend

- **Schema:** `backend/src/modules/products/schemas/product.schema.ts`  
  - `Product.sku` – required, unique.  
  - `ProductVariant.sku` – required per variant (no unique constraint).
- **DTOs:** `backend/src/modules/products/dto/product.dto.ts`  
  - `CreateProductDto.sku`, `UpdateProductDto.sku` (optional on update), `ProductVariantDto.sku`.
- **Repository:** `backend/src/modules/products/repositories/product.repository.ts`  
  - `findOneBySku(sku)`, `findOneBySkuWithCategory(sku)`, `findOneBySkuExcludingId(sku, excludeId)` for product-level SKU.  
  - Search uses SKU via `buildSearchOrFilter(search, [..., 'sku'])`.  
  - `decrementVariantStock(productId, variantSku, quantity)` matches `variants.sku`.
- **Service:** `backend/src/modules/products/products.service.ts`  
  - **Create:** checks product SKU uniqueness with `findOneBySku(dto.sku)` → `BadRequestException` if exists.  
  - **Update:** if `dto.sku` is set, checks with `findOneBySkuExcludingId(dto.sku, id)` → same error if taken.  
  - **Lookup:** `findBySku(sku)` returns product by product SKU.
- **Controller:** `GET /products/sku/:sku` → `productsService.findBySku(sku)`.

### Frontend

- **Types:** `frontend/src/types/index.ts` – product and variant types include `sku`.
- **Admin product form:**  
  - `frontend/src/app/admin/products/new/page.tsx`  
  - `frontend/src/app/admin/products/[id]/page.tsx`  
  - Product SKU and each variant SKU in form state; submit sends them to API.
- **Validation:** `frontend/src/lib/validation.ts` – `validateProduct()`: SKU required and format `^[A-Za-z0-9-_]+$`.
- **Display:** Admin product list and store-stock search show product SKU; product detail uses variant SKU for selection.

---

## 3. Where variant SKU is used (product.variants[].sku)

Variant SKU is the key used everywhere to say “this line item is this variant of this product.”

### Backend

- **Cart:** `backend/src/modules/cart/schemas/cart.schema.ts` – item has `variantSku?`.  
  - `cart.service.ts`: add/update/remove by `productId` + `variantSku`; validates variant exists via `product.variants.find(v => v.sku === dto.variantSku)`.
- **Orders:** `backend/src/modules/orders/schemas/order.schema.ts` – order item has `variantSku?`.  
  - `orders.service.ts`: builds order lines with `variantSku` / `variantName` from `product.variants.find(v => v.sku === item.variantSku)`; stock decrement uses variant when present.
- **Store sales:** `backend/src/modules/store-sales/schemas/store-sale.schema.ts` – sale item has `variantSku?`.  
  - `store-sales.service.ts`: resolves variant by `product.variants.find(v => v.sku === item.variantSku)`; reads/writes store stock by `variantSku`.
- **Store stock:** `backend/src/modules/store-stock/schemas/store-stock.schema.ts` – `VariantStock.variantSku`.  
  - Store stock service/repository: get/set stock per store × product × `variantSku` (and base product stock when no variant).
- **Products:** `products.service.ts` – `updateStock(id, { variantSku, stock })` and `decrementStock(productId, quantity, variantSku)` use variant SKU to find the variant.

### Frontend

- **Cart / checkout:** Cart items and order payloads use `variantSku` (e.g. `cart-store.ts`, `cart-item.tsx`, checkout page, API `addToCart(productId, quantity, variantSku)` etc.).
- **PDP / quick view:** Selected variant is stored as `variant.sku`; add-to-cart sends `variantSku: selectedVariant`.
- **Admin:** Product create/edit forms send variant array with `sku` per variant.

---

## 4. What the SKU system is connected to (summary)

- **Product catalog:** Product identity (product SKU), variant identity (variant SKU).
- **Cart:** Item = product + optional variant SKU.
- **Orders:** Line item has product ref + optional variant SKU; stock decrement and display use it.
- **Store sales:** Same idea; store-level stock and sales use product + variant SKU.
- **Store stock:** Base stock per product; per-variant stock in `variantStocks[]` keyed by `variantSku`.
- **Search:** Product list/search can filter by product SKU (e.g. store-stock search by product name or SKU).

---

## 5. Duplication and gaps

### 5.1 Product SKU format validation (inconsistency, not duplication)

- **Frontend:** `frontend/src/lib/validation.ts` – SKU required and must match `^[A-Za-z0-9-_]+$`.
- **Backend:** `CreateProductDto` / `UpdateProductDto` only use `@IsString()` and `@IsNotEmpty()` (or optional). **No** `@Matches()` or similar for format.
- **Effect:** Backend will accept SKU with spaces/special chars if someone calls the API directly; frontend would reject the same value. **Recommendation:** Add the same format validation on the backend (e.g. `@Matches(/^[A-Za-z0-9-_]+$/)`) so rules are in one place and API is consistent.

### 5.2 No duplication of “uniqueness” logic

- Product SKU uniqueness is enforced only in the backend (repository + products service). Frontend does not check uniqueness; that’s correct (single source of truth on the server).

### 5.3 Variant SKU uniqueness within a product (gap)

- **Current:** No check that two variants of the **same** product have different SKUs. You can save `variants: [{ sku: 'X', ... }, { sku: 'X', ... }]`.
- **Risk:** Cart/orders/store-stock use `variantSku` to find the variant; duplicate variant SKUs in one product would make “which variant?” ambiguous.
- **Recommendation:** In `products.service.ts` create/update, validate that all `variants[].sku` are unique within that product (e.g. collect SKUs, check `new Set(skus).size === skus.length` and optionally that product SKU is not reused as a variant SKU if you want that rule).

### 5.4 No global variant SKU uniqueness

- Variant SKU is **not** unique across products; same string can be used in different products. That’s by design: identity is (productId + variantSku). No change needed unless you decide to enforce global variant SKU uniqueness later.

---

## 6. Quick reference – files by concern

| Concern | Files |
|--------|--------|
| Product SKU definition & uniqueness | `product.schema.ts`, `product.repository.ts`, `products.service.ts` |
| Variant SKU definition | `product.schema.ts` (ProductVariant.sku) |
| Product SKU API | `products.controller.ts` (GET sku/:sku), product DTOs |
| Product SKU validation (frontend) | `validation.ts`, admin product new/edit pages |
| Variant SKU in cart | `cart.schema.ts`, `cart.service.ts`, `cart.dto.ts`, `cart.controller.ts` |
| Variant SKU in orders | `order.schema.ts`, `orders.service.ts`, `order.dto.ts` |
| Variant SKU in store sales | `store-sale.schema.ts`, `store-sales.service.ts`, store-sale DTOs |
| Variant SKU in store stock | `store-stock.schema.ts`, `store-stock.service.ts`, `store-stock.repository.ts` |
| Variant SKU in product stock update | `products.service.ts` (`updateStock`, `decrementStock`), `product.repository.ts` (`decrementVariantStock`) |
| Frontend cart/checkout/display | `cart-store.ts`, `api.ts`, `cart-item.tsx`, checkout page, PDP, quick-view modal |

---

**Summary:** The SKU system has **product SKU** (unique globally) and **variant SKU** (per product, used in cart, orders, store sales, and store stock). There is no harmful duplication of logic; the main improvements are: add backend format validation for product SKU to match the frontend, and enforce variant SKU uniqueness within each product on create/update.
