/**
 * Barcode lookup via Open Food Facts (free, no API key)
 * Supports EAN-13, UPC-A, and other formats
 */
export interface BarcodeProduct {
  name: string;
  sku: string;
  description?: string;
  quantity?: string;
  brand?: string;
  categories?: string;
  imageUrl?: string;
  genericName?: string;
}

export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  const code = String(barcode).replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return null;

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,quantity,generic_name,categories,image_small_url`,
      { headers: { 'User-Agent': 'Naturelite-Store/1.0' } }
    );
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const name = p.product_name || p.product_name_en || '';
    const parts: string[] = [];
    if (name) parts.push(name);
    if (p.brands) parts.push(`Brand: ${p.brands}`);
    if (p.quantity) parts.push(`Size: ${p.quantity}`);

    return {
      name: name || 'Unknown Product',
      sku: code,
      description: parts.length > 1 ? parts.join(' | ') : undefined,
      quantity: p.quantity,
      brand: p.brands,
      categories: p.categories,
      imageUrl: p.image_small_url,
      genericName: p.generic_name,
    };
  } catch {
    return null;
  }
}
