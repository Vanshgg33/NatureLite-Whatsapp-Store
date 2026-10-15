export function filterMaterials(
  materials: Array<{ _id: string; name: string; isActive: boolean }>,
  query: string,
): Array<{ _id: string; name: string; isActive: boolean }> {
  const active = materials.filter(m => m.isActive);
  if (!query.trim()) return active;
  const q = query.toLowerCase();
  return active.filter(m => m.name.toLowerCase().includes(q));
}
