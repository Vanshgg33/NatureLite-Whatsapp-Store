export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
}

export interface DatabaseConfig {
  uri: string;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
}

export interface WhatsAppConfig {
  apiUrl: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  webhookVerifyToken: string;
  appSecret: string;
}

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export interface ThrottleConfig {
  ttl: number;
  limit: number;
}

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export interface InteraktConfig {
  apiKey: string;
}

export interface RazorpayXConfig {
  accountNumber: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface Configuration {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  whatsapp: WhatsAppConfig;
  cloudinary: CloudinaryConfig;
  throttle: ThrottleConfig;
  razorpay: RazorpayConfig;
  interakt?: InteraktConfig;
  razorpayX?: RazorpayXConfig;
  smtp: SmtpConfig;
  frontendUrl: string;
}

export default (): Configuration => ({
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    apiPrefix: process.env.API_PREFIX || 'api/v1',
  },
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-store',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },
  razorpay: {
  keyId: process.env.RAZORPAY_KEY_ID || process.env.razorpay_key || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || process.env.razorpay_secret || '',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  interakt: {
  apiKey: process.env.INTERAKT_API_KEY || process.env.interakt_api_key || '',
  },
  razorpayX: {
  accountNumber: process.env.RAZORPAYX_ACCOUNT_NUMBER || process.env.razorpayX_account_number || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Naturelite Store <noreply@naturelite.com>',
  },
  // Frontend URL used for CORS/CSRF checks. Must be set explicitly in env.
  frontendUrl: process.env.FRONTEND_URL || '',
});
