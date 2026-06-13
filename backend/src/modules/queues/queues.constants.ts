export const QUEUE_EMAIL = 'email';
export const QUEUE_NOTIFICATIONS = 'notifications';
export const QUEUE_ANALYTICS = 'analytics';
export const QUEUE_CART_AUTOMATION = 'cart-automation';
export const QUEUE_ADMIN = 'admin';

export const EMAIL_JOBS = {
  ORDER_CONFIRMATION: 'order-confirmation',
  SHIPPING_UPDATE: 'shipping-update',
  DELIVERY_CONFIRMATION: 'delivery-confirmation',
  ORDER_CANCELLED: 'order-cancelled',
  ADMIN_REPORT: 'admin-report',
} as const;

export const NOTIFICATION_JOBS = {
  // Text notifications (via sendNotification → sendTextMessage)
  ORDER_CREATED: 'order-created',
  ORDER_STATUS_CHANGED: 'order-status-changed',
  ORDER_DELIVERED: 'order-delivered',
  // Interactive button notifications (via sendInteractiveButtons)
  ORDER_CONFIRMED_BTN: 'order-confirmed-btn',
  ORDER_PACKED_BTN: 'order-packed-btn',
  OUT_FOR_DELIVERY_BTN: 'out-for-delivery-btn',
  DELIVERY_ATTEMPT_BTN: 'delivery-attempt-btn',
  PAYMENT_RECEIVED_BTN: 'payment-received-btn',
  // Template notifications
  ORDER_CONFIRMATION_TPL: 'order-confirmation-tpl',
  SHIPPING_UPDATE_TPL: 'shipping-update-tpl',
  OUT_FOR_DELIVERY_TPL: 'out-for-delivery-tpl',
  DELIVERY_CONFIRMATION_TPL: 'delivery-confirmation-tpl',
  // Other
  FEEDBACK_REQUEST: 'feedback-request',
  ORDER_CANCELLED: 'order-cancelled',
  ABANDONED_CART: 'abandoned-cart',
  ABANDONED_CART_DETAILED: 'abandoned-cart-detailed',
  BROADCAST_TEMPLATE: 'broadcast-template',
  BROADCAST_MEDIA: 'broadcast-media',
} as const;

export const ANALYTICS_JOBS = {
  DAILY_SNAPSHOT: 'daily-snapshot',
  WEEKLY_SNAPSHOT: 'weekly-snapshot',
  MONTHLY_SNAPSHOT: 'monthly-snapshot',
} as const;

export const ADMIN_JOBS = {
  DAILY_BRIEFING: 'daily-briefing',
} as const;

export const QUEUE_CHATBOT = 'chatbot';

export const CHATBOT_JOBS = {
  CHAT_QUERY: 'chat-query',
} as const;

export const CART_JOBS = {
  SEND_REMINDER: 'send-reminder',
} as const;

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};
