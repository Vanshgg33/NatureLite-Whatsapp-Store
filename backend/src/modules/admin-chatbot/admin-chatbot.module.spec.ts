import 'reflect-metadata';
import { getModelToken } from '@nestjs/mongoose';
import { AdminChatbotModule } from './admin-chatbot.module';
import { AdminChatbotService } from './admin-chatbot.service';
import { AdminChatbotToolsService } from './admin-chatbot-tools.service';
import { RouterAgent } from './agents/router.agent';
import { OpsAgent } from './agents/ops.agent';
import { BillingCrmAgent } from './agents/billing-crm.agent';
import { PurchaseAgent } from './agents/purchase.agent';
import { SynthesizerAgent } from './agents/synthesizer.agent';

// Nest cannot start if a provider injects a model the module never registered, and we cannot boot
// the app against Mongo/Redis in unit tests — so check the wiring from the decorator metadata.
const SELF_DECLARED_DEPS = 'self:paramtypes';

const imports: any[] = Reflect.getMetadata('imports', AdminChatbotModule) ?? [];
const providers: any[] = Reflect.getMetadata('providers', AdminChatbotModule) ?? [];
const registeredModelTokens = new Set(
  imports.flatMap((i) => (i?.providers ?? []) as any[]).map((p) => p?.provide).filter(Boolean),
);

describe('AdminChatbotModule wiring', () => {
  it('registers a mongoose model for every @InjectModel dependency of the tools service', () => {
    const declared: Array<{ index: number; param: unknown }> =
      Reflect.getMetadata(SELF_DECLARED_DEPS, AdminChatbotToolsService) ?? [];
    const modelTokens = declared.map((d) => d.param).filter((p): p is string => typeof p === 'string');

    expect(modelTokens.length).toBeGreaterThanOrEqual(13);
    expect(modelTokens.filter((t) => !registeredModelTokens.has(t))).toEqual([]);
  });

  it.each(['BillingBill', 'BillingCustomer', 'Godown', 'CrmCustomerStats', 'CrmCallLog', 'CrmCampaign',
    'PurchaseRequest', 'PurchaseVendor', 'PurchaseMaterial'])('registers the %s model', (name) => {
    expect(registeredModelTokens.has(getModelToken(name))).toBe(true);
  });

  it.each([
    AdminChatbotService, AdminChatbotToolsService, RouterAgent, OpsAgent, BillingCrmAgent, PurchaseAgent, SynthesizerAgent,
  ])('provides %p', (provider) => {
    expect(providers).toContain(provider);
  });
});
