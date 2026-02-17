"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAQ_RESPONSES = exports.CHATBOT_FLOWS = void 0;
exports.CHATBOT_FLOWS = {
    main_menu: {
        state: 'main_menu',
        action: {
            type: 'buttons',
            content: '👋 Welcome to our store! How can I help you today?',
            buttons: [
                { id: 'browse', title: '🛍️ Browse Products' },
                { id: 'cart', title: '🛒 My Cart' },
                { id: 'orders', title: '📦 My Orders' },
            ],
        },
        transitions: {
            browse: 'browsing',
            cart: 'cart',
            orders: 'order_tracking',
            reorder: 'reorder',
            help: 'faq',
            support: 'support',
        },
    },
    browsing: {
        state: 'browsing',
        action: {
            type: 'list',
            content: 'Please select a category to browse:',
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
                { id: 'add_cart', title: '🛒 Add to Cart' },
                { id: 'buy_now', title: '💳 Buy Now' },
                { id: 'back', title: '⬅️ Back' },
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
                { id: 'checkout', title: '💳 Checkout' },
                { id: 'continue', title: '🛍️ Continue Shopping' },
                { id: 'clear', title: '🗑️ Clear Cart' },
            ],
        },
        transitions: {
            checkout: 'checkout',
            continue: 'browsing',
            clear: 'cart',
            back: 'main_menu',
        },
    },
    checkout: {
        state: 'checkout',
        action: {
            type: 'buttons',
            content: 'Please select a delivery address:',
            buttons: [
                { id: 'address_1', title: 'Home' },
                { id: 'new_address', title: '➕ New Address' },
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
            content: 'Please enter your delivery address in the following format:\n\nName\nStreet Address\nCity, State\nPincode\nLandmark (optional)',
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
            content: '💳 Select payment method:',
            buttons: [
                { id: 'cod', title: '💵 Cash on Delivery' },
                { id: 'prepaid', title: '💳 Pay Online' },
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
            content: '📦 Your recent orders:',
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
            content: 'Would you like to reorder the same items?',
            buttons: [
                { id: 'confirm', title: '✅ Yes, Reorder' },
                { id: 'modify', title: '✏️ Modify Items' },
                { id: 'cancel', title: '❌ Cancel' },
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
            content: 'Frequently Asked Questions:',
            sections: [
                {
                    title: 'Common Questions',
                    rows: [
                        { id: 'faq_shipping', title: 'Shipping Info', description: 'Delivery times and costs' },
                        { id: 'faq_returns', title: 'Returns Policy', description: 'How to return items' },
                        { id: 'faq_payment', title: 'Payment Options', description: 'Available payment methods' },
                        { id: 'faq_contact', title: 'Contact Us', description: 'Get in touch' },
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
            content: '🙋 You are now connected to our support team. Please describe your issue and we will get back to you shortly.\n\nType "menu" to return to the main menu.',
        },
        transitions: {
            menu: 'main_menu',
        },
    },
    awaiting_input: {
        state: 'awaiting_input',
        action: {
            type: 'text',
            content: '',
        },
        transitions: {
            back: 'main_menu',
        },
    },
};
exports.FAQ_RESPONSES = {
    faq_shipping: '🚚 *Shipping Information*\n\n• Free shipping on orders above ₹500\n• Standard delivery: 3-5 business days\n• Express delivery: 1-2 business days (additional charges apply)\n• We deliver across India',
    faq_returns: '↩️ *Returns Policy*\n\n• Returns accepted within 7 days of delivery\n• Items must be unused and in original packaging\n• Refunds processed within 5-7 business days\n• Contact support to initiate a return',
    faq_payment: '💳 *Payment Options*\n\n• Cash on Delivery (COD)\n• UPI (PhonePe, Google Pay, Paytm)\n• Credit/Debit Cards\n• Net Banking\n• Wallets',
    faq_contact: '📞 *Contact Us*\n\n• WhatsApp: +91 XXXXXXXXXX\n• Email: support@store.com\n• Hours: Mon-Sat, 9 AM - 6 PM',
};
//# sourceMappingURL=chatbot.flows.js.map