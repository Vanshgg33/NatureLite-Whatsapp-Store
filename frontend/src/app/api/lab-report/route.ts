import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const isDownload = request.nextUrl.searchParams.get('download') === '1';

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  if (!url.startsWith('https://res.cloudinary.com/')) {
    return new NextResponse('Invalid URL', { status: 403 });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NatureLite/1.0)',
        'Accept': 'application/pdf,*/*',
      },
      redirect: 'follow',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cache: 'no-store' as any,
    });

    if (!upstream.ok) {
      return new NextResponse(
        `PDF unavailable (Cloudinary ${upstream.status}). Enable "PDF and ZIP file delivery" in your Cloudinary account settings.`,
        { status: 502 }
      );
    }

    const buffer = await upstream.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Cloudinary returns an HTML error page (with status 200) when PDF delivery
    // is not enabled on the account. Detect this by checking the PDF magic bytes.
    const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
    if (!isPdf) {
      return new NextResponse(
        'PDF delivery is not enabled on this Cloudinary account. Go to Cloudinary Dashboard → Settings → Security → Allowed delivery types and enable PDFs.',
        { status: 502 }
      );
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': isDownload ? 'attachment; filename="lab-report.pdf"' : 'inline',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    return new NextResponse(`Fetch error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }
}
