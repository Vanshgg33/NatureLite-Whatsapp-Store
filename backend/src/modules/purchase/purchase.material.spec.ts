describe('PurchaseService.bulkAddMaterials', () => {
  it('deduplicates names case-insensitively and trims whitespace', () => {
    const raw = ['  Kokum ', 'kokum', 'KOKUM ', 'Sesame'];
    const normalized = [...new Set(raw.map(n => n.trim().toLowerCase()))];
    expect(normalized).toEqual(['kokum', 'sesame']);
  });

  it('skips names that already exist in the DB', () => {
    const existing = [{ name: 'Kokum' }];
    const incoming = ['Kokum', 'Sesame', 'Bajra'];
    const existingLower = new Set(existing.map(e => e.name.toLowerCase()));
    const toCreate = incoming.filter(n => !existingLower.has(n.toLowerCase()));
    expect(toCreate).toEqual(['Sesame', 'Bajra']);
  });
});
