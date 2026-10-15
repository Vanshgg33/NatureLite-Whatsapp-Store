import { deriveParentStageFromLines } from './lib/stage';

describe('deriveParentStageFromLines', () => {
  it('returns NEEDS_PO when any line has lineStatus NEEDS_PO', () => {
    const items = [
      { lineStatus: 'NEEDS_PO' },
      { lineStatus: 'PO_RAISED' },
    ];
    expect(deriveParentStageFromLines(items as any)).toBe('NEEDS_PO');
  });

  it('returns ALL_DROPPED when all lines are DROPPED', () => {
    const items = [{ lineStatus: 'DROPPED' }, { lineStatus: 'DROPPED' }];
    expect(deriveParentStageFromLines(items as any)).toBe('ALL_DROPPED');
  });

  it('returns PO_RAISED when all active lines are PO_RAISED (no NEEDS_PO)', () => {
    const items = [
      { lineStatus: 'PO_RAISED' },
      { lineStatus: 'DROPPED' },
    ];
    expect(deriveParentStageFromLines(items as any)).toBe('PO_RAISED');
  });
});
