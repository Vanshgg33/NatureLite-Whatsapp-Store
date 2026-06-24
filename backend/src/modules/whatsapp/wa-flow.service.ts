import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { ChatSessionRepository } from '../chatbot/repositories/chat-session.repository';
import { WhatsAppService } from './whatsapp.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { mergeChatContext } from '../chatbot/chat-session-context';

interface FlowTokenPayload {
  phone: string;
  context: 'checkout' | 'account';
}

interface FlowRequest {
  version: string;
  action: 'INIT' | 'data_exchange' | 'BACK_NAVIGATION' | 'ping';
  screen?: string;
  data: Record<string, unknown>;
  flow_token: string;
}

interface FlowResponse {
  version: string;
  screen: string;
  data: Record<string, unknown>;
}

interface DecryptedPayload {
  payload: FlowRequest;
  aesKey: Buffer;
  iv: Buffer;
}

@Injectable()
export class WaFlowService {
  private readonly logger = new Logger(WaFlowService.name);
  private readonly privateKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly sessionRepository: ChatSessionRepository,
    private readonly whatsappService: WhatsAppService,
    @Inject(forwardRef(() => ChatbotService))
    private readonly chatbotService: ChatbotService,
  ) {
    this.privateKey = this.configService.get<string>('whatsapp.flowPrivateKey') ?? '';
  }

  encodeFlowToken(phone: string, context: 'checkout' | 'account'): string {
    const payload: FlowTokenPayload = { phone, context };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private decodeFlowToken(token: string): FlowTokenPayload {
    try {
      return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as FlowTokenPayload;
    } catch {
      throw new Error('Invalid flow token');
    }
  }

  private decryptPayload(body: {
    encrypted_flow_data: string;
    encrypted_aes_key: string;
    initial_vector: string;
  }): DecryptedPayload {
    const aesKey = crypto.privateDecrypt(
      {
        key: this.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(body.encrypted_aes_key, 'base64'),
    );

    const iv = Buffer.from(body.initial_vector, 'base64');
    const flowDataBuf = Buffer.from(body.encrypted_flow_data, 'base64');
    const authTag = flowDataBuf.subarray(flowDataBuf.length - 16);
    const ciphertext = flowDataBuf.subarray(0, flowDataBuf.length - 16);

    const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return {
      payload: JSON.parse(decrypted.toString('utf8')) as FlowRequest,
      aesKey,
      iv,
    };
  }

  private encryptResponse(response: FlowResponse, aesKey: Buffer, iv: Buffer): string {
    // Meta requires the IV to be bit-flipped for the response
    const flippedIv = Buffer.alloc(iv.length);
    for (let i = 0; i < iv.length; i++) {
      flippedIv[i] = ~iv[i] & 0xff;
    }

    const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(response), 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return encrypted.toString('base64');
  }

  async handleRequest(body: {
    encrypted_flow_data: string;
    encrypted_aes_key: string;
    initial_vector: string;
  }): Promise<string> {
    const { payload, aesKey, iv } = this.decryptPayload(body);

    // Health-check ping from Meta
    if (payload.action === 'ping') {
      return this.encryptResponse(
        { version: payload.version, screen: 'SUCCESS', data: { status: 'active' } },
        aesKey,
        iv,
      );
    }

    let response: FlowResponse;
    try {
      response = await this.route(payload);
    } catch (err) {
      this.logger.error('Flow request routing failed', err);
      response = {
        version: payload.version,
        screen: payload.screen ?? 'ADDRESS_LIST',
        data: { error_message: 'Something went wrong. Please try again.' },
      };
    }

    return this.encryptResponse(response, aesKey, iv);
  }

  private async route(payload: FlowRequest): Promise<FlowResponse> {
    const { action, data, flow_token, version, screen } = payload;
    const tokenData = this.decodeFlowToken(flow_token);

    if (action === 'INIT' || action === 'BACK_NAVIGATION') {
      return this.handleInit(tokenData, version);
    }

    if (action === 'data_exchange') {
      // User selected "Add New Address" from the list
      if (data.selected_address_id === 'add_new') {
        return { version, screen: 'ADD_ADDRESS', data: {} };
      }

      // User submitted the Add Address form
      if (data.screen_action === 'save_address') {
        return this.handleSaveAddress(tokenData, data, version);
      }

      // User selected an existing address
      if (typeof data.selected_address_id === 'string' && data.selected_address_id) {
        return this.handleSelectAddress(tokenData, data.selected_address_id, version);
      }
    }

    return {
      version,
      screen: screen ?? 'ADDRESS_LIST',
      data: { error_message: 'Unknown action.' },
    };
  }

  private async handleInit(tokenData: FlowTokenPayload, version: string): Promise<FlowResponse> {
    const user = await this.usersService.findOrCreateByPhone(tokenData.phone);

    const addresses = (user.addresses as unknown as Array<Record<string, unknown>>).map((addr, i) => {
      const id = (addr['_id'] as { toString(): string } | undefined)?.toString() ?? `idx_${i}`;
      const labelRaw = (addr['label'] as string | undefined) ?? `Address ${i + 1}`;
      const title = addr['isDefault'] ? `${labelRaw} ★` : labelRaw;
      const parts = [addr['house'] ?? addr['street'], addr['city'], addr['pincode']].filter(Boolean);
      return { id, title, description: String(parts.join(', ')).slice(0, 72) };
    });

    // Always append "Add New Address" as the last option
    addresses.push({
      id: 'add_new',
      title: '➕ Add New Address',
      description: 'Add a different address',
    });

    return { version, screen: 'ADDRESS_LIST', data: { addresses } };
  }

  private async handleSelectAddress(
    tokenData: FlowTokenPayload,
    addressId: string,
    version: string,
  ): Promise<FlowResponse> {
    const user = await this.usersService.findOrCreateByPhone(tokenData.phone);

    const addrIdx = (user.addresses as unknown as Array<Record<string, unknown>>).findIndex(
      (a) => (a['_id'] as { toString(): string } | undefined)?.toString() === addressId,
    );

    if (addrIdx < 0) {
      return {
        version,
        screen: 'ADDRESS_LIST',
        data: { error_message: 'Address not found. Please select again.' },
      };
    }

    await this.chatbotService.triggerPaymentFromFlow(tokenData.phone, addrIdx);

    return { version, screen: 'SUCCESS', data: {} };
  }

  private async handleSaveAddress(
    tokenData: FlowTokenPayload,
    data: Record<string, unknown>,
    version: string,
  ): Promise<FlowResponse> {
    const pincode = String(data['pin_code'] ?? '').trim();

    if (!/^\d{6}$/.test(pincode)) {
      return {
        version,
        screen: 'ADD_ADDRESS',
        data: { error_message: 'PIN Code must be exactly 6 digits.' },
      };
    }

    const serviceable = this.configService.get<string[]>('delivery.serviceablePincodes') ?? [];
    const PREFIXES = ['492', '490', '491', '495'];
    const isServiceable =
      serviceable.length > 0
        ? serviceable.includes(pincode)
        : PREFIXES.some((p) => pincode.startsWith(p));

    if (!isServiceable) {
      return {
        version,
        screen: 'ADD_ADDRESS',
        data: {
          error_message: `We don’t deliver to ${pincode} yet. We serve Raipur, Bhilai, Durg & Bilaspur.`,
        },
      };
    }

    const user = await this.usersService.findOrCreateByPhone(tokenData.phone);

    const house = String(data['house'] ?? '').trim();
    const area = String(data['area'] ?? '').trim();
    const street = [house, area].filter(Boolean).join(', ');
    const addressType = String(data['address_type'] ?? 'other') as 'home' | 'office' | 'other';
    const labelMap: Record<string, string> = { home: 'Home', office: 'Office', other: 'Other' };

    await this.usersService.addAddress(user._id.toString(), {
      label: labelMap[addressType] ?? 'Other',
      fullName: String(data['full_name'] ?? '').trim(),
      phone: String(data['phone'] ?? '').trim(),
      house,
      building: String(data['building'] ?? '').trim() || undefined,
      area,
      street,
      city: String(data['city'] ?? '').trim(),
      state: String(data['state'] ?? '').trim(),
      pincode,
      landmark: String(data['landmark'] ?? '').trim() || undefined,
      addressType,
      isDefault: user.addresses.length === 0,
    });

    if (tokenData.context === 'checkout') {
      const updated = await this.usersService.findOrCreateByPhone(tokenData.phone);
      const newIdx = updated.addresses.length - 1;
      await this.chatbotService.triggerPaymentFromFlow(tokenData.phone, newIdx);
    } else {
      // account context — update session state and notify user
      await this.sessionRepository.updateOneByPhone(tokenData.phone, {
        currentState: 'account_addresses',
        previousState: 'account',
      });
      await this.whatsappService.sendTextMessage({
        phone: tokenData.phone,
        message: '✅ *Address saved!*\n\nType *account* to manage your addresses.',
      });
    }

    return { version, screen: 'SUCCESS', data: {} };
  }
}
