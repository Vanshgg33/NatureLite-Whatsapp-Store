import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The bill maths exists in the backend (authoritative) and here (live preview). They must never drift.
describe('formula engine copies', () => {
  it('frontend copy is byte-identical to the backend file', () => {
    const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
    expect(read('./formula-engine.ts')).toBe(read('../../../../backend/src/modules/billing/logics/formula-engine.ts'));
  });
});
