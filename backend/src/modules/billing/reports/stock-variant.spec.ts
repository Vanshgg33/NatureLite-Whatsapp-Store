import { collectMoves, movesForLocation, productOfKey, stockKey, valueStock } from './stock';
import { toPDoc } from './books';

describe('variant stock keys', () => {
  it('keys a variant separately from its product and recovers the product id', () => {
    expect(stockKey('p1')).toBe('p1');
    expect(stockKey('p1', 'V500')).toBe('p1#V500');
    expect(productOfKey('p1#V500')).toBe('p1');
    expect(productOfKey('p1')).toBe('p1');
  });

  it('keeps a variant purchase and a parent purchase in separate stock piles', () => {
    const purchase = toPDoc({
      docNo: 'PUR-1', date: '2026-06-01',
      items: [
        { productId: 'p1', variantSku: 'V500', name: 'Oil 500ml', qty: 5, gstRate: 0, taxable: 50_000 },
        { productId: 'p1', name: 'Oil', qty: 2, gstRate: 0, taxable: 20_000 },
      ],
    });
    const moves = collectMoves([], [purchase], []);
    const qtyOf = (key: string) => valueStock(movesForLocation(moves.filter(m => m.productId === key), 'godown'), new Date('2027-01-01')).qty;
    expect(qtyOf('p1#V500')).toBe(5);
    expect(qtyOf('p1')).toBe(2);
  });
});
