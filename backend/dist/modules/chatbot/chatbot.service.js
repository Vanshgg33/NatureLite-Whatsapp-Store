"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ChatbotService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatbotService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const schedule_1 = require("@nestjs/schedule");
const mongoose_2 = require("mongoose");
const chat_session_schema_1 = require("./schemas/chat-session.schema");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const users_service_1 = require("../users/users.service");
const products_service_1 = require("../products/products.service");
const categories_service_1 = require("../categories/categories.service");
const cart_service_1 = require("../cart/cart.service");
const orders_service_1 = require("../orders/orders.service");
const chatbot_flows_1 = require("./chatbot.flows");
let ChatbotService = ChatbotService_1 = class ChatbotService {
    constructor(chatSessionModel, whatsappService, usersService, productsService, categoriesService, cartService, ordersService) {
        this.chatSessionModel = chatSessionModel;
        this.whatsappService = whatsappService;
        this.usersService = usersService;
        this.productsService = productsService;
        this.categoriesService = categoriesService;
        this.cartService = cartService;
        this.ordersService = ordersService;
        this.logger = new common_1.Logger(ChatbotService_1.name);
    }
    async handleMessage(message) {
        try {
            const session = await this.getOrCreateSession(message.phone);
            if (session.isHandedOffToSupport) {
                return;
            }
            await this.updateSessionActivity(session._id.toString());
            const inputText = this.extractInputText(message);
            if (this.isMenuCommand(inputText)) {
                await this.transitionToState(session, 'main_menu');
                await this.sendFlowResponse(message.phone, 'main_menu', session);
                return;
            }
            await this.processInput(session, message, inputText);
        }
        catch (error) {
            this.logger.error('Error handling message', error);
            await this.whatsappService.sendTextMessage({
                phone: message.phone,
                message: 'Sorry, something went wrong. Please type "menu" to start over.',
            });
        }
    }
    async processInput(session, message, inputText) {
        const currentState = session.currentState;
        const flow = chatbot_flows_1.CHATBOT_FLOWS[currentState];
        const buttonId = message.content.buttonId || message.content.listId;
        const transitionKey = buttonId || this.normalizeInput(inputText);
        switch (currentState) {
            case 'main_menu':
                await this.handleMainMenu(session, message.phone, transitionKey);
                break;
            case 'browsing':
                await this.handleBrowsing(session, message.phone, transitionKey);
                break;
            case 'product_detail':
                await this.handleProductDetail(session, message.phone, transitionKey);
                break;
            case 'cart':
                await this.handleCart(session, message.phone, transitionKey);
                break;
            case 'checkout':
                await this.handleCheckout(session, message.phone, transitionKey);
                break;
            case 'address_input':
                await this.handleAddressInput(session, message.phone, inputText);
                break;
            case 'payment_selection':
                await this.handlePaymentSelection(session, message.phone, transitionKey);
                break;
            case 'order_tracking':
                await this.handleOrderTracking(session, message.phone, transitionKey);
                break;
            case 'reorder':
                await this.handleReorder(session, message.phone, transitionKey);
                break;
            case 'faq':
                await this.handleFaq(session, message.phone, transitionKey);
                break;
            case 'support':
                await this.handleSupport(session, message.phone, inputText);
                break;
            default:
                await this.transitionToState(session, 'main_menu');
                await this.sendFlowResponse(message.phone, 'main_menu', session);
        }
    }
    async handleMainMenu(session, phone, input) {
        switch (input) {
            case 'browse':
                await this.transitionToState(session, 'browsing');
                await this.sendCategoryList(phone, session);
                break;
            case 'cart':
                await this.transitionToState(session, 'cart');
                await this.sendCartSummary(phone, session);
                break;
            case 'orders':
                await this.transitionToState(session, 'order_tracking');
                await this.sendOrdersList(phone, session);
                break;
            case 'help':
            case 'faq':
                await this.transitionToState(session, 'faq');
                await this.sendFlowResponse(phone, 'faq', session);
                break;
            case 'support':
                await this.transitionToState(session, 'support');
                await this.sendFlowResponse(phone, 'support', session);
                break;
            default:
                await this.sendFlowResponse(phone, 'main_menu', session);
        }
    }
    async handleBrowsing(session, phone, input) {
        if (input === 'back') {
            await this.transitionToState(session, 'main_menu');
            await this.sendFlowResponse(phone, 'main_menu', session);
            return;
        }
        if (input.startsWith('cat_')) {
            const categoryId = input.replace('cat_', '');
            session.currentCategoryId = categoryId;
            await session.save();
            await this.sendProductList(phone, categoryId, session);
            return;
        }
        if (input.startsWith('prod_')) {
            const productId = input.replace('prod_', '');
            session.currentProductId = productId;
            await this.transitionToState(session, 'product_detail');
            await this.sendProductDetail(phone, productId, session);
            return;
        }
        await this.sendCategoryList(phone, session);
    }
    async handleProductDetail(session, phone, input) {
        if (input === 'back') {
            await this.transitionToState(session, 'browsing');
            if (session.currentCategoryId) {
                await this.sendProductList(phone, session.currentCategoryId, session);
            }
            else {
                await this.sendCategoryList(phone, session);
            }
            return;
        }
        if (input === 'add_cart' && session.currentProductId && session.user) {
            await this.cartService.addItem(session.user.toString(), {
                productId: session.currentProductId,
                quantity: 1,
            });
            await this.whatsappService.sendTextMessage({
                phone,
                message: '✅ Item added to cart!',
            });
            await this.sendCartSummary(phone, session);
            await this.transitionToState(session, 'cart');
            return;
        }
        if (input === 'buy_now' && session.currentProductId && session.user) {
            await this.cartService.clearCart(session.user.toString());
            await this.cartService.addItem(session.user.toString(), {
                productId: session.currentProductId,
                quantity: 1,
            });
            await this.transitionToState(session, 'checkout');
            await this.sendCheckoutOptions(phone, session);
            return;
        }
        await this.sendProductDetail(phone, session.currentProductId || '', session);
    }
    async handleCart(session, phone, input) {
        if (!session.user) {
            await this.whatsappService.sendTextMessage({
                phone,
                message: 'Please register first to use the cart.',
            });
            return;
        }
        if (input === 'checkout') {
            await this.transitionToState(session, 'checkout');
            await this.sendCheckoutOptions(phone, session);
            return;
        }
        if (input === 'continue') {
            await this.transitionToState(session, 'browsing');
            await this.sendCategoryList(phone, session);
            return;
        }
        if (input === 'clear') {
            await this.cartService.clearCart(session.user.toString());
            await this.whatsappService.sendTextMessage({
                phone,
                message: '🗑️ Cart cleared!',
            });
            await this.transitionToState(session, 'main_menu');
            await this.sendFlowResponse(phone, 'main_menu', session);
            return;
        }
        if (input === 'back') {
            await this.transitionToState(session, 'main_menu');
            await this.sendFlowResponse(phone, 'main_menu', session);
            return;
        }
        await this.sendCartSummary(phone, session);
    }
    async handleCheckout(session, phone, input) {
        if (input === 'back') {
            await this.transitionToState(session, 'cart');
            await this.sendCartSummary(phone, session);
            return;
        }
        if (input === 'new_address') {
            await this.transitionToState(session, 'address_input');
            await this.sendFlowResponse(phone, 'address_input', session);
            return;
        }
        if (input.startsWith('address_')) {
            const addressIndex = parseInt(input.replace('address_', ''), 10);
            session.context = { ...session.context, selectedAddressIndex: addressIndex };
            await session.save();
            await this.transitionToState(session, 'payment_selection');
            await this.sendFlowResponse(phone, 'payment_selection', session);
            return;
        }
        await this.sendCheckoutOptions(phone, session);
    }
    async handleAddressInput(session, phone, input) {
        const lines = input.split('\n').filter((l) => l.trim());
        if (lines.length < 4) {
            await this.whatsappService.sendTextMessage({
                phone,
                message: '❌ Invalid address format. Please enter:\n\nName\nStreet Address\nCity, State\nPincode',
            });
            return;
        }
        if (session.user) {
            const [name, street, cityState, pincode, landmark] = lines;
            const [city, state] = (cityState || '').split(',').map((s) => s.trim());
            await this.usersService.addAddress(session.user.toString(), {
                label: 'Delivery',
                street,
                city: city || '',
                state: state || '',
                pincode: pincode || '',
                landmark,
                isDefault: false,
            });
            session.context = { ...session.context, newAddress: { name, street, city, state, pincode, landmark } };
            await session.save();
        }
        await this.whatsappService.sendTextMessage({
            phone,
            message: '✅ Address saved!',
        });
        await this.transitionToState(session, 'payment_selection');
        await this.sendFlowResponse(phone, 'payment_selection', session);
    }
    async handlePaymentSelection(session, phone, input) {
        if (input === 'back') {
            await this.transitionToState(session, 'checkout');
            await this.sendCheckoutOptions(phone, session);
            return;
        }
        if (!session.user) {
            await this.whatsappService.sendTextMessage({
                phone,
                message: 'Please register to complete your order.',
            });
            return;
        }
        const cart = await this.cartService.getCart(session.user.toString());
        if (cart.items.length === 0) {
            await this.whatsappService.sendTextMessage({
                phone,
                message: '❌ Your cart is empty!',
            });
            await this.transitionToState(session, 'main_menu');
            await this.sendFlowResponse(phone, 'main_menu', session);
            return;
        }
        const user = await this.usersService.findById(session.user.toString());
        const address = user.addresses[0];
        if (!address) {
            await this.whatsappService.sendTextMessage({
                phone,
                message: 'Please add a delivery address first.',
            });
            await this.transitionToState(session, 'address_input');
            await this.sendFlowResponse(phone, 'address_input', session);
            return;
        }
        const paymentMethod = input === 'cod' ? 'cod' : 'prepaid';
        const order = await this.ordersService.create(session.user.toString(), {
            cartId: cart.id,
            shippingAddress: {
                name: user.name || 'Customer',
                phone,
                street: address.street,
                city: address.city,
                state: address.state,
                pincode: address.pincode,
                landmark: address.landmark,
            },
            paymentMethod,
        });
        const message = `🎉 *Order Placed Successfully!*\n\n` +
            `Order #: ${order.orderNumber}\n` +
            `Total: ₹${order.total}\n` +
            `Payment: ${paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'}\n\n` +
            `We'll send you updates on WhatsApp. Thank you for your order!`;
        await this.whatsappService.sendTextMessage({ phone, message });
        await this.transitionToState(session, 'main_menu');
        await this.sendFlowResponse(phone, 'main_menu', session);
    }
    async handleOrderTracking(session, phone, input) {
        if (input === 'back') {
            await this.transitionToState(session, 'main_menu');
            await this.sendFlowResponse(phone, 'main_menu', session);
            return;
        }
        if (input.startsWith('order_')) {
            const orderId = input.replace('order_', '');
            const order = await this.ordersService.findById(orderId);
            const message = `📦 *Order ${order.orderNumber}*\n\n` +
                `Status: ${order.status.toUpperCase()}\n` +
                `Total: ₹${order.total}\n` +
                `Items: ${order.items.length}\n` +
                (order.awbNumber ? `Tracking: ${order.awbNumber}\n` : '') +
                (order.expectedDeliveryDate ? `Expected: ${order.expectedDeliveryDate.toLocaleDateString()}\n` : '');
            await this.whatsappService.sendInteractiveButtons({
                phone,
                bodyText: message,
                buttons: [
                    { id: `reorder_${orderId}`, title: '🔄 Reorder' },
                    { id: 'back', title: '⬅️ Back' },
                ],
            });
            return;
        }
        if (input.startsWith('reorder_')) {
            const orderId = input.replace('reorder_', '');
            session.pendingOrderId = orderId;
            await this.transitionToState(session, 'reorder');
            await this.sendFlowResponse(phone, 'reorder', session);
            return;
        }
        await this.sendOrdersList(phone, session);
    }
    async handleReorder(session, phone, input) {
        if (input === 'cancel' || input === 'back') {
            await this.transitionToState(session, 'main_menu');
            await this.sendFlowResponse(phone, 'main_menu', session);
            return;
        }
        if (input === 'confirm' && session.pendingOrderId && session.user) {
            await this.ordersService.reorder(session.user.toString(), {
                orderId: session.pendingOrderId,
            });
            await this.whatsappService.sendTextMessage({
                phone,
                message: '✅ Items added to cart from your previous order!',
            });
            await this.transitionToState(session, 'checkout');
            await this.sendCheckoutOptions(phone, session);
            return;
        }
        if (input === 'modify' && session.pendingOrderId) {
            await this.transitionToState(session, 'cart');
            await this.sendCartSummary(phone, session);
            return;
        }
        await this.sendFlowResponse(phone, 'reorder', session);
    }
    async handleFaq(session, phone, input) {
        if (input === 'back') {
            await this.transitionToState(session, 'main_menu');
            await this.sendFlowResponse(phone, 'main_menu', session);
            return;
        }
        if (input === 'support') {
            await this.transitionToState(session, 'support');
            await this.sendFlowResponse(phone, 'support', session);
            return;
        }
        const faqResponse = chatbot_flows_1.FAQ_RESPONSES[input];
        if (faqResponse) {
            await this.whatsappService.sendInteractiveButtons({
                phone,
                bodyText: faqResponse,
                buttons: [
                    { id: 'back', title: '⬅️ Back to FAQ' },
                    { id: 'support', title: '🙋 Talk to Support' },
                ],
            });
            return;
        }
        await this.sendFlowResponse(phone, 'faq', session);
    }
    async handleSupport(session, phone, input) {
        if (this.isMenuCommand(input)) {
            session.isHandedOffToSupport = false;
            await session.save();
            await this.transitionToState(session, 'main_menu');
            await this.sendFlowResponse(phone, 'main_menu', session);
            return;
        }
        session.isHandedOffToSupport = true;
        session.supportHandoffAt = new Date();
        await session.save();
        await this.whatsappService.sendTextMessage({
            phone,
            message: '✅ Your message has been received. Our support team will respond shortly.\n\nType "menu" to return to the main menu.',
        });
    }
    async sendCategoryList(phone, session) {
        const categories = await this.categoriesService.findActiveCategories();
        if (categories.length === 0) {
            await this.whatsappService.sendTextMessage({
                phone,
                message: 'No categories available at the moment.',
            });
            return;
        }
        const sections = [{
                title: 'Categories',
                rows: categories.slice(0, 10).map((cat) => ({
                    id: `cat_${cat._id.toString()}`,
                    title: cat.name,
                    description: cat.description?.slice(0, 72),
                })),
            }];
        await this.whatsappService.sendInteractiveList({
            phone,
            bodyText: '🛍️ Browse our categories:',
            buttonText: 'View Categories',
            sections,
        });
    }
    async sendProductList(phone, categoryId, session) {
        const products = await this.productsService.findByCategory(categoryId);
        if (products.length === 0) {
            await this.whatsappService.sendTextMessage({
                phone,
                message: 'No products in this category.',
            });
            return;
        }
        const sections = [{
                title: 'Products',
                rows: products.slice(0, 10).map((prod) => ({
                    id: `prod_${prod._id.toString()}`,
                    title: prod.name.slice(0, 24),
                    description: `₹${prod.price}`.slice(0, 72),
                })),
            }];
        await this.whatsappService.sendInteractiveList({
            phone,
            bodyText: 'Select a product:',
            buttonText: 'View Products',
            sections,
        });
    }
    async sendProductDetail(phone, productId, session) {
        const product = await this.productsService.findById(productId);
        const message = `*${product.name}*\n\n` +
            `${product.description || ''}\n\n` +
            `💰 Price: ₹${product.price}` +
            (product.compareAtPrice ? ` (was ₹${product.compareAtPrice})` : '') +
            `\n📦 Stock: ${product.stock > 0 ? 'In Stock' : 'Out of Stock'}`;
        if (product.images[0]) {
            await this.whatsappService.sendMediaMessage({
                phone,
                mediaType: 'image',
                mediaUrl: product.images[0],
                caption: message,
            });
        }
        await this.whatsappService.sendInteractiveButtons({
            phone,
            bodyText: product.images[0] ? 'What would you like to do?' : message,
            buttons: [
                { id: 'add_cart', title: '🛒 Add to Cart' },
                { id: 'buy_now', title: '💳 Buy Now' },
                { id: 'back', title: '⬅️ Back' },
            ],
        });
    }
    async sendCartSummary(phone, session) {
        if (!session.user) {
            await this.whatsappService.sendTextMessage({
                phone,
                message: '🛒 Your cart is empty. Start shopping!',
            });
            return;
        }
        const cart = await this.cartService.getCart(session.user.toString());
        if (cart.items.length === 0) {
            await this.whatsappService.sendInteractiveButtons({
                phone,
                bodyText: '🛒 Your cart is empty!',
                buttons: [
                    { id: 'continue', title: '🛍️ Start Shopping' },
                    { id: 'back', title: '⬅️ Main Menu' },
                ],
            });
            return;
        }
        const itemList = cart.items
            .map((item) => `• ${item.product.name} x${item.quantity} - ₹${item.total}`)
            .join('\n');
        const message = `🛒 *Your Cart*\n\n${itemList}\n\n` +
            `Subtotal: ₹${cart.subtotal}\n` +
            (cart.discount > 0 ? `Discount: -₹${cart.discount}\n` : '') +
            `*Total: ₹${cart.total}*`;
        await this.whatsappService.sendInteractiveButtons({
            phone,
            bodyText: message,
            buttons: [
                { id: 'checkout', title: '💳 Checkout' },
                { id: 'continue', title: '🛍️ Continue' },
                { id: 'clear', title: '🗑️ Clear Cart' },
            ],
        });
    }
    async sendCheckoutOptions(phone, session) {
        if (!session.user) {
            await this.whatsappService.sendTextMessage({
                phone,
                message: 'Please register to checkout.',
            });
            return;
        }
        const user = await this.usersService.findById(session.user.toString());
        const buttons = [];
        if (user.addresses.length > 0) {
            user.addresses.slice(0, 2).forEach((addr, index) => {
                buttons.push({
                    id: `address_${index}`,
                    title: addr.label.slice(0, 20),
                });
            });
        }
        buttons.push({ id: 'new_address', title: '➕ New Address' });
        await this.whatsappService.sendInteractiveButtons({
            phone,
            bodyText: '📍 Select delivery address:',
            buttons: buttons.slice(0, 3),
        });
    }
    async sendOrdersList(phone, session) {
        if (!session.user) {
            await this.whatsappService.sendTextMessage({
                phone,
                message: 'Please register to view your orders.',
            });
            return;
        }
        const orders = await this.ordersService.findUserOrders(session.user.toString(), 5);
        if (orders.length === 0) {
            await this.whatsappService.sendInteractiveButtons({
                phone,
                bodyText: '📦 You have no orders yet.',
                buttons: [
                    { id: 'back', title: '⬅️ Main Menu' },
                    { id: 'browse', title: '🛍️ Start Shopping' },
                ],
            });
            return;
        }
        const sections = [{
                title: 'Recent Orders',
                rows: orders.map((order) => ({
                    id: `order_${order._id.toString()}`,
                    title: order.orderNumber,
                    description: `${order.status} - ₹${order.total}`,
                })),
            }];
        await this.whatsappService.sendInteractiveList({
            phone,
            bodyText: '📦 Your recent orders:',
            buttonText: 'View Orders',
            sections,
        });
    }
    async sendFlowResponse(phone, state, session) {
        const flow = chatbot_flows_1.CHATBOT_FLOWS[state];
        const action = flow.action;
        switch (action.type) {
            case 'text':
                if (action.content) {
                    await this.whatsappService.sendTextMessage({
                        phone,
                        message: action.content,
                    });
                }
                break;
            case 'buttons':
                if (action.buttons) {
                    await this.whatsappService.sendInteractiveButtons({
                        phone,
                        bodyText: action.content,
                        buttons: action.buttons,
                    });
                }
                break;
            case 'list':
                if (action.sections) {
                    await this.whatsappService.sendInteractiveList({
                        phone,
                        bodyText: action.content,
                        buttonText: 'Select',
                        sections: action.sections,
                    });
                }
                break;
            case 'template':
                if (action.templateName) {
                    await this.whatsappService.sendTemplateMessage({
                        phone,
                        templateName: action.templateName,
                        bodyParams: action.templateParams,
                    });
                }
                break;
        }
    }
    async getOrCreateSession(phone) {
        let session = await this.chatSessionModel.findOne({ phone });
        if (!session) {
            const user = await this.usersService.findOrCreateByPhone(phone);
            session = new this.chatSessionModel({
                phone,
                user: user._id,
                currentState: 'main_menu',
            });
            await session.save();
        }
        return session;
    }
    async transitionToState(session, newState) {
        session.previousState = session.currentState;
        session.currentState = newState;
        await session.save();
    }
    async updateSessionActivity(sessionId) {
        await this.chatSessionModel.updateOne({ _id: new mongoose_2.Types.ObjectId(sessionId) }, {
            $set: { lastMessageAt: new Date() },
            $inc: { messageCount: 1 },
        });
    }
    extractInputText(message) {
        return (message.content.text ||
            message.content.buttonText ||
            message.content.listTitle ||
            '').trim();
    }
    normalizeInput(input) {
        return input.toLowerCase().trim();
    }
    isMenuCommand(input) {
        const normalized = this.normalizeInput(input);
        return ['menu', 'start', 'hi', 'hello', 'hey', '/start', '/menu'].includes(normalized);
    }
    async getSession(phone) {
        return this.chatSessionModel.findOne({ phone });
    }
    async resetSession(phone) {
        await this.chatSessionModel.updateOne({ phone }, {
            $set: {
                currentState: 'main_menu',
                context: {},
                isHandedOffToSupport: false,
            },
        });
    }
    async cleanupExpiredSessions() {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const result = await this.chatSessionModel.updateMany({
            isExpired: { $ne: true },
            lastMessageAt: { $lt: twentyFourHoursAgo },
        }, {
            $set: { isExpired: true },
        });
        if (result.modifiedCount > 0) {
            this.logger.log(`Expired ${result.modifiedCount} chat sessions`);
        }
    }
};
exports.ChatbotService = ChatbotService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChatbotService.prototype, "cleanupExpiredSessions", null);
exports.ChatbotService = ChatbotService = ChatbotService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(chat_session_schema_1.ChatSession.name)),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => whatsapp_service_1.WhatsAppService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        whatsapp_service_1.WhatsAppService,
        users_service_1.UsersService,
        products_service_1.ProductsService,
        categories_service_1.CategoriesService,
        cart_service_1.CartService,
        orders_service_1.OrdersService])
], ChatbotService);
//# sourceMappingURL=chatbot.service.js.map