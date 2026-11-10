import { ComplaintFlow } from './complaint-flow';

function build() {
  const wa = {
    sendTextMessage: jest.fn().mockResolvedValue('id'),
    sendInteractiveList: jest.fn().mockResolvedValue('id'),
    sendInteractiveButtons: jest.fn().mockResolvedValue('id'),
    downloadMedia: jest.fn().mockResolvedValue({ buffer: Buffer.from('x'), mimeType: 'image/jpeg' }),
  };
  const orders = { findUserOrders: jest.fn().mockResolvedValue([{ _id: 'o1', orderNumber: 'ORD1', status: 'delivered', items: [{ name: 'Ghee' }] }]) };
  const complaints = { create: jest.fn().mockResolvedValue({ ticketNo: 'CMP-1' }), forCustomer: jest.fn().mockResolvedValue([]) };
  const media = { uploadImage: jest.fn().mockResolvedValue({ secureUrl: 'https://img/1.jpg' }), uploadVideoStream: jest.fn() };
  const flow = new ComplaintFlow(wa as any, orders as any, complaints as any, media as any);
  const session: any = { phone: '919', user: 'u1', context: {} };
  const save = jest.fn().mockResolvedValue(undefined);
  const msg = (text = '', extra: Record<string, unknown> = {}, type = 'text') =>
    ({ phone: '919', type, content: { text, ...extra } }) as any;
  const send = (m: any, text = m.content.text ?? '') => flow.handle(session, m, text, save);
  return { flow, wa, orders, complaints, media, session, send, msg };
}

describe('ComplaintFlow', () => {
  it('ignores ordinary messages when no complaint is in progress', async () => {
    const { send, msg, wa } = build();
    expect(await send(msg('show me ghee'))).toBe(false);
    expect(wa.sendTextMessage).not.toHaveBeenCalled();
  });

  it('"report issue" lists recent delivered orders plus a not-about-an-order row', async () => {
    const { send, msg, wa } = build();
    expect(await send(msg('report issue'))).toBe(true);
    const rows = wa.sendInteractiveList.mock.calls[0][0].sections[0].rows;
    expect(rows.map((r: any) => r.id)).toEqual(['cmpo_o1', 'cmpo_none']);
  });

  it('walks order → category → description → photo and creates the ticket', async () => {
    const { send, msg, complaints, session } = build();
    await send(msg('', { listId: 'cmpo_o1' }));
    expect(session.context.complaintDraft).toMatchObject({ step: 'category', orderId: 'o1' });
    await send(msg('', { listId: 'cmpc_damaged' }));
    expect(session.context.complaintDraft.step).toBe('details');
    await send(msg('packet leaked'));
    expect(session.context.complaintDraft).toMatchObject({ step: 'media', description: 'packet leaked' });
    await send(msg('', { mediaId: 'm1' }, 'image'), '');
    expect(complaints.create).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'u1', orderId: 'o1', category: 'damaged', description: 'packet leaked', media: ['https://img/1.jpg'], source: 'whatsapp',
    }));
    expect(session.context.complaintDraft).toBeUndefined();
  });

  it('Skip creates the ticket without media', async () => {
    const { send, msg, complaints, session } = build();
    session.context.complaintDraft = { at: Date.now(), step: 'media', category: 'quality', description: 'smells off' };
    await send(msg('', { buttonId: 'cmps_skip' }));
    expect(complaints.create).toHaveBeenCalledWith(expect.objectContaining({ media: [], category: 'quality' }));
  });

  it('a failed photo download keeps the draft and asks again instead of losing the complaint', async () => {
    const { send, msg, wa, complaints, session } = build();
    wa.downloadMedia.mockResolvedValue(null);
    session.context.complaintDraft = { at: Date.now(), step: 'media', category: 'damaged', description: 'x' };
    await send(msg('', { mediaId: 'm1' }, 'image'), '');
    expect(complaints.create).not.toHaveBeenCalled();
    expect(session.context.complaintDraft.step).toBe('media');
  });

  it('an unrelated menu button or navigation word abandons the draft and routes normally', async () => {
    const { send, msg, session } = build();
    session.context.complaintDraft = { at: Date.now(), step: 'details', category: 'damaged' };
    expect(await send(msg('', { buttonId: 'browse' }))).toBe(false);
    expect(session.context.complaintDraft).toBeUndefined();

    session.context.complaintDraft = { at: Date.now(), step: 'details', category: 'damaged' };
    expect(await send(msg('orders'))).toBe(false);
    expect(session.context.complaintDraft).toBeUndefined();
  });

  it('an abandoned draft expires, so a later message is not swallowed as the description', async () => {
    const { send, msg, complaints, session } = build();
    session.context.complaintDraft = { at: Date.now() - 31 * 60_000, step: 'details', category: 'damaged' };
    expect(await send(msg('what is the price of ghee'))).toBe(false);
    expect(session.context.complaintDraft).toBeUndefined();
    expect(complaints.create).not.toHaveBeenCalled();
  });

  it('cancel stops the flow with a confirmation', async () => {
    const { send, msg, wa, session } = build();
    session.context.complaintDraft = { at: Date.now(), step: 'details', category: 'damaged' };
    expect(await send(msg('cancel'))).toBe(true);
    expect(wa.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('cancelled') }));
    expect(session.context.complaintDraft).toBeUndefined();
  });

  it('typed text where a category list choice was expected re-shows the list', async () => {
    const { send, msg, wa, session } = build();
    session.context.complaintDraft = { at: Date.now(), step: 'category', orderId: 'o1' };
    expect(await send(msg('damaged'))).toBe(true);
    expect(wa.sendInteractiveList).toHaveBeenCalled();
  });

  it('asks unregistered customers to share their name first', async () => {
    const { send, msg, wa, session, complaints } = build();
    session.user = undefined;
    expect(await send(msg('report issue'))).toBe(true);
    expect(wa.sendTextMessage).toHaveBeenCalled();
    expect(complaints.create).not.toHaveBeenCalled();
  });
});
