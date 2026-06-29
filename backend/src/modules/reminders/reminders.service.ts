import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ReminderRepository } from './repositories/reminder.repository';
import { StoreRepository } from '../stores/repositories/store.repository';
import { parseObjectId } from '../../common/utils/objectid.util';

@Injectable()
export class RemindersService {
  constructor(
    private readonly reminderRepository: ReminderRepository,
    private readonly storeRepository: StoreRepository,
  ) {}

  async createForSale(
    saleId: string,
    storeId: string,
    message: string,
    dueAt: Date,
    createdBy: string,
  ) {
    const saleObjId = parseObjectId(saleId, 'saleId');
    const storeObjId = parseObjectId(storeId, 'storeId');
    const userObjId = parseObjectId(createdBy, 'createdBy');
    return this.reminderRepository.create({
      sale: saleObjId,
      store: storeObjId,
      message,
      dueAt,
      createdBy: userObjId,
    });
  }

  async createForOrder(
    orderId: string,
    storeId: string | undefined,
    message: string,
    dueAt: Date,
    createdBy: string,
  ) {
    const orderObjId = parseObjectId(orderId, 'orderId');
    const userObjId = parseObjectId(createdBy, 'createdBy');
    const data: Partial<any> = { order: orderObjId, message, dueAt, createdBy: userObjId };
    if (storeId) data.store = parseObjectId(storeId, 'storeId');
    return this.reminderRepository.create(data);
  }

  async getDueReminders(storeIds: string[]): Promise<any[]> {
    if (!storeIds.length) return [];
    const objIds = storeIds.map((id) => parseObjectId(id, 'storeId'));
    return this.reminderRepository.findDueWithinHour(objIds);
  }

  async dismiss(id: string) {
    const reminder = await this.reminderRepository.dismiss(id);
    if (!reminder) throw new NotFoundException('Reminder not found');
    return reminder;
  }
}
