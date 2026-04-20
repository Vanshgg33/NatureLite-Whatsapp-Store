import { SessionState } from './schemas/chat-session.schema';
import { BTN } from './buttons';

export interface FlowAction {
  type: 'text' | 'buttons' | 'list' | 'template';
  /** Native WhatsApp interactive header (max 60 chars). */
  header?: string;
  /** Body text. */
  content: string;
  /** Native WhatsApp interactive footer (max 60 chars). */
  footer?: string;
  buttons?: Array<{ id: string; title: string }>;
  sections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
  /** Label on the List CTA (max 20 chars). */
  buttonText?: string;
  templateName?: string;
  templateParams?: string[];
}

export interface FlowStep {
  state: SessionState;
  action: FlowAction;
  transitions: Record<string, SessionState | { state: SessionState; action?: string }>;
}

export const CHATBOT_FLOWS: Record<SessionState, FlowStep> = {
  main_menu: {
    state: 'main_menu',
    action: {
      type: 'buttons',
      header: 'NatureLite Foods',
      content:
        `Hey there \uD83D\uDC4B\n` +
        `What are you in the mood for today?\n\n` +
        `Quick access: *orders* \u00B7 *account* \u00B7 *help*`,
      footer: 'Type menu anytime',
      buttons: [
        { id: BTN.BROWSE, title: '\uD83D\uDECD Shop Now' },
        { id: BTN.CART, title: '\uD83D\uDED2 My Cart' },
        { id: BTN.ORDERS, title: '\uD83D\uDCE6 Track Order' },
      ],
    },
    transitions: {
      browse: 'browsing',
      cart: 'cart',
      orders: 'order_tracking',
      account: 'account',
      reorder: 'reorder',
      help: 'faq',
      support: 'support',
    },
  },
  browsing: {
    state: 'browsing',
    action: {
      type: 'list',
      header: 'Shop by category',
      content: 'Pick a category to explore our collection.',
      buttonText: 'View categories',
      sections: [],
    },
    transitions: {
      back: 'main_menu',
      select: 'product_detail',
    },
  },
  product_detail: {
    state: 'product_detail',
    action: {
      type: 'buttons',
      content: 'Ready to add this to your cart?',
      buttons: [
        { id: BTN.ADD_CART, title: '\uD83D\uDED2 Add to Cart' },
        { id: BTN.BUY_NOW, title: '\u26A1 Buy Now' },
        { id: BTN.BACK, title: '\u21A9 More products' },
      ],
    },
    transitions: {
      add_cart: 'cart',
      buy_now: 'checkout',
      back: 'browsing',
    },
  },
  cart: {
    state: 'cart',
    action: {
      type: 'buttons',
      content: 'Your cart \u2014 what next?',
      buttons: [
        { id: BTN.CHECKOUT, title: '\u2705 Checkout' },
        { id: BTN.MANAGE_CART, title: '\u270F\uFE0F Manage' },
        { id: BTN.KEEP_SHOPPING, title: '\u2795 Add More' },
      ],
    },
    transitions: {
      checkout: 'checkout',
      manage: 'cart',
      continue: 'browsing',
      clear: 'cart',
      back: 'main_menu',
    },
  },
  coupon_prompt: {
    state: 'coupon_prompt',
    action: {
      type: 'buttons',
      content: 'Got a promo code? Enter it now, or continue to payment.',
      buttons: [
        { id: BTN.COUPON_CUSTOM, title: '\uD83C\uDFF7 Enter code' },
        { id: BTN.COUPON_SKIP, title: 'Skip' },
        { id: BTN.BACK, title: '\u21A9 Back' },
      ],
    },
    transitions: {
      coupon_yes: 'coupon_input',
      coupon_apply_suggested: 'checkout',
      coupon_custom: 'coupon_input',
      coupon_no: 'checkout',
      skip_coupon: 'checkout',
      back: 'cart',
    },
  },
  coupon_input: {
    state: 'coupon_input',
    action: {
      type: 'buttons',
      header: 'Enter coupon code',
      content:
        `Type your code below.\n` +
        `_e.g. SAVE50, WELCOME10_`,
      buttons: [
        { id: BTN.COUPON_SKIP, title: 'Skip' },
        { id: BTN.COUPON_REMOVE, title: 'Remove coupon' },
        { id: BTN.BACK, title: '\u21A9 Back' },
      ],
    },
    transitions: {
      skip_coupon: 'checkout',
      remove_coupon: 'coupon_prompt',
      back: 'coupon_prompt',
    },
  },
  checkout: {
    state: 'checkout',
    action: {
      type: 'buttons',
      header: 'Deliver to',
      content: 'Select a saved address or add a new one.',
      buttons: [
        { id: 'address_0', title: 'Home' },
        { id: BTN.ADD_NEW_ADDRESS, title: '\u2795 New address' },
        { id: BTN.BACK, title: '\u21A9 Back' },
      ],
    },
    transitions: {
      address: 'payment_selection',
      new_address: 'address_input',
      back: 'cart',
    },
  },
  address_input: {
    state: 'address_input',
    action: {
      type: 'text',
      content:
        `*New address*\n\n` +
        `Send it in this format (one line each):\n\n` +
        `Full name\n` +
        `House / flat no, street\n` +
        `City, State\n` +
        `6-digit pincode\n` +
        `_Landmark (optional)_`,
    },
    transitions: {
      submit: 'payment_selection',
      back: 'checkout',
    },
  },
  payment_selection: {
    state: 'payment_selection',
    action: {
      type: 'buttons',
      header: 'Payment',
      content: 'How would you like to pay?',
      footer: 'Secure payment \u00B7 Razorpay',
      buttons: [
        { id: BTN.PREPAID, title: '\u26A1 UPI / Card' },
        { id: BTN.COD, title: '\uD83D\uDCB5 Cash on Delivery' },
        { id: BTN.BACK, title: '\u21A9 Change' },
      ],
    },
    transitions: {
      cod: 'main_menu',
      prepaid: 'main_menu',
      back: 'checkout',
    },
  },
  order_tracking: {
    state: 'order_tracking',
    action: {
      type: 'list',
      header: 'My orders',
      content: 'Select an order to view details or reorder.',
      buttonText: 'View orders',
      sections: [],
    },
    transitions: {
      back: 'main_menu',
      reorder: 'reorder',
    },
  },
  reorder: {
    state: 'reorder',
    action: {
      type: 'buttons',
      header: 'Reorder',
      content: 'Add the same items from your previous order to your cart?',
      buttons: [
        { id: 'confirm', title: '\u2705 Yes, reorder' },
        { id: 'modify', title: '\u270F\uFE0F Modify' },
        { id: 'cancel', title: 'Cancel' },
      ],
    },
    transitions: {
      confirm: 'checkout',
      modify: 'cart',
      cancel: 'main_menu',
    },
  },
  faq: {
    state: 'faq',
    action: {
      type: 'list',
      header: 'Help & FAQ',
      content: 'Browse common questions or reach out to our team.',
      buttonText: 'Browse topics',
      sections: [
        {
          title: 'Common questions',
          rows: [
            { id: 'faq_shipping', title: 'Shipping & Delivery', description: 'Delivery times, costs & coverage' },
            { id: 'faq_returns', title: 'Returns & Refunds', description: 'Return policy & refund timelines' },
            { id: 'faq_payment', title: 'Payment Methods', description: 'All accepted payment options' },
            { id: 'faq_contact', title: 'Contact Us', description: 'Reach our support team' },
          ],
        },
      ],
    },
    transitions: {
      back: 'main_menu',
      support: 'support',
    },
  },
  support: {
    state: 'support',
    action: {
      type: 'text',
      content:
        `*Live support*\n\n` +
        `Describe your issue below and our team will respond shortly.\n\n` +
        `_Type *menu* anytime to return._`,
    },
    transitions: {
      menu: 'main_menu',
    },
  },
  account: {
    state: 'account',
    action: {
      type: 'buttons',
      header: 'Your account',
      content: 'What would you like to manage?',
      buttons: [
        { id: 'edit_profile', title: '\uD83D\uDC64 Edit profile' },
        { id: 'addresses', title: '\uD83D\uDCCD Addresses' },
        { id: 'wallet', title: '\uD83D\uDCB3 Wallet' },
      ],
    },
    transitions: {
      edit_profile: 'account_edit',
      addresses: 'account_addresses',
      wallet: 'wallet',
      back: 'main_menu',
    },
  },
  account_edit: {
    state: 'account_edit',
    action: {
      type: 'buttons',
      content: 'What would you like to update?',
      buttons: [
        { id: 'edit_name', title: 'Change name' },
        { id: 'edit_email', title: 'Change email' },
        { id: BTN.BACK, title: '\u21A9 Back' },
      ],
    },
    transitions: {
      edit_name: 'account_edit',
      edit_email: 'account_edit',
      back: 'account',
    },
  },
  account_addresses: {
    state: 'account_addresses',
    action: {
      type: 'list',
      header: 'My addresses',
      content: 'Tap an address to manage it, or add a new one.',
      buttonText: 'View addresses',
      sections: [],
    },
    transitions: {
      add_address: 'address_input',
      back: 'account',
    },
  },
  account_address_edit: {
    state: 'account_address_edit',
    action: {
      type: 'buttons',
      content: 'What would you like to do with this address?',
      buttons: [
        { id: 'set_default', title: 'Set as default' },
        { id: 'delete_address', title: 'Delete' },
        { id: BTN.BACK, title: '\u21A9 Back' },
      ],
    },
    transitions: {
      set_default: 'account_addresses',
      delete_address: 'account_addresses',
      back: 'account_addresses',
    },
  },
  wallet: {
    state: 'wallet',
    action: {
      type: 'buttons',
      header: 'Your wallet',
      content: 'Rewards and credits \u2014 applied automatically at checkout.',
      buttons: [
        { id: 'wallet_history', title: 'Transactions' },
        { id: BTN.BACK, title: '\u21A9 Back' },
      ],
    },
    transitions: {
      wallet_history: 'wallet',
      back: 'account',
    },
  },
};

export const FAQ_RESPONSES: Record<string, string> = {
  faq_shipping:
    `*Shipping & Delivery*\n\n` +
    `\u2022 Free shipping on orders above *\u20B9500*\n` +
    `\u2022 Standard delivery \u2014 *3\u20135 business days*\n` +
    `\u2022 Express delivery \u2014 *1\u20132 business days*\n` +
    `\u2022 Pan-India coverage`,
  faq_returns:
    `*Returns & Refunds*\n\n` +
    `\u2022 Returns accepted within *7 days* of delivery\n` +
    `\u2022 Items must be unused & in original packaging\n` +
    `\u2022 Refunds processed within *5\u20137 business days*\n` +
    `\u2022 Contact support to initiate a return`,
  faq_payment:
    `*Payment Methods*\n\n` +
    `\u2022 Cash on Delivery (COD)\n` +
    `\u2022 UPI \u2014 PhonePe, Google Pay, Paytm\n` +
    `\u2022 Credit & Debit Cards\n` +
    `\u2022 Net Banking\n` +
    `\u2022 Digital Wallets`,
  faq_contact:
    `*Contact Us*\n\n` +
    `\u2022 WhatsApp \u2014 +91 XXXXXXXXXX\n` +
    `\u2022 Email \u2014 support@store.com\n` +
    `\u2022 Hours \u2014 Mon\u2013Sat, 9 AM \u2013 6 PM`,
};
