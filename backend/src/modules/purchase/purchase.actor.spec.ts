import { buildActorSnapshot } from './purchase.service';

describe('buildActorSnapshot', () => {
  it('fills all fields from DB user', async () => {
    const mockModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'uid1', name: 'Ravi Sahu',
            designation: 'Store Incharge', avatar: 'https://cdn/photo.jpg',
          }),
        }),
      }),
    };
    const payload: any = { sub: 'uid1', name: 'Ravi Sahu', role: 'admin', phone: '' };
    const now = new Date('2026-10-14T10:00:00Z');
    const snap = await buildActorSnapshot(payload, mockModel as any, now);
    expect(snap).toEqual({
      userId: 'uid1', name: 'Ravi Sahu',
      designation: 'Store Incharge', photoUrl: 'https://cdn/photo.jpg',
      at: now,
    });
  });

  it('falls back gracefully when DB user has no avatar or designation', async () => {
    const mockModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'uid2', name: 'Om Sharma', designation: undefined, avatar: undefined,
          }),
        }),
      }),
    };
    const payload: any = { sub: 'uid2', name: 'Om Sharma', role: 'admin', phone: '' };
    const snap = await buildActorSnapshot(payload, mockModel as any, new Date());
    expect(snap.photoUrl).toBe('');
    expect(snap.designation).toBe('');
  });
});
