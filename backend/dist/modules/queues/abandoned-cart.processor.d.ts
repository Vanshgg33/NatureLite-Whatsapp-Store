import { CartService } from '../cart/cart.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
export declare class AbandonedCartProcessor {
    private cartService;
    private notificationsService;
    private settingsService;
    private readonly logger;
    constructor(cartService: CartService, notificationsService: NotificationsService, settingsService: SettingsService);
    processAbandonedCarts(): Promise<void>;
}
