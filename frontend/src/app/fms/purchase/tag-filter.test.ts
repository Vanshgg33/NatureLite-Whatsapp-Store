import { parseTagsParam, buildTagsParam, filterItemsByTags } from './tag-filter-utils';

describe('tag URL params', () => {
  it('parseTagsParam splits comma-separated slugs', () => {
    expect(parseTagsParam('ready-to-sell,factory-use')).toEqual(['ready-to-sell', 'factory-use']);
  });

  it('parseTagsParam returns [] for null', () => {
    expect(parseTagsParam(null)).toEqual([]);
  });

  it('buildTagsParam joins with comma', () => {
    expect(buildTagsParam(['ready-to-sell', 'for-processing'])).toBe('ready-to-sell,for-processing');
  });
});

describe('filterItemsByTags', () => {
  const items = [
    { _id: 'l1', tagName: 'Factory Use', lineStatus: 'NEEDS_PO' },
    { _id: 'l2', tagName: 'For Processing', lineStatus: 'PO_RAISED' },
  ];

  it('returns all when no tags selected', () => {
    expect(filterItemsByTags(items as any, [])).toHaveLength(2);
  });

  it('filters to matching tag only', () => {
    const result = filterItemsByTags(items as any, ['Factory Use']);
    expect(result.map(i => i._id)).toEqual(['l1']);
  });
});
