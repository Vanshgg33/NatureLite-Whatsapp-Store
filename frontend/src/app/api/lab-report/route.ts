import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  // Only allow Cloudinary URLs
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
    });

    if (!upstream.ok) {
      return new NextResponse(
        `Cloudinary returned ${upstream.status} ${upstream.statusText} for URL: ${url}`,
        { status: 502 }
      );
    }

    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    return new NextResponse(`Fetch error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }
}
