# 360dialog Sandbox Setup Guide (End-to-End)

This guide configures the current backend to work with the 360dialog Sandbox API for local testing. For the Render deployment path, use [RENDER_SANDBOX_DEPLOYMENT_GUIDE.md](../RENDER_SANDBOX_DEPLOYMENT_GUIDE.md).

## 1. What has already been prepared in code

The backend is now updated to support two WhatsApp providers:

- `meta` (existing Cloud API flow)
- `360dialog_sandbox` (new sandbox flow)

When sandbox mode is enabled:

- Base URL is `https://waba-sandbox.360dialog.io/v1`
- Header is `D360-API-KEY: <key>`
- Send endpoint is `POST /messages`
- Flat webhook payloads and Cloud API style payloads are both accepted
- Media retrieval endpoint is skipped (not supported by sandbox)

## 2. Prerequisites

- Node.js 18+
- npm
- MongoDB running locally or MongoDB Atlas connection
- ngrok account and CLI installed (or another public tunnel)

## 3. Backend environment variables

Open `backend/.env` and confirm these values exist:

```env
NODE_ENV=development
PORT=7001
API_PREFIX=api/v1
FRONTEND_URL=http://localhost:8001

# MongoDB (use one of these)
MONGODB_URI=<your-mongo-uri>
# or existing key supported as fallback:
# MONGODB_URL=<your-mongo-uri>

# WhatsApp provider mode
WHATSAPP_PROVIDER=360dialog_sandbox
WHATSAPP_API_URL=https://waba-sandbox.360dialog.io
WHATSAPP_D360_API_KEY=<your-360dialog-sandbox-api-key>
WHATSAPP_WEBHOOK_URL=<your-public-backend-url>/api/v1/whatsapp/webhook

# Required by existing code paths
WHATSAPP_PHONE_NUMBER_ID=sandbox
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_BUSINESS_ACCOUNT_ID=

# Optional in sandbox (signature check is bypassed if missing)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=wa_verify_2026_03_20_n8K4mP2xR7qL1vT9
WHATSAPP_APP_SECRET=
```

Important:

- Keep `WHATSAPP_PROVIDER=360dialog_sandbox`
- `WHATSAPP_API_URL` must be exactly `https://waba-sandbox.360dialog.io`
- Do not add `/v1` here (the code adds it automatically in sandbox mode)
- `WHATSAPP_WEBHOOK_URL` must be the public callback URL that 360Dialog should call

## 4. Install dependencies

From project root:

```bash
cd backend
npm install
```

## 5. Start backend

```bash
cd backend
npm run start:dev
```

Expected:

- API running at `http://localhost:7001/api/v1`
- Webhook endpoint available at `http://localhost:7001/api/v1/whatsapp/webhook`

## 6. Expose local webhook publicly

In a new terminal:

```bash
ngrok http 7001
```

Copy the HTTPS forwarding URL from ngrok, for example:

- `https://abcd-1234.ngrok-free.app`

Your full webhook URL becomes:

- `https://abcd-1234.ngrok-free.app/api/v1/whatsapp/webhook`

## 7. Register webhook URL in 360dialog sandbox

Run this command from any terminal:

```bash
curl --request POST \
  --url https://waba-sandbox.360dialog.io/v1/configs/webhook \
  --header 'Content-Type: application/json' \
  --header "D360-API-KEY: $WHATSAPP_D360_API_KEY" \
  --data '{"url":"https://abcd-1234.ngrok-free.app/api/v1/whatsapp/webhook"}'
```

If your shell does not have the env var exported, use the raw key directly:

```bash
curl --request POST \
  --url https://waba-sandbox.360dialog.io/v1/configs/webhook \
  --header 'Content-Type: application/json' \
  --header 'D360-API-KEY: YOUR_360DIALOG_SANDBOX_API_KEY' \
  --data '{"url":"https://abcd-1234.ngrok-free.app/api/v1/whatsapp/webhook"}'
```

Expected response:

```json
{
  "url": "https://abcd-1234.ngrok-free.app/api/v1/whatsapp/webhook"
}
```

If `WHATSAPP_WEBHOOK_URL` is configured, the backend now registers the sandbox webhook automatically at startup.

## 8. Inbound test (phone -> webhook)

1. From your WhatsApp phone, send any message to `+55 11 4673-3492`.
2. Check backend terminal logs.
3. You should see inbound webhook processing in your backend.

## 9. Outbound test through sandbox API directly

Run this command (replace with your own WhatsApp number in international format, digits only):

```bash
curl --request POST \
  --url https://waba-sandbox.360dialog.io/v1/messages \
  --header 'Content-Type: application/json' \
  --header 'D360-API-KEY: YOUR_360DIALOG_SANDBOX_API_KEY' \
  --data '{
    "to":"<YOUR_PHONE_NUMBER>",
    "messaging_product":"whatsapp",
    "type":"text",
    "text":{"body":"Hello from 360dialog sandbox"}
  }'
```

Expected response code: `201`

## 10. Outbound test through your backend API

Your backend already has the endpoint:

- `POST /api/v1/whatsapp/send/text` (admin auth protected)

So you can test in two ways:

- Use your admin login flow, then call the endpoint with JWT token
- Or temporarily relax auth in local development if needed

Example request payload:

```json
{
  "phone": "<YOUR_PHONE_NUMBER>",
  "message": "Hello from backend sandbox integration"
}
```

## 11. Template test (optional)

Sandbox template names supported by 360dialog docs include:

- `disclaimer`
- `first_welcome_messsage`
- `interactive_template_sandbox`

Direct API template example:

```bash
curl --request POST \
  --url https://waba-sandbox.360dialog.io/v1/messages \
  --header 'Content-Type: application/json' \
  --header 'D360-API-KEY: YOUR_360DIALOG_SANDBOX_API_KEY' \
  --data '{
    "to":"<YOUR_PHONE_NUMBER>",
    "messaging_product":"whatsapp",
    "type":"template",
    "template":{
      "name":"first_welcome_messsage",
      "language":{"code":"en"},
      "components":[
        {
          "type":"body",
          "parameters":[{"type":"text","text":"Placeholder 1"}]
        }
      ]
    }
  }'
```

## 12. Sandbox limitations to remember

- Messages/templates only to the phone tied to sandbox key
- Max 200 messages total in sandbox
- Media upload/retrieval by media ID is not supported in sandbox
- Webhook URL can be changed anytime

## 13. Troubleshooting

### Webhook not receiving events

- Confirm ngrok is still running
- Re-run webhook config call (`/v1/configs/webhook`) with current ngrok URL
- Confirm backend route is reachable: `GET https://<ngrok>/api/v1/whatsapp/webhook`

### 401/403 errors from send API

- Verify `D360-API-KEY` is correct
- Confirm provider in `.env` is `360dialog_sandbox`
- Restart backend after `.env` changes

### No outbound message appears on phone

- Ensure `to` matches your sandbox-linked number
- Confirm you did not exceed sandbox message limit
- Check backend logs for API errors

## 14. Switching back to Meta Cloud API later

If you want to switch back:

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=<meta-phone-number-id>
WHATSAPP_ACCESS_TOKEN=<meta-access-token>
```

Then restart backend.
