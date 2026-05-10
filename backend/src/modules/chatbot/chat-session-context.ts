export type ChatListPageKey = 'categoryPage' | 'productPage' | 'ordersPage';

export interface ChatCheckoutAddressDraft {
  name: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
}

export interface ChatSessionContext {
  categoryPage?: number;
  productPage?: number;
  ordersPage?: number;
  selectedAddressIndex?: number;
  newAddress?: ChatCheckoutAddressDraft;
  allowAnotherOrderOnce?: boolean;
  checkoutCouponCode?: string;
  /** Where to return after applying a coupon from coupon_prompt. */
  couponFlowTarget?: 'cart' | 'checkout';
  /** Which profile field the user is editing (name / email). */
  editingField?: string;
  /** Address index being edited in account_address_edit state. */
  editingAddressIndex?: number;
  /** Suggested coupon code offered on coupon_prompt (stored so apply can use it). */
  suggestedCoupon?: string;
  /** Cart item being managed via the per-item action card. Identified by
   *  productId + variantSku (not array index) so concurrent cart mutations
   *  in another session don't shift the action onto a different item. */
  manageCartItem?: { productId: string; variantSku?: string };
  /**
   * Last WhatsApp catalog `order` webhook messageId we processed. Used to
   * short-circuit duplicate redeliveries (360dialog/Meta retry on network
   * blips), which would otherwise wipe the cart and any applied coupon.
   */
  lastCatalogOrderMessageId?: string;
  /**
   * Epoch ms when a chatbot checkout (order create + pay link) acquired its
   * lock. Set atomically before order creation; cleared after the order is
   * persisted. Prevents a fast double-tap on the "UPI / Card" button from
   * placing two orders.
   */
  checkoutLockedAt?: number;
}

export function mergeChatContext(
  base: ChatSessionContext | undefined,
  patch: Partial<ChatSessionContext>,
): ChatSessionContext {
  return { ...(base ?? {}), ...patch };
}
