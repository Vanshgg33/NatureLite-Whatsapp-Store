import { OrdersService } from './orders.service';

// A refunded online order leaves the customer's CRM LTV at once; a repeated refund webhook changes nothing.
describe('OrdersService.recordRefundOnOrder → CRM', () => {
  function make(updated: any) {
    const svc: any = Object.create(OrdersService.prototype);
    const exec = jest.fn().mockResolvedValue(updated);
    svc.orderRepository = { getModel: () => ({ findOneAndUpdate: jest.fn(() => ({ exec })) }) };
    svc.crmEngine = { refreshUser: jest.fn().mockResolvedValue(undefined) };
    svc.clearChatbotCache = jest.fn();
    return svc;
  }
  const id = '64b7f0c2a1b2c3d4e5f60718';

  it('refreshes the customer CRM stats after marking the order refunded', async () => {
    const svc = make({ _id: id, user: 'u1' });
    await svc.recordRefundOnOrder(id, 499);
    expect(svc.crmEngine.refreshUser).toHaveBeenCalledWith('u1');
  });

  it('already refunded (duplicate webhook): no second refresh', async () => {
    const svc = make(null);
    await svc.recordRefundOnOrder(id, 499);
    expect(svc.crmEngine.refreshUser).not.toHaveBeenCalled();
  });
});
