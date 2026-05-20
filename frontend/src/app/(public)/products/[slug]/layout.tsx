import type { Metadata } from 'next';

type ProductPageParams = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: ProductPageParams;
}): Promise<Metadata> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL;
  try {
    const res = await fetch(
      `${apiBase}/products/slug/${encodeURIComponent(params.slug)}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error('Product not found');
    const json = await res.json();
    const product = json?.data;
    if (!product) throw new Error('No product data');

    const title = product.name ? `${product.name} – Nature Lite Foods` : 'Product – Nature Lite Foods';
    const description =
      product.shortDescription ||
      (typeof product.description === 'string'
        ? product.description.replace(/<[^>]+>/g, '').slice(0, 160)
        : 'Pure, traditional products from Nature Lite Foods.');

    const image =
      Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : undefined;
    const urlBase = process.env.NEXT_PUBLIC_SITE_URL;
    const url = urlBase
      ? `${urlBase}/products/${product.slug || params.slug}`
      : `/products/${product.slug || params.slug}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url,
        images: image ? [{ url: image, alt: product.name }] : undefined,
      },
      alternates: { canonical: url },
    };
  } catch {
    return {
      title: 'Product – Nature Lite Foods',
      description: 'Pure, traditional products from Nature Lite Foods.',
    };
  }
}

export default function ProductSlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
