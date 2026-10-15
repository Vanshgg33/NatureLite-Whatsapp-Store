import { filterMaterials } from './material-search-utils';

describe('filterMaterials', () => {
  const mats = [
    { _id: '1', name: 'Bajra', isActive: true },
    { _id: '2', name: 'Kokum', isActive: true },
    { _id: '3', name: 'Kokum Syrup', isActive: false },
  ];

  it('filters by name case-insensitively', () => {
    const res = filterMaterials(mats, 'KOK');
    expect(res.map(m => m._id)).toEqual(['2']); // Kokum Syrup excluded (inactive)
  });

  it('returns all active materials for empty query', () => {
    const res = filterMaterials(mats, '');
    expect(res).toHaveLength(2);
  });
});
