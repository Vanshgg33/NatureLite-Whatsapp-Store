import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationsService } from '../notifications/notifications.service';
interface NotificationPayload {
    phone: string;
    templateName: string;
    params: string[];
    orderId?: string;
    idempotencyKey?: string;
}
export declare class NotificationProcessor extends WorkerHost {
    private notificationsService;
    private readonly logger;
    constructor(notificationsService: NotificationsService);
    process(job: Job<NotificationPayload>): Promise<boolean>;
}
export {};
