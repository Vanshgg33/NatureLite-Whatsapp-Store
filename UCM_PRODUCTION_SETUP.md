# UCM (Universal Catalog Management) - Production Setup Guide

**Status**: Production Ready  
**Branch**: production  
**360Dialog Integration**: Production API  
**Module Location**: `backend/src/modules/ucm`

---

## Overview

The Universal Catalog Management (UCM) system is production-ready on the `production` branch with the following capabilities:

✅ **Catalog Discovery**: Auto-discover catalogs on your 360Dialog account  
✅ **Dry-run Mode**: Safe testing before syncing to production  
✅ **Product Sync**: Automatic sync on product create/update/delete  
✅ **Catalog Management**: Select and manage catalogs via admin dashboard  
✅ **Error Handling**: Comprehensive logging and error recovery  
✅ **WhatsApp Integration**: Catalog products linked to chatbot  

---

## Production Configuration

### Environment Variables Required

The UCM system uses these environment variables:

| Variable | Required | Purpose | Production Value |
|----------|----------|---------|------------------|
| `WHATSAPP_PROVIDER` | ✅ | Determines catalog system | `360dialog` (not sandbox) |
| `WHATSAPP_API_URL` | ✅ | 360Dialog API endpoint | `https://waba-v2.360dialog.io` |
| `WHATSAPP_D360_API_KEY` | ✅ | 360Dialog API authentication | Your production API key |
| `CATALOG_API_URL` | ✅ | Meta Graph API endpoint | `https://graph.facebook.com/v25.0` |
| `CATALOG_BUSINESS_ID` | ⚠️ | Meta business account (optional) | Only if using Meta catalogs |
| `CATALOG_ACCESS_TOKEN` | ⚠️ | Meta catalog token (optional) | Only if using Meta catalogs |

**Hardcoded in render.yaml for production**:
```yaml
WHATSAPP_PROVIDER: 360dialog
WHATSAPP_API_URL: https://waba-v2.360dialog.io
CATALOG_API_URL: https://graph.facebook.com/v25.0
```

---

## Render Deployment Configuration

### render.yaml UCM Settings

The `render.yaml` file already includes UCM configuration:

```yaml
services:
  - type: web
    name: store-backend
    # ... other config ...
    envVars:
      - key: WHATSAPP_PROVIDER
        value: 360dialog
      - key: WHATSAPP_API_URL
        value: https://waba-v2.360dialog.io
      - key: WHATSAPP_D360_API_KEY
        sync: false  # Must be entered in Render dashboard
      - key: CATALOG_API_URL
        value: https://graph.facebook.com/v25.0
```

**Action required**: Enter `WHATSAPP_D360_API_KEY` in Render environment dashboard.

---

## Pre-Deployment Setup

### 1. Get 360Dialog Production API Key

1. Go to [360Dialog Hub](https://hub.360dialog.io)
2. Login with your production account credentials
3. Navigate to **Settings** → **API Settings**
4. Find or generate **API Key**
5. Copy the API key (you'll need this for deployment)

### 2. Identify Your WhatsApp Business Account ID

From the same 360Dialog Hub:
1. Go to **Account Settings** → **Details**
2. Find **WABA ID** (WhatsApp Business Account ID)
3. Keep this for reference (may be needed for catalog configuration)

### 3. Verify 360Dialog Webhook URL

1. In 360Dialog Hub → **Settings** → **Webhooks**
2. Ensure webhook URL is set to: `https://store-backend-prod-XXXX.onrender.com/api/v1/webhook/whatsapp`
3. Ensure webhook verify token is correctly configured

---

## Post-Deployment Initialization

### 1. Access UCM Dashboard

After deployment:

1. Frontend: `https://store-frontend-prod-XXXX.onrender.com`
2. Login with admin account
3. Navigate to `/admin/ucm` (or **Admin** → **UCM** menu)

### 2. Initial UCM Setup Screen

You'll see the UCM Dashboard with:

- **Catalog Discovery Status**: Shows discovered catalogs
- **Current Mode**: `dry_run` (default, safe)
- **Connected Catalog**: None selected yet
- **Sync History**: Empty (no syncs yet)

### 3. Discover Catalogs (First Run)

1. Click **"Discover Catalogs"** button
2. Backend will query 360Dialog for available catalogs
3. Expected result: List of catalogs on your WhatsApp Business Account
4. If no catalogs appear:
   - Verify `WHATSAPP_D360_API_KEY` is correct
   - Check backend logs for API errors
   - Create a catalog in 360Dialog Hub first

### 4. Select Primary Catalog

1. From discovered catalogs list, click **"Select"** on desired catalog
2. Catalog status changes to "Connected"
3. Backend will delete other extra catalogs (optional, can disable)
4. Current mode remains: `dry_run`

### 5. Manual Sync (Dry-run Test)

1. Click **"Sync All Products"** button
2. System will:
   - Read all products from MongoDB
   - Simulate catalog sync (dry-run mode = no actual changes)
   - Log sync results and errors
3. Check **Sync History** for results:
   - ✅ Status: `SUCCESS`
   - Product count synced
   - Any warnings or errors

### 6. Switch to Production Mode

**⚠️ Only after successful dry-run test**:

1. In UCM Dashboard, find **"Mode"** setting
2. Current: `dry_run`
3. Click **"Switch to Production"**
4. System will:
   - Enable real catalog syncs
   - Begin pushing products to selected catalog
5. Confirm by clicking **"Activate Production Sync"**

### 7. Full Product Sync

Once in production mode:

1. Click **"Sync All Products"** again
2. Real products will be synced to catalog
3. Monitor Sync History for status
4. Check backend logs for any issues

---

## Production Operations

### Daily Operations

#### Monitor Sync Health

- **Dashboard**: Navigate to `/admin/ucm`
- **Check**: Last sync time and status
- **Verify**: No errors in sync history
- **Frequency**: Check daily or after product updates

#### Product Updates

When products are created/updated in admin dashboard:

1. Backend automatically triggers UCM sync
2. Changes pushed to catalog in real-time
3. Check Sync History in UCM Dashboard to verify

#### Troubleshoot Failed Syncs

If sync fails:

1. Click sync error in Sync History
2. Read error message
3. Common issues:
   - **Invalid product data**: Fix product in admin dashboard
   - **API key expired**: Update `WHATSAPP_D360_API_KEY` in Render
   - **Network issue**: Check backend service status
   - **Catalog deleted**: Re-discover and select catalog

### Manual Operations

#### Trigger Manual Sync

1. UCM Dashboard → Click **"Sync All Products"**
2. Or sync individual product from Products page
3. Monitor Sync History for completion

#### Switch Catalogs

1. UCM Dashboard → Find **"Connected Catalog"**
2. Click **"Switch Catalog"**
3. Select new primary catalog
4. Old catalogs will be deleted (if auto-delete enabled)

#### Emergency Dry-run Reset

If production mode has issues:

1. UCM Dashboard → **"Mode"** setting
2. Click **"Switch to Dry-run"**
3. All syncs become test-mode
4. No actual catalog changes
5. Fix issues
6. Switch back to production when ready

---

## Architecture Overview

### How UCM Works

```
┌─────────────────────────────────────┐
│  Admin Dashboard                    │
│  - Edit Products                    │
│  - UCM Dashboard                    │
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│  Backend - UCM Module               │
│  - ProductsService Hook             │
│  - UcmService (sync logic)          │
│  - 360Dialog API Integration        │
└────────────┬────────────────────────┘
             │
      Dry-run │ Production
      Mode    │ Mode
             ↓
┌─────────────────────────────────────┐
│  360Dialog Catalog API              │
│  - Upsert Products                  │
│  - Manage Catalogs                  │
│  - Link to WhatsApp                 │
└─────────────────────────────────────┘
```

### Data Flow

1. **Product Update** in admin dashboard
2. **Hook Triggered**: `ProductsService.create/update/delete`
3. **UCM Service Called**: Checks if dry-run or production
4. **API Request**: Sends to 360Dialog or Meta Graph API
5. **Response Logged**: Sync history recorded
6. **WhatsApp Catalog**: Updated with new product data
7. **Chatbot Ready**: Bot uses updated product info

---

## API Endpoints Reference

### Public Endpoints (UCM Dashboard)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/ucm/dashboard` | GET | Get UCM dashboard snapshot |
| `/api/v1/ucm/catalogs` | GET | List discovered catalogs |
| `/api/v1/ucm/config` | GET | Get current UCM config |
| `/api/v1/ucm/config` | PUT | Update UCM config (mode, catalog selection) |
| `/api/v1/ucm/sync` | POST | Trigger manual full sync |
| `/api/v1/ucm/sync/:productId` | POST | Sync specific product |

### Protected Endpoints

All endpoints require admin authentication (JWT token in cookie).

---

## Monitoring & Debugging

### Check Sync Logs

1. Render Dashboard → `store-backend` service
2. Click **"Logs"** tab
3. Search for `[UCM]` prefix
4. Look for:
   - `Sync started for product X`
   - `Sync completed: SUCCESS/FAILED`
   - Error messages with details

### MongoDB UCM Collections

These collections store UCM state:

| Collection | Purpose |
|-----------|---------|
| `catalogs` | Discovered catalogs and selection |
| `ucm_syncs` | Sync history and logs |
| `ucm_config` | Current UCM mode and settings |

### Debug Queries

Access backend logs for detailed debugging:

```
Render → store-backend → Logs
Search: "UCM"
```

Expected healthy logs:
```
[UCM] Catalog discovery complete: 2 catalogs found
[UCM] Catalog selected: catalog_123
[UCM] Product sync queued: product_456
[UCM] Product sync completed: SUCCESS
```

---

## Troubleshooting

### Issue: No catalogs discovered

**Cause**: API key invalid or insufficient permissions

**Fix**:
1. Verify `WHATSAPP_D360_API_KEY` in Render environment
2. Confirm API key is for production account
3. Check 360Dialog Hub → API Settings for active key
4. Re-test discovery

### Issue: Sync fails with "Invalid product"

**Cause**: Product missing required fields for catalog

**Fix**:
1. Check backend logs for specific field error
2. Update product in admin dashboard:
   - Ensure image URL is valid and publicly accessible
   - Ensure price is set
   - Ensure product name is filled
3. Retry sync

### Issue: Sync shows dry-run results, not production

**Cause**: Mode is still set to `dry_run`

**Fix**:
1. UCM Dashboard → Mode setting
2. Click **"Switch to Production"**
3. Confirm "Activate Production Sync"
4. Mode should change to `production`
5. Try sync again

### Issue: WhatsApp bot not showing updated products

**Cause**: Chatbot reading stale catalog or catalog not synced

**Fix**:
1. Verify sync completed successfully (check Sync History)
2. Check backend logs for sync errors
3. In UCM Dashboard, manually trigger "Sync All Products"
4. Wait 5-10 minutes for catalog propagation on Meta network
5. Clear WhatsApp chat cache (close and reopen chat)
6. Test again

---

## Production Best Practices

### Daily Tasks

- ✅ Check UCM Dashboard for sync status
- ✅ Review sync history for errors
- ✅ Monitor backend logs for UCM entries
- ✅ Test product creation/update in admin dashboard

### Weekly Tasks

- ✅ Full manual sync to verify catalog health
- ✅ Test WhatsApp chatbot product browsing
- ✅ Audit products in admin vs. catalog
- ✅ Check for any sync failures in history

### Monthly Tasks

- ✅ Backup UCM configuration
- ✅ Review 360Dialog account settings
- ✅ Test catalog recovery procedures
- ✅ Update documentation if needed

### Disaster Recovery

**If catalog becomes corrupt**:

1. Switch to `dry_run` mode (safe)
2. In 360Dialog Hub, delete problematic catalog
3. In UCM Dashboard, click "Discover Catalogs"
4. Create/select new catalog
5. Do full sync in dry-run first
6. Switch back to production
7. Monitor carefully

---

## Performance Considerations

### Sync Performance

- **Full sync time**: ~100 products = 5-10 seconds
- **Individual sync**: ~1 second per product
- **Batch updates**: Use manual "Sync All" for large updates

### API Rate Limits

360Dialog rate limits:
- Default: 100 requests/minute
- Batch limit: 10 products per request (optimized)

If hitting limits:
- Reduce frequency of full syncs
- Use dry-run mode when testing
- Space out manual syncs

---

## Compliance & Security

### Data Protection

- Product images: Stored on Cloudinary (CDN)
- Catalog data: Stored in 360Dialog servers
- Sync logs: Stored in MongoDB (audit trail)

### Access Control

- Only superadmins can access UCM Dashboard
- API key stored as environment variable (never in code)
- Webhook verify token validated on each request

### Audit Trail

All catalog syncs logged:
- Timestamp, admin user, operation, result, error details
- Stored in `ucm_syncs` collection
- Accessible via Render logs

---

## Support & Documentation

For issues or questions:

1. Check [UCM_MODULE.md](./UCM_MODULE.md) for architecture
2. Review [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)
3. Check backend logs in Render dashboard
4. Reference [360Dialog Docs](https://docs.360dialog.com/)

---

## Migration from Sandbox to Production

If migrating from sandbox:

1. **Keep sandbox branch**: `feat/ucm-catalog-sync` continues to work
2. **Test on sandbox first**: Use `feat/ucm-catalog-sync` → render.sandbox.yaml
3. **Production branch ready**: `production` branch configured for live
4. **No data loss**: Separate MongoDB databases for sandbox vs. production

### Migration Steps

1. Prepare production 360Dialog account
2. Deploy `production` branch to new Render services
3. Set up new MongoDB Atlas production cluster
4. Configure UCM on production (discovery, catalog selection)
5. Run dry-run sync to verify data integrity
6. Activate production mode
7. Monitor for 24 hours before full cutover

---

## Upgrade Path

This production branch includes UCM v1. Future upgrades:

- **v2**: Meta catalog support enhancements
- **v3**: Multi-catalog management
- **v4**: AI-powered product matching and categorization

Current version: v1 (stable)

