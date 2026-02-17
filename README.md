# WhatsApp Commerce Platform

A production-ready WhatsApp Commerce & Order Management platform with a NestJS backend and Next.js admin panel.

## Features

- **WhatsApp Integration**: Full WhatsApp Business Cloud API integration
- **Chatbot Engine**: State-based chatbot for customer interactions
- **Commerce**: Products, categories, cart, checkout, orders
- **Payments**: COD and prepaid support
- **Coupons**: Discount codes with various rules
- **Shipping**: Shiprocket integration for logistics
- **Analytics**: Real-time dashboard and reports
- **Admin Panel**: Modern Next.js admin dashboard

## Tech Stack

### Backend
- NestJS (Node.js framework)
- MongoDB + Mongoose
- Redis + BullMQ (job queues)
- JWT Authentication
- Cloudinary (media storage)
- WhatsApp Business Cloud API
- Shiprocket API

### Frontend
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui components
- React Query
- Zustand (state management)

## Project Structure

```
whatsapp/
├── backend/
│   ├── src/
│   │   ├── common/          # Shared utilities, guards, filters
│   │   ├── config/          # Configuration
│   │   └── modules/         # Feature modules
│   │       ├── auth/
│   │       ├── users/
│   │       ├── products/
│   │       ├── categories/
│   │       ├── cart/
│   │       ├── orders/
│   │       ├── payments/
│   │       ├── coupons/
│   │       ├── whatsapp/
│   │       ├── chatbot/
│   │       ├── notifications/
│   │       ├── shiprocket/
│   │       ├── analytics/
│   │       ├── admin/
│   │       ├── settings/
│   │       ├── media/
│   │       └── queues/
│   ├── package.json
│   └── tsconfig.json
└── frontend/
    ├── src/
    │   ├── app/             # Next.js App Router pages
    │   ├── components/      # React components
    │   ├── lib/             # Utilities and API client
    │   └── types/           # TypeScript types
    ├── package.json
    └── tailwind.config.ts
```

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or cloud)
- WhatsApp Business Account (optional for development)
- Cloudinary Account

### 1. Clone and Install

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

**Backend** - Create `backend/.env`:
```env
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3001

# MongoDB
MONGODB_URI=mongodb://localhost:27017/whatsapp-store

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# WhatsApp (optional for development)
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_BUSINESS_ACCOUNT_ID=your-business-account-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your-webhook-verify-token
WHATSAPP_APP_SECRET=your-app-secret

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Shiprocket (optional)
SHIPROCKET_EMAIL=your-email@example.com
SHIPROCKET_PASSWORD=your-password
```

**Frontend** - The `frontend/.env.local` is already configured:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

### 3. Start the Services

```bash
# Terminal 1: Start MongoDB (if local)
mongod

# Terminal 2: Start Redis (if local)
redis-server

# Terminal 3: Start Backend
cd backend
npm run start:dev

# Terminal 4: Start Frontend
cd frontend
npm run dev
```

### 4. Access the Application

- **Admin Panel**: http://localhost:3001
- **Backend API**: http://localhost:3000/api/v1

### 5. Create Admin User

Use the API to create your first admin user:

```bash
curl -X POST http://localhost:3000/api/v1/auth/admin/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin",
    "email": "admin@example.com",
    "password": "password123"
  }'
```

Then login at http://localhost:3001/login

## API Endpoints

### Authentication
- `POST /auth/admin/login` - Admin login
- `POST /auth/admin/register` - Admin registration
- `GET /auth/profile` - Get current user profile
- `POST /auth/change-password` - Change password

### Products
- `GET /products` - List products (paginated)
- `POST /products` - Create product
- `GET /products/:id` - Get product
- `PUT /products/:id` - Update product
- `DELETE /products/:id` - Delete product
- `GET /products/featured` - Get featured products
- `GET /products/low-stock` - Get low stock products

### Categories
- `GET /categories` - List categories
- `POST /categories` - Create category
- `GET /categories/:id` - Get category
- `PUT /categories/:id` - Update category
- `DELETE /categories/:id` - Delete category
- `GET /categories/tree` - Get category tree

### Orders
- `GET /orders` - List orders (paginated)
- `POST /orders` - Create order
- `GET /orders/:id` - Get order
- `PUT /orders/:id/status` - Update order status
- `PUT /orders/:id/shipping` - Update shipping info
- `POST /orders/:id/notes` - Add order note
- `POST /orders/:id/cancel` - Cancel order

### Users
- `GET /users` - List users
- `GET /users/:id` - Get user
- `POST /users/:id/block` - Block user
- `POST /users/:id/unblock` - Unblock user

### Coupons
- `GET /coupons` - List coupons
- `POST /coupons` - Create coupon
- `GET /coupons/:id` - Get coupon
- `PUT /coupons/:id` - Update coupon
- `DELETE /coupons/:id` - Delete coupon
- `POST /coupons/validate` - Validate coupon

### Analytics
- `GET /analytics/dashboard` - Dashboard stats
- `GET /analytics/revenue` - Revenue by day
- `GET /analytics/orders` - Order analytics
- `GET /analytics/customers` - Customer analytics

### Settings
- `GET /settings` - Get all settings
- `GET /settings/:key` - Get setting by key
- `PUT /settings/:key/update` - Update setting

### Media
- `POST /media/upload` - Upload single image
- `POST /media/upload/multiple` - Upload multiple images
- `DELETE /media/:publicId` - Delete image

### WhatsApp
- `GET /whatsapp/webhook` - Webhook verification
- `POST /whatsapp/webhook` - Receive messages
- `POST /whatsapp/send/text` - Send text message
- `POST /whatsapp/send/template` - Send template message
- `POST /whatsapp/send/buttons` - Send interactive buttons
- `POST /whatsapp/send/list` - Send interactive list

## Chatbot Flow

The chatbot uses a state-based flow engine:

1. **main_menu** - Entry point with options
2. **browsing** - Browse product categories
3. **product_detail** - View product details
4. **cart** - Shopping cart management
5. **checkout** - Address and payment selection
6. **order_tracking** - View order status
7. **faq** - Frequently asked questions
8. **support** - Human support handoff

## WhatsApp Webhook Setup

1. Set up a public URL (ngrok for development):
   ```bash
   ngrok http 3000
   ```

2. Configure webhook URL in Meta Developer Console:
   - Webhook URL: `https://your-domain.com/api/v1/whatsapp/webhook`
   - Verify Token: Your `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

3. Subscribe to these webhook fields:
   - messages
   - message_deliveries
   - message_reads

## Production Deployment

### Backend
```bash
cd backend
npm run build
npm run start:prod
```

### Frontend
```bash
cd frontend
npm run build
npm run start
```

### Environment Variables for Production

Make sure to set secure values for:
- `JWT_SECRET` - Use a strong random string
- `FRONTEND_URL` - Your production frontend URL
- `NODE_ENV=production`

## Troubleshooting

### CORS Issues
Ensure `FRONTEND_URL` in backend `.env` matches your frontend URL exactly.

### MongoDB Connection
Check that MongoDB is running and the `MONGODB_URI` is correct.

### Redis Connection
Ensure Redis is running for the queue system to work.

### Image Uploads
Verify Cloudinary credentials are correct.

## License

MIT
