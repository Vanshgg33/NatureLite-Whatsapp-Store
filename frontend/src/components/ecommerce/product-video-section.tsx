'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Video URL Parser ──────────────────────────────────────────────────────────
interface ParsedVideo {
  url: string;
  embedUrl: string;
  thumbnail: string;
  type: 'youtube' | 'instagram' | 'vimeo' | 'other';
}

function parseVideo(url: string): ParsedVideo {
  // YouTube watch / youtu.be
  const ytWatch = url.match(/(?:youtube\.com\/(?:watch\?(?:[^&]*&)*v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytWatch) {
    const id = ytWatch[1];
    return {
      url,
      embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      type: 'youtube',
    };
  }
  // YouTube Shorts
  const ytShorts = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (ytShorts) {
    const id = ytShorts[1];
    return {
      url,
      embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      type: 'youtube',
    };
  }
  // Vimeo
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) {
    return {
      url,
      embedUrl: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&color=a07010`,
      thumbnail: '',
      type: 'vimeo',
    };
  }
  // Instagram Reel / Post
  const ig = url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  if (ig) {
    return {
      url,
      embedUrl: `https://www.instagram.com/reel/${ig[1]}/embed/`,
      thumbnail: '',
      type: 'instagram',
    };
  }
  return { url, embedUrl: url, thumbnail: '', type: 'other' };
}

// ─── Video Thumbnail Card ──────────────────────────────────────────────────────
function VideoCard({
  video,
  index,
  onClick,
}: {
  video: ParsedVideo;
  index: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative flex-shrink-0 group"
      style={{ width: 160, borderRadius: 18, overflow: 'hidden', aspectRatio: '9/16', cursor: 'pointer' }}
      aria-label={`Play video ${index + 1}`}
    >
      {/* Thumbnail */}
      {video.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnail}
          alt={`Video ${index + 1}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            width: '100%', height: '100%',
            background: `linear-gradient(135deg, hsl(${(index * 47 + 160) % 360}, 35%, 28%), hsl(${(index * 47 + 200) % 360}, 40%, 18%))`,
          }}
        />
      )}

      {/* Gradient overlay */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* Play button */}
      <div
        className="absolute inset-0 flex items-center justify-center"
      >
        <div
          style={{
            width: 46, height: 46, borderRadius: '50%',
            background: 'rgba(255,255,255,0.95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          }}
          className="group-hover:scale-110 transition-transform duration-200"
        >
          <Play style={{ width: 18, height: 18, color: '#1a2810', marginLeft: 2 }} fill="#1a2810" />
        </div>
      </div>

      {/* Video number badge */}
      <div
        style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(160,112,16,0.85)',
          borderRadius: 6, padding: '2px 7px',
          fontSize: 9, fontWeight: 700, color: '#fff',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}
      >
        #{index + 1}
      </div>

      {/* Reels-style label */}
      {video.type === 'instagram' && (
        <div
          style={{
            position: 'absolute', bottom: 10, right: 10,
            background: 'rgba(0,0,0,0.55)',
            borderRadius: 100, padding: '3px 8px',
            fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: 600,
          }}
        >
          Reel
        </div>
      )}
    </motion.button>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function VideoLightbox({
  videos,
  initialIndex,
  onClose,
}: {
  videos: ParsedVideo[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(initialIndex);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const prev = useCallback(() => setCurrent((c) => (c - 1 + videos.length) % videos.length), [videos.length]);
  const next = useCallback(() => setCurrent((c) => (c + 1) % videos.length), [videos.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const activeVideo = videos[current];
  const prevVideo = videos[(current - 1 + videos.length) % videos.length];
  const nextVideo = videos[(current + 1) % videos.length];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: 'rgba(5,12,4,0.95)', backdropFilter: 'blur(18px)' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-10 flex items-center justify-center rounded-full transition-colors"
        style={{
          width: 40, height: 40, background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.15)', color: '#fff',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
      >
        <X size={18} />
      </button>

      {/* Counter */}
      <div
        className="absolute top-5 left-1/2 -translate-x-1/2"
        style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em' }}
      >
        {current + 1} / {videos.length}
      </div>

      {/* Main layout — stop propagation so clicking video area doesn't close */}
      <div
        className="relative flex items-center justify-center gap-4 w-full h-full px-4"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Prev thumbnail (desktop only) */}
        {videos.length > 1 && (
          <motion.button
            onClick={prev}
            whileTap={{ scale: 0.95 }}
            className="hidden sm:block relative flex-shrink-0"
            style={{
              width: 100, aspectRatio: '9/16', borderRadius: 16, overflow: 'hidden',
              opacity: 0.45, transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.65')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.45')}
          >
            {prevVideo.thumbnail
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={prevVideo.thumbnail} alt="Previous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: '#1a2810' }} />
            }
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={28} color="rgba(255,255,255,0.7)" />
            </div>
          </motion.button>
        )}

        {/* Main video */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            style={{
              position: 'relative', flexShrink: 0,
              width: 'min(340px, calc(100vw - 48px))',
              aspectRatio: activeVideo.type === 'youtube' ? '9/16' : '9/16',
              borderRadius: 24,
              overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <iframe
              ref={iframeRef}
              src={activeVideo.embedUrl}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              title={`Video ${current + 1}`}
            />
          </motion.div>
        </AnimatePresence>

        {/* Next thumbnail (desktop only) */}
        {videos.length > 1 && (
          <motion.button
            onClick={next}
            whileTap={{ scale: 0.95 }}
            className="hidden sm:block relative flex-shrink-0"
            style={{
              width: 100, aspectRatio: '9/16', borderRadius: 16, overflow: 'hidden',
              opacity: 0.45, transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.65')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.45')}
          >
            {nextVideo.thumbnail
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={nextVideo.thumbnail} alt="Next" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: '#1a2810' }} />
            }
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={28} color="rgba(255,255,255,0.7)" />
            </div>
          </motion.button>
        )}
      </div>

      {/* Mobile nav arrows (bottom center) */}
      {videos.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:hidden" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={prev}
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
          >
            <ChevronLeft size={20} />
          </button>
          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {videos.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                style={{
                  width: i === current ? 18 : 6,
                  height: 6, borderRadius: 3,
                  background: i === current ? '#a07010' : 'rgba(255,255,255,0.3)',
                  transition: 'all 0.25s ease',
                  border: 'none', cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <button
            onClick={next}
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {/* Desktop arrow buttons overlaid on sides */}
      {videos.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 items-center justify-center"
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; }}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 items-center justify-center"
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; }}
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
    </motion.div>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────
export function ProductVideoSection({ videos }: { videos: string[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const parsedVideos = videos.map(parseVideo);

  if (!videos.length) return null;

  return (
    <>
      <section className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">

        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <p
              style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(26,40,16,0.30)', marginBottom: 4 }}
            >
              Watch in Action
            </p>
            <h2
              style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 700, color: '#1a2810', letterSpacing: '-0.02em', lineHeight: 1.15 }}
            >
              Product Videos
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div
              style={{ padding: '5px 12px', borderRadius: 100, background: 'rgba(160,112,16,0.09)', border: '1px solid rgba(160,112,16,0.18)', fontSize: 11, fontWeight: 600, color: '#8a6200' }}
            >
              {videos.length} {videos.length === 1 ? 'video' : 'videos'}
            </div>
          </div>
        </motion.div>

        {/* Horizontal reel strip */}
        <div
          ref={scrollRef}
          className="flex gap-3 pb-4"
          style={{
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingBottom: 8,
          }}
        >
          <style>{`.vid-strip::-webkit-scrollbar{display:none}`}</style>
          {parsedVideos.map((video, i) => (
            <div key={i} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
              <VideoCard video={video} index={i} onClick={() => setLightboxIndex(i)} />
            </div>
          ))}
        </div>

        {/* Tap hint on mobile */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="sm:hidden mt-1 text-center"
          style={{ fontSize: 10, color: 'rgba(26,40,16,0.25)', letterSpacing: '0.06em' }}
        >
          Tap any video to watch
        </motion.p>
      </section>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <VideoLightbox
            videos={parsedVideos}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
