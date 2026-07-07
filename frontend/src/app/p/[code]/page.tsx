import { redirect, notFound } from 'next/navigation';

async function resolvePayLink(
  code: string,
): Promise<{ orderId: string; token: string } | null> {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  if (!apiUrl) return null;
  try {
    const res = await fetch(`${apiUrl}/payments/p/${encodeURIComponent(code)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ orderId: string; token: string }>;
  } catch {
    return null;
  }
}

export default async function ShortPayLinkPage({
  params,
}: {
  params: { code: string };
}) {
  const data = await resolvePayLink(params.code);
  if (!data) notFound();
  redirect(`/pay/${encodeURIComponent(data.orderId)}?t=${encodeURIComponent(data.token)}`);
}
