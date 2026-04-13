import { SessionState } from './schemas/chat-session.schema';

export interface FlowAction {
  type: 'text' | 'buttons' | 'list' | 'template';
  content: string;
  buttons?: Array<{ id: string; title: string }>;
  sections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
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
      type: 'list',
      content:
        `Welcome to *O+ Connect* \u2728\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `How can we help you today?\n\n` +
        `_Type *menu* anytime to return here._`,
      sections: [
        {
          title: 'What would you like to do?',
          rows: [
            { id: 'browse', title: 'Browse Products', description: 'Explore categories & discover items' },
            { id: 'cart', title: 'My Cart', description: 'Review items & proceed to checkout' },
            { id: 'orders', title: 'My Orders', description: 'Track status & reorder favourites' },
            { id: 'account', title: 'My Account', description: 'Profile, addresses & wallet' },
            { id: 'help', title: 'Help & FAQ', description: 'Shipping, returns & support' },
          ],
        },
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
      content:
        `*Browse Products*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Select a category to explore our collection.`,
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
      content: '',
      buttons: [
        { id: 'add_cart', title: 'Add to Cart' },
        { id: 'buy_now', title: 'Buy Now' },
        { id: 'back', title: 'Back' },
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
      content: '',
      buttons: [
        { id: 'checkout', title: 'Checkout' },
        { id: 'remove', title: 'Remove Item' },
        { id: 'clear', title: 'Clear Cart' },
      ],
    },
    transitions: {
      checkout: 'checkout',
      continue: 'browsing',
      clear: 'cart',
      back: 'main_menu',
    },
  },
  coupon_prompt: {
    state: 'coupon_prompt',
    action: {
      type: 'buttons',
      content:
        `*Apply a Coupon?*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Have a discount code? Apply it now to save on your order.`,
      buttons: [
        { id: 'coupon_yes', title: 'Yes, Apply' },
        { id: 'coupon_no', title: 'No, Continue' },
        { id: 'back', title: 'Back' },
      ],
    },
    transitions: {
      coupon_yes: 'coupon_input',
      coupon_no: 'checkout',
      back: 'cart',
    },
  },
  coupon_input: {
    state: 'coupon_input',
    action: {
      type: 'buttons',
      content:
        `*Enter Coupon Code*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Type your coupon code below\n` +
        `_e.g. SAVE50, WELCOME10_`,
      buttons: [
        { id: 'skip_coupon', title: 'Skip' },
        { id: 'remove_coupon', title: 'Remove Coupon' },
        { id: 'back', title: 'Back' },
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
      content:
        `*Delivery Address*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Select a saved address or add a new one.`,
      buttons: [
        { id: 'address_1', title: 'Home' },
        { id: 'new_address', title: 'New Address' },
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
        `*New Address*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Please send your address in this format:\n\n` +
        `Name\n` +
        `Street Address\n` +
        `City, State\n` +
        `Pincode\n` +
        `Landmark _(optional)_`,
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
      content:
        `*Payment Method*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `How would you like to pay?`,
      buttons: [
        { id: 'cod', title: 'Cash on Delivery' },
        { id: 'prepaid', title: 'Pay Online' },
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
      content:
        `*My Orders*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Select an order to view details or reorder.`,
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
      content:
        `*Reorder*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Add the same items from your previous order to your cart?`,
      buttons: [
        { id: 'confirm', title: 'Yes, Reorder' },
        { id: 'modify', title: 'Modify Items' },
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
      content:
        `*Help & FAQ*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Browse common questions or reach out to our team.`,
      sections: [
        {
          title: 'Frequently Asked Questions',
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
        `*Live Support*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Please describe your issue below and our team will respond shortly.\n\n` +
        `_Type *menu* anytime to return to the main menu._`,
    },
    transitions: {
      menu: 'main_menu',
    },
  },
  account: {
    state: 'account',
    action: {
      type: 'buttons',
      content: '',
      buttons: [
        { id: 'edit_profile', title: 'Edit Profile' },
        { id: 'addresses', title: 'My Addresses' },
        { id: 'wallet', title: 'Wallet' },
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
      content: '',
      buttons: [
        { id: 'edit_name', title: 'Change Name' },
        { id: 'edit_email', title: 'Change Email' },
        { id: 'back', title: 'Back' },
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
      content:
        `*My Addresses*\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
        `Tap an address to manage it, or add a new one.`,
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
      content: '',
      buttons: [
        { id: 'set_default', title: 'Set as Default' },
        { id: 'delete_address', title: 'Delete' },
        { id: 'back', title: 'Back' },
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
      content: '',
      buttons: [
        { id: 'wallet_history', title: 'Transactions' },
        { id: 'back', title: 'Back' },
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
    `*Shipping & Delivery*\n` +
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
    `\u2022 Free shipping on orders above *\u20B9500*\n` +
    `\u2022 Standard delivery \u2014 *3\u20135 business days*\n` +
    `\u2022 Express delivery \u2014 *1\u20132 business days*\n` +
    `\u2022 Pan-India coverage`,
  faq_returns:
    `*Returns & Refunds*\n` +
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
    `\u2022 Returns accepted within *7 days* of delivery\n` +
    `\u2022 Items must be unused & in original packaging\n` +
    `\u2022 Refunds processed within *5\u20137 business days*\n` +
    `\u2022 Contact support to initiate a return`,
  faq_payment:
    `*Payment Methods*\n` +
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
    `\u2022 Cash on Delivery (COD)\n` +
    `\u2022 UPI \u2014 PhonePe, Google Pay, Paytm\n` +
    `\u2022 Credit & Debit Cards\n` +
    `\u2022 Net Banking\n` +
    `\u2022 Digital Wallets`,
  faq_contact:
    `*Contact Us*\n` +
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n` +
    `\u2022 WhatsApp \u2014 +91 XXXXXXXXXX\n` +
    `\u2022 Email \u2014 support@store.com\n` +
    `\u2022 Hours \u2014 Mon\u2013Sat, 9 AM \u2013 6 PM`,
};
