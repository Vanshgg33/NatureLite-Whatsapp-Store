# Production Environment Configuration Guide

**Generated**: April 24, 2026  
**Branch**: production  
**Deployment Target**: Render (store-backend + store-frontend)  
**360Dialog Configuration**: Production API (360dialog, not sandbox)

---

## Overview

This guide contains all environment variables required for the **production** deployment on Render. The production branch includes:
- **360Dialog Production API** integration (WhatsApp messaging)
- **Universal Catalog Management (UCM)** system fully operational
- **Secure authentication** with production JWT
- **Production database** (MongoDB Atlas)
- **Production-grade CORS & CSRF** protection

---

## Backend Environment Variables

### Backend Service: `store-backend`

| Variable | Value Type | Required | Description | Retrieval Method | Notes |
|----------|-----------|----------|-------------|-----------------|-------|
| `NODE_ENV` | String | ✅ | Set to `production` | Hardcoded in render.yaml | Enables production validation |
| `API_PREFIX` | String | ✅ | Set to `api/v1` | Hardcoded in render.yaml | API route prefix |
| `FRONTEND_URL` | String | ✅ | Frontend deployment URL | Manual (Render dashboard) | Examples: `https://store-frontend.onrender.com,https://yourdomain.com` |
| `MONGODB_URI` | String | ✅ | MongoDB connection string | Manual (MongoDB Atlas) | Format: `mongodb+srv://user:pass@cluster.mongodb.net/store-production?retryWrites=true&w=majority` |
| `JWT_SECRET` | String | ✅ | Strong random secret (32+ bytes) | **Use generated value below** | ⚠️ **CRITICAL**: Keep this secret. Never expose in logs. |
| `JWT_EXPIRES_IN` | String | ✅ | Token expiration | Hardcoded in render.yaml | Set to `7d` (7 days) |
| `WHATSAPP_PROVIDER` | String | ✅ | Set to `360dialog` | Hardcoded in render.yaml | Must be `360dialog` for production (NOT `360dialog_sandbox`) |
| `WHATSAPP_API_URL` | String | ✅ | 360Dialog production URL | Hardcoded in render.yaml | Must be `https://waba-v2.360dialog.io` |
| `WHATSAPP_D360_API_KEY` | String | ✅ | 360Dialog API key | Manual (360Dialog Hub) | Retrieve from: 360Dialog Hub → API Settings → API Key |
| `WHATSAPP_WEBHOOK_URL` | String | ✅ | Webhook callback URL | Manual (Render dashboard) | Format: `https://store-backend.onrender.com/api/v1/webhook/whatsapp` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | String | ✅ | Verify token for webhook | Manual (Self-generated) | Generate a random string: `openssl rand -base64 24` |
| `WHATSAPP_APP_SECRET` | String | ⚠️ | App secret (may be empty) | Manual if using Meta | Only needed if using Meta as WHATSAPP_PROVIDER |
| `CATALOG_API_URL` | String | ✅ | Meta Graph API endpoint | Hardcoded in render.yaml | Set to `https://graph.facebook.com/v25.0` |
| `CATALOG_BUSINESS_ID` | String | ⚠️ | Meta business account ID | Manual (if using Meta catalogs) | Optional if only using 360Dialog |
| `CATALOG_ACCESS_TOKEN` | String | ⚠️ | Meta catalog access token | Manual (if using Meta catalogs) | Optional if only using 360Dialog |
| `CLOUDINARY_CLOUD_NAME` | String | ✅ | Cloudinary cloud name | Manual (Cloudinary dashboard) | From Cloudinary → Settings → Cloud name |
| `CLOUDINARY_API_KEY` | String | ✅ | Cloudinary API key | Manual (Cloudinary dashboard) | From Cloudinary → Settings → API Keys |
| `CLOUDINARY_API_SECRET` | String | ✅ | Cloudinary API secret | Manual (Cloudinary dashboard) | ⚠️ Keep secret |
| `RAZORPAY_KEY_ID` | String | ✅ | Razorpay key ID | Manual (Razorpay dashboard) | From Razorpay → Settings → API Keys → Key ID |
| `RAZORPAY_KEY_SECRET` | String | ✅ | Razorpay key secret | Manual (Razorpay dashboard) | ⚠️ Keep secret |
| `RAZORPAY_WEBHOOK_SECRET` | String | ✅ | Razorpay webhook secret | Manual (Razorpay webhook settings) | Generate after setting webhook URL in Razorpay |
| `SMTP_HOST` | String | ✅ | SMTP server hostname | Manual | Example: `smtp.gmail.com` for Gmail |
| `SMTP_PORT` | String | ✅ | SMTP port | Hardcoded in render.yaml | Set to `587` (TLS) |
| `SMTP_SECURE` | String | ✅ | Use TLS | Hardcoded in render.yaml | Set to `false` for port 587 |
| `SMTP_USER` | String | ✅ | SMTP username/email | Manual | Your email address for sending |
| `SMTP_PASS` | String | ✅ | SMTP password/app password | Manual | ⚠️ For Gmail, use App Password, not regular password |
| `SMTP_FROM` | String | ✅ | From email address | Hardcoded default | Example: `Naturelite Store <noreply@naturelite.com>` |

### Generated Values for Backend

**For Production JWT_SECRET**, use this generated value:
```
JWT_SECRET = uSK1Ij0Vr1Hp81qrXhD7cf8fmBEIKT4gzJQ4ahZfReY=
```

**For WHATSAPP_WEBHOOK_VERIFY_TOKEN**, generate a new one:
```bash
openssl rand -base64 24
# Use the output as WHATSAPP_WEBHOOK_VERIFY_TOKEN
```

---

## Frontend Environment Variables

### Frontend Service: `store-frontend`

| Variable | Value Type | Required | Description | Retrieval Method | Notes |
|----------|-----------|----------|-------------|-----------------|-------|
| `NODE_ENV` | String | ✅ | Set to `production` | Hardcoded in render.yaml | Enables production optimizations |
| `NEXT_PUBLIC_API_URL` | String | ✅ | Backend API base URL | Manual (Render dashboard) | Must be: `https://store-backend.onrender.com/api/v1` (adjust domain) |
| `NEXT_PUBLIC_SITE_URL` | String | ✅ | Frontend site URL | Manual (Render dashboard) | Must be: `https://store-frontend.onrender.com` (adjust domain) |

---

## UCM (Universal Catalog Management) Configuration

UCM uses these existing environment variables. No additional config needed:

| Variable | Purpose | Status |
|----------|---------|--------|
| `WHATSAPP_PROVIDER` | Determines catalog provider (360dialog or meta) | Set to `360dialog` for production |
| `WHATSAPP_D360_API_KEY` | 360Dialog API key for catalog sync | Required for 360D catalog operations |
| `CATALOG_API_URL` | Meta Graph API endpoint | Pre-configured in render.yaml |
| `CATALOG_BUSINESS_ID` | Meta business account (optional for 360D) | Only needed if using Meta catalogs |
| `CATALOG_ACCESS_TOKEN` | Meta catalog token (optional for 360D) | Only needed if using Meta catalogs |

### UCM Runtime Configuration

UCM configuration is managed through the admin dashboard at `/admin/ucm`:

1. **Dry-run mode**: Enabled by default for safety
2. **Catalog selection**: Admin selects which catalog to keep connected
3. **Sync triggers**: Manual or automatic on product updates
4. **Monitoring**: Dashboard shows sync history and errors

---

## Optional Environment Variables (Can Skip Initially)

| Variable | Purpose | Impact if Missing |
|----------|---------|-------------------|
| `CATALOG_BUSINESS_ID` | Meta business account ID | Only needed for Meta catalog integration |
| `CATALOG_ACCESS_TOKEN` | Meta catalog access token | Only needed for Meta catalog integration |
| `WHATSAPP_APP_SECRET` | Meta app secret | Only needed if using Meta provider |

**Recommendation**: Skip Meta-related variables initially. Focus on 360Dialog production setup first.

---

## MongoDB Production Setup

### Atlas Configuration

1. **Create Production Cluster**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create new cluster (M10 tier minimum for production)
   - Select nearest region to your users
   - Enable automatic backups

2. **Create Database User**:
   - Username: `store-prod-user`
   - Password: Generate strong password (minimum 32 chars, include special chars)
   - Assign role: `readWriteAnyDatabase`

3. **Create Database**:
   - Database name: `store-production`
   - Initialize with collections if needed

4. **Connection String Format**:
   ```
   mongodb+srv://store-prod-user:PASSWORD@cluster.mongodb.net/store-production?retryWrites=true&w=majority
   ```

5. **IP Allowlist**:
   - Add Render's static IP or allow from anywhere (for Render deployment)
   - Go to Atlas → Network Access → IP Whitelist
   - Add: `0.0.0.0/0` for Render (or specific Render IPs if available)

---

## Checklist for Production Deployment

- [ ] **Secrets Generated**
  - [ ] JWT_SECRET (use provided value)
  - [ ] WHATSAPP_WEBHOOK_VERIFY_TOKEN (generate new)
  - [ ] All API keys and secrets stored securely

- [ ] **360Dialog Setup**
  - [ ] Production API key obtained from 360Dialog Hub
  - [ ] Webhook URL configured in 360Dialog Hub settings
  - [ ] Webhook verify token saved in environment

- [ ] **Database**
  - [ ] MongoDB Atlas production cluster created
  - [ ] User credentials generated
  - [ ] IP whitelist configured for Render
  - [ ] MONGODB_URI connection string ready

- [ ] **Frontend URLs**
  - [ ] FRONTEND_URL points to production frontend domain
  - [ ] NEXT_PUBLIC_API_URL points to production backend domain
  - [ ] NEXT_PUBLIC_SITE_URL configured correctly

- [ ] **Email/SMTP**
  - [ ] SMTP credentials configured
  - [ ] SMTP_FROM address set
  - [ ] Test email send before going live

- [ ] **Render Deployment**
  - [ ] Blueprint created using `render.yaml`
  - [ ] All environment variables entered in Render dashboard
  - [ ] Health check endpoint configured (`/api/v1/health`)
  - [ ] Auto-deploy disabled initially for safety testing

---

## Render Deployment Steps (See Deployment Guide)

Refer to [RENDER_PRODUCTION_DEPLOYMENT_GUIDE.md](./RENDER_PRODUCTION_DEPLOYMENT_GUIDE.md) for exact step-by-step instructions on:

1. Creating the blueprint on Render
2. Configuring environment variables
3. Initial testing before live deployment
4. Health checks and monitoring

---

## Security Notes

⚠️ **Critical Security Requirements**:

1. **Never commit secrets** to git (all sync: false in render.yaml)
2. **Rotate JWT_SECRET** regularly in production
3. **Use HTTPS everywhere** (Render provides automatic SSL)
4. **Set FRONTEND_URL** to restrict CORS origins
5. **Enable CSRF protection** (automatically configured in backend)
6. **Monitor webhook traffic** for 360Dialog integration
7. **Backup MongoDB** daily with retention policy

---

## Testing After Deployment

1. **Health check**: `GET https://store-backend.onrender.com/api/v1/health`
2. **Admin registration**: Test at `/admin-register` frontend page
3. **Admin login**: Test at `/admin-login` frontend page
4. **Product sync**: Create/update product in admin dashboard
5. **UCM dashboard**: Navigate to `/admin/ucm` and verify catalog status
6. **WhatsApp integration**: Send test message via WhatsApp chatbot

---

## References

- [Render Deployment Guide](./RENDER_PRODUCTION_DEPLOYMENT_GUIDE.md)
- [UCM Module Documentation](./UCM_MODULE.md)
- [360Dialog API Documentation](https://docs.360dialog.com/)
- [Production Checklist](./PRODUCTION_CHECKLIST.md)

