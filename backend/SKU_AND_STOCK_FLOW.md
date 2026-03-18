# SKU and stock flow

## Rule

- Every product has a **product SKU** (unique). Products can have **variants**, each with a **variant SKU** (unique within that product).
- On **orders** (website) and **store sales** (log sale), each line item specifies:
  - **product** (productId)
  - **variant SKU** (optional): which variant was sold. If omitted, the sale is for the product’s main/base stock.
- **Stock is always deducted from Store stock** (per store, per product, and per variant when `variantSku` is set):
  - With `variantSku`: deduct from that store’s `StoreStock` for that product’s **variant** (`variantStocks[].variantSku`).
  - Without `variantSku`: deduct from that store’s **main** product stock (`StoreStock.stock`).

## Where it’s implemented

| Flow | variantSku on line item | Deduction |
|------|-------------------------|-----------|
| Website order | From cart (customer chose variant) | `storeStockService.decrementStock(mainStoreId, productId, quantity, item.variantSku)` |
| Log sale (admin) | From “Log Sale” cart (admin picks product + variant) | Same: `storeStockService.decrementStock(storeId, productId, quantity, item.variantSku)` |

So: **each order/sale line is tied to one SKU (product or variant), and that SKU’s store stock is what gets deducted.**
