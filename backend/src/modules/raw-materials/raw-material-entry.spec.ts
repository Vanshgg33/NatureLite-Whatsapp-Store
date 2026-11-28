import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RawMaterialService } from './raw-material.service';

describe('RawMaterialService.upsertTodayEntry', () => {
  const id = new Types.ObjectId().toString();
  const store = new Types.ObjectId();
  const material = { _id: id, store, unit: 'kg', toObject: () => ({ _id: id }) };

  function make(existing: { closing: number } | null) {
    const daily = {
      getEntry: jest.fn().mockResolvedValue(existing),
      upsertEntry: jest.fn().mockResolvedValue({ closing: 5, toObject: () => ({}) }),
    };
    const mats = { findById: jest.fn().mockResolvedValue(material), setTotalStock: jest.fn() };
    return { svc: new RawMaterialService(mats as any, daily as any, {} as any), daily };
  }

  it('rejects processing more than opening + stock in', async () => {
    const { svc, daily } = make(null);
    await expect(svc.upsertTodayEntry(id, { openingStock: 10, stockIn: 5, processed: 16 })).rejects.toBeInstanceOf(BadRequestException);
    expect(daily.upsertEntry).not.toHaveBeenCalled();
  });

  it('later entries are limited by the running closing, not the sent opening', async () => {
    const { svc } = make({ closing: 3 });
    await expect(svc.upsertTodayEntry(id, { openingStock: 100, stockIn: 0, processed: 4 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('saves machine, operator and note on the entry log', async () => {
    const { svc, daily } = make(null);
    await svc.upsertTodayEntry(id, { openingStock: 10, stockIn: 0, processed: 10, machine: 'JAS-02', operator: ' Ravi ', note: '' });
    expect(daily.upsertEntry.mock.calls[0][4]).toMatchObject({ machine: 'JAS-02', operator: 'Ravi', note: undefined });
  });
});
