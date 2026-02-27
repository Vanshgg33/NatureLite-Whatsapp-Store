'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useSiteSettings } from '@/lib/site-settings-context';

export function AnnouncementBar() {
  const { banners, isLoaded } = useSiteSettings();
  const [dismissed, setDismissed] = useState(false);

  if (!isLoaded || !banners?.announcementBar?.enabled || dismissed) return null;

  const { text, linkText, linkUrl, backgroundColor, textColor } = banners.announcementBar;
  if (!text) return null;

  const bgStyle =
    backgroundColor === 'primary'
      ? { backgroundColor: 'hsl(var(--brand-green))' }
      : { backgroundColor: `hsl(${backgroundColor})` };

  const txtStyle =
    textColor === 'white'
      ? { color: '#ffffff' }
      : { color: `hsl(${textColor})` };

  return (
    <div
      className="relative z-[60] flex items-center justify-center gap-2 px-10 py-2.5 text-sm font-medium"
      style={{ ...bgStyle, ...txtStyle }}
    >
      <span>{text}</span>
      {linkText && linkUrl && (
        <Link
          href={linkUrl}
          className="underline underline-offset-2 font-semibold hover:opacity-80 transition-opacity"
        >
          {linkText}
        </Link>
      )}
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/20 transition-colors"
        aria-label="Dismiss announcement"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
