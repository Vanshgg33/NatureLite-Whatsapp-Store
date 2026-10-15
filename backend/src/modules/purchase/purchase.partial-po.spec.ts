import { deriveParentStageFromLines } from './lib/stage';

describe('Partial PO logic', () => {
  it('stage is NEEDS_PO when any line is NEEDS_PO', () => {
    expect(deriveParentStageFromLines([
      { lineStatus: 'PO_RAISED' },
      { lineStatus: 'NEEDS_PO' },
    ])).toBe('NEEDS_PO');
  });

  it('stage is PO_RAISED when all active lines have PO_RAISED', () => {
    expect(deriveParentStageFromLines([
      { lineStatus: 'PO_RAISED' },
      { lineStatus: 'DROPPED' },
    ])).toBe('PO_RAISED');
  });

  it('validatePartialPO throws when a line has no vendor', () => {
    const { validatePartialPO } = require('./purchase.service');
    const lines = [
      { materialId: 'm1', qtyKg: 10, vendorName: 'Vendor A', ratePerKg: 100 },
      { materialId: 'm2', qtyKg: 5, vendorName: '', ratePerKg: 0 },
    ];
    const result = validatePartialPO(lines);
    expect(result.assigned).toHaveLength(1);
    expect(result.unassigned).toHaveLength(1);
  });
});
