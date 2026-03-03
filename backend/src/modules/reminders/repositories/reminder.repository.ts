import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Reminder, ReminderDocument } from '../schemas/reminder.schema';
import { parseObjectId } from '@/common/utils/objectid.util';

@Injectable()
export class ReminderRepository {
  constructor(
    @InjectModel(Reminder.name) private readonly model: Model<ReminderDocument>,
  ) {}

  getModel(): Model<ReminderDocument> {
    return this.model;
  }

  async create(data: Partial<Reminder>): Promise<Reminder> {
    const doc = new this.model(data);
    return doc.save();
  }

  async findDueWithinHour(storeIds: Types.ObjectId[]): Promise<any[]> {
    const now = new Date();
    const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return this.model
      .find({
        store: { $in: storeIds },
        dueAt: { $gte: now, $lte: twentyFourHoursLater },
        isDismissed: false,
      })
      .sort({ dueAt: 1 })
      .populate('sale', 'saleNumber customerName total')
      .populate('store', 'name code')
      .lean()
      .exec();
  }

  async dismiss(id: string): Promise<Reminder | null> {
    const objId = parseObjectId(id, 'reminderId');
    return this.model
      .findByIdAndUpdate(objId, { isDismissed: true }, { new: true })
      .lean()
      .exec();
  }
}
