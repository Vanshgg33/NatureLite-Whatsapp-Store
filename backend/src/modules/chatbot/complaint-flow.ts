import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { OrdersService } from '../orders/orders.service';
import { ComplaintsService } from '../complaints/complaints.service';
import { MediaService } from '../media/media.service';
import { WhatsAppMessage } from '../whatsapp/dto/whatsapp.dto';
import { ChatSessionDocument } from './schemas/chat-session.schema';
import { mergeChatContext } from './chat-session-context';
import { clip, WA } from './wa-limits';
import { ComplaintCategory } from '../complaints/schemas/complaint.schema';

const DRAFT_TTL_MS = 30 * 60 * 1000;
/** Plain words that mean the customer wants somewhere else, not to describe a problem. */
const NAV_WORDS = ['orders', 'cart', 'account', 'help', 'support', 'browse', 'shop', 'reorder', 'wallet'];

export const COMPLAINT_BTN = {
  REPORT: 'report_issue',
  SKIP: 'cmps_skip',
  /** Order id suffix; `none` = not about an order. Also used by the order-detail "Report issue" button. */
  order: (id: string) => `cmpo_${id}`,
  category: (c: string) => `cmpc_${c}`,
};

const CATEGORY_ROWS: { id: ComplaintCategory; title: string; description: string }[] = [
  { id: 'damaged', title: 'Damaged / leaked', description: 'Packet broken, leaking or spoiled' },
  { id: 'wrong_item', title: 'Wrong item', description: 'Received something different' },
  { id: 'missing_item', title: 'Missing item', description: 'An item was not in the order' },
  { id: 'quality', title: 'Quality / expiry', description: 'Taste, smell, quality or expiry issue' },
  { id: 'late_delivery', title: 'Late delivery', description: 'Order came late or not at all' },
  { id: 'delivery_behaviour', title: 'Delivery behaviour', description: 'Problem with the delivery person' },
  { id: 'payment', title: 'Payment / billing', description: 'Charged wrongly or refund issue' },
  { id: 'other', title: 'Something else', description: 'Any other problem' },
];

const STATUS_LABEL: Record<string, string> = {
  new: 'Received', investigating: 'Being looked into', awaiting_customer: 'Waiting for your reply',
  resolved: 'Resolved', reopened: 'Reopened', closed: 'Closed',
};

/**
 * "Report a problem" conversation. Kept out of ChatbotService's state machine on purpose:
 * progress lives in session.context.complaintDraft and this runs before normal routing,
 * so the AI/menu logic never sees the customer's free-text description.
 */
@Injectable()
export class ComplaintFlow {
  private readonly logger = new Logger(ComplaintFlow.name);

  constructor(
    @Inject(forwardRef(() => WhatsAppService)) private readonly wa: WhatsAppService,
    @Inject(forwardRef(() => OrdersService)) private readonly orders: OrdersService,
    @Inject(forwardRef(() => ComplaintsService)) private readonly complaints: ComplaintsService,
    private readonly media: MediaService,
  ) {}

  /** Returns true when this message was consumed by the complaint flow. */
  async handle(
    session: ChatSessionDocument,
    message: WhatsAppMessage,
    inputText: string,
    save: () => Promise<void>,
  ): Promise<boolean> {
    const phone = message.phone;
    const buttonId = message.content.buttonId || message.content.listId || '';
    const text = inputText.trim().toLowerCase();
    let draft = session.context?.complaintDraft;
    // Stamps every step so an abandoned draft expires instead of swallowing a later, unrelated message.
    const setDraft = async (d: Omit<NonNullable<typeof draft>, 'at'> | undefined) => {
      draft = d && { ...d, at: Date.now() };
      session.context = mergeChatContext(session.context, { complaintDraft: draft });
      await save();
    };

    const wantsStart = buttonId === COMPLAINT_BTN.REPORT || ['report issue', 'report problem', 'complaint', 'report a problem'].includes(text);
    const wantsStatus = text === 'complaint status' || text === 'my complaints';
    const orderPick = buttonId.startsWith('cmpo_') ? buttonId.slice(5) : null;
    const catPick = buttonId.startsWith('cmpc_') ? buttonId.slice(5) : null;
    const isComplaintButton = wantsStart || orderPick !== null || catPick !== null || buttonId === COMPLAINT_BTN.SKIP;

    if (draft) {
      const stale = Date.now() - (draft.at ?? 0) > DRAFT_TTL_MS;
      // Menu words, any unrelated button, or an obvious navigation word means "I'm done with this": drop the draft, route normally.
      const leaving = ['menu', 'cancel', 'hi', 'hello', 'start', ...NAV_WORDS].includes(text) || (!!buttonId && !isComplaintButton);
      if (stale || leaving) {
        await setDraft(undefined);
        if (leaving && text === 'cancel') {
          await this.wa.sendTextMessage({ phone, message: 'Okay, cancelled. Type *menu* to continue.' });
          return true;
        }
        if (leaving || !isComplaintButton) return false; // let the normal flow respond
      }
    }

    if (!isComplaintButton && !wantsStatus && !draft) return false;

    if (!session.user) {
      await this.wa.sendTextMessage({ phone, message: 'Please share your name first (type *menu*), then try again.' });
      return true;
    }
    const userId = session.user.toString();

    if (wantsStatus) {
      const list = await this.complaints.forCustomer(userId);
      await this.wa.sendTextMessage({
        phone,
        message: list.length
          ? `*Your complaints*\n\n${list.slice(0, 5).map((c) => `• *${c.ticketNo}* — ${STATUS_LABEL[c.status] ?? c.status}`).join('\n')}`
          : 'You have no complaints on record.',
      });
      return true;
    }

    if (wantsStart) {
      await this.start(phone, userId);
      return true;
    }

    if (orderPick !== null) {
      await setDraft({ step: 'category', orderId: orderPick === 'none' ? undefined : orderPick });
      await this.askCategory(phone);
      return true;
    }

    if (catPick !== null && draft) {
      await setDraft({ ...draft, step: 'details', category: catPick });
      await this.wa.sendTextMessage({ phone, message: 'Please describe the problem in a line or two. _Type *cancel* to stop._' });
      return true;
    }

    if (draft?.step === 'category') {
      await this.askCategory(phone); // typed text where a list choice was expected
      return true;
    }

    if (draft?.step === 'details') {
      if (!inputText.trim()) return true;
      await setDraft({ ...draft, step: 'media', description: inputText.trim().slice(0, 1000) });
      await this.wa.sendInteractiveButtons({
        phone,
        bodyText: '📷 Send a *photo or video* of the issue, it helps us resolve this faster.',
        buttons: [{ id: COMPLAINT_BTN.SKIP, title: 'Skip' }],
      });
      return true;
    }

    if (draft?.step === 'media') {
      const urls: string[] = [];
      if ((message.type === 'image' || message.type === 'video') && message.content.mediaId) {
        const url = await this.saveMedia(message.content.mediaId, message.type);
        if (url) urls.push(url);
        else {
          await this.wa.sendTextMessage({ phone, message: "Couldn't receive that file. Try again, or tap Skip." });
          return true;
        }
      } else if (buttonId !== COMPLAINT_BTN.SKIP) {
        await this.wa.sendTextMessage({ phone, message: 'Please send a photo or video, or tap *Skip*.' });
        return true;
      }
      await this.submit(session, userId, draft, urls, save);
      return true;
    }

    return false;
  }

  async start(phone: string, userId: string): Promise<void> {
    const recent = (await this.orders.findUserOrders(userId, 20))
      .filter((o) => o.status === 'delivered' || o.status === 'out_for_delivery')
      .slice(0, WA.MAX_ROWS_PER_SECTION - 1);
    const rows = recent.map((o) => ({
      id: COMPLAINT_BTN.order(o._id.toString()),
      title: clip(o.orderNumber, WA.LIST_ROW_TITLE),
      description: clip(o.items.map((i) => i.name).join(', '), WA.LIST_ROW_DESC),
    }));
    rows.push({ id: COMPLAINT_BTN.order('none'), title: 'Not about an order', description: 'General complaint' });
    await this.wa.sendInteractiveList({
      phone,
      headerText: 'Report a problem',
      bodyText: 'Which order is this about?',
      buttonText: 'Choose order',
      sections: [{ title: 'Recent orders', rows }],
    });
  }

  private async askCategory(phone: string): Promise<void> {
    await this.wa.sendInteractiveList({
      phone,
      headerText: 'Report a problem',
      bodyText: 'What went wrong?',
      buttonText: 'Choose issue',
      sections: [{
        title: 'Issue type',
        rows: CATEGORY_ROWS.map((r) => ({ id: COMPLAINT_BTN.category(r.id), title: clip(r.title, WA.LIST_ROW_TITLE), description: clip(r.description, WA.LIST_ROW_DESC) })),
      }],
    });
  }

  private async saveMedia(mediaId: string, type: 'image' | 'video'): Promise<string | null> {
    try {
      const file = await this.wa.downloadMedia(mediaId);
      if (!file) return null;
      const multerLike = { buffer: file.buffer, mimetype: file.mimeType } as Express.Multer.File;
      const res = type === 'video'
        ? await this.media.uploadVideoStream(multerLike, 'complaints')
        : await this.media.uploadImage(multerLike, 'complaints');
      return res.secureUrl;
    } catch (err) {
      this.logger.warn(`Complaint media save failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return null;
    }
  }

  private async submit(
    session: ChatSessionDocument,
    userId: string,
    draft: NonNullable<NonNullable<ChatSessionDocument['context']>['complaintDraft']>,
    media: string[],
    save: () => Promise<void>,
  ): Promise<void> {
    session.context = mergeChatContext(session.context, { complaintDraft: undefined });
    await save();
    try {
      // create() sends the "ticket registered" confirmation itself
      await this.complaints.create({
        customerId: userId,
        orderId: draft.orderId,
        category: (draft.category ?? 'other') as ComplaintCategory,
        description: draft.description,
        media,
        source: 'whatsapp',
      });
    } catch (err) {
      this.logger.error(`Complaint create failed: ${err instanceof Error ? err.message : 'unknown'}`);
      await this.wa.sendTextMessage({ phone: session.phone, message: "Sorry, we couldn't register your complaint. Please call *8962021112*." });
    }
  }
}
