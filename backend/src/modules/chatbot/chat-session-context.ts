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
  /** Which profile field the user is editing (name / email). */
  editingField?: string;
  /** Address index being edited in account_address_edit state. */
  editingAddressIndex?: number;
  /** True after the cart-edit tip has been shown once in this session. */
  cartTipSeen?: boolean;
  /** Suggested coupon code offered on coupon_prompt (stored so apply can use it). */
  suggestedCoupon?: string;
  /**
   * Last WhatsApp catalog `order` webhook messageId we processed. Used to
   * short-circuit duplicate redeliveries (360dialog/Meta retry on network
   * blips), which would otherwise wipe the cart and any applied coupon.
   */
  lastCatalogOrderMessageId?: string;
}

export function mergeChatContext(
  base: ChatSessionContext | undefined,
  patch: Partial<ChatSessionContext>,
): ChatSessionContext {
  return { ...(base ?? {}), ...patch };
}
