export function parseTagsParam(param: string | null): string[] {
  if (!param) return [];
  return param.split(',').map(s => s.trim()).filter(Boolean);
}

export function buildTagsParam(tags: string[]): string {
  return tags.join(',');
}

export function filterItemsByTags(
  items: Array<{ tagName?: string }>,
  selectedTags: string[],
): Array<{ tagName?: string }> {
  if (!selectedTags.length) return items;
  return items.filter(i => selectedTags.includes(i.tagName ?? ''));
}
