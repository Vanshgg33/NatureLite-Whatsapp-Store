# UCM Module

## Purpose
The Universal Catalog Management (UCM) module makes the admin dashboard the single source of truth for product catalog data, then syncs that data to the selected Meta Commerce catalog and the WhatsApp catalog surface used by the chatbot.

## Source of Truth
- Product data remains in the existing MongoDB-backed `products` collection.
- Staff edit products in the admin dashboard.
- UCM reads from the same product records and pushes changes to the selected remote catalog.

## Runtime Flow
- Admin edits a product in the dashboard.
- `ProductsService` triggers a UCM sync hook after create, update, stock updates, stock decrements, and delete.
- UCM either runs in `dry_run` mode or writes to the selected Meta catalog.
- WhatsApp webhook parsing now recognizes catalog product selections and maps them back to the local product record.
- The chatbot continues to render products from the local database, so the bot and dashboard stay aligned.

## Frontend Surface
- New admin page: `/admin/ucm`
- Use this page to:
  - inspect discovered catalogs
  - select exactly one catalog
  - delete extra catalogs
  - switch between `dry_run` and `meta`
  - trigger manual syncs

## Backend Endpoints
- `GET /api/v1/ucm/dashboard`
- `GET /api/v1/ucm/catalogs`
- `GET /api/v1/ucm/config`
- `PUT /api/v1/ucm/config`
- `POST /api/v1/ucm/sync`
- `POST /api/v1/ucm/sync/:productId`
- `DELETE /api/v1/ucm/catalogs/:catalogId`

## Catalog Mapping
- Local product `_id` is used as the stable `retailer_id` for catalog items.
- That makes WhatsApp product selections easy to map back to the dashboard product record.
- The sync service uses Meta Graph API catalog endpoints and upserts products into the selected catalog.

## Sandbox Testing Strategy
The 360Dialog sandbox number does not have a live WhatsApp catalog on its profile, so direct profile verification is not a good test in sandbox.

Use this sequence instead:
1. Keep UCM in `dry_run` mode.
2. Edit products in the dashboard.
3. Confirm UCM records the sync result and the chatbot still reads the updated product data from MongoDB.
4. Switch to `meta` mode only after a real Meta access token and a selected catalog ID are configured.
5. On live Meta, verify that the one selected catalog is the only catalog kept connected.

## Live Inputs Still Needed
For real Meta catalog writes, the deployment still needs:
- a Meta catalog access token with catalog permissions
- the business-owned catalog ID to keep
- any confirmation needed before deleting the extra catalogs

## Notes
- The chatbot reads local master data, not a separate catalog copy.
- UCM is designed to avoid breaking the existing 360sandbox chat flow by defaulting to dry-run behavior until live catalog credentials are present.
