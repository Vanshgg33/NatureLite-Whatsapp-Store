'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FileText, ExternalLink, FlaskConical, Download } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Product } from '@/types';

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden bg-white animate-pulse shadow-sm">
      <div className="aspect-square bg-gradient-to-br from-amber-50 to-amber-100/60" />
      <div className="p-4 space-y-2.5">
        <div className="h-4 bg-amber-100 rounded w-3/4" />
        <div className="h-3 bg-amber-100 rounded w-1/2" />
        <div className="h-9 bg-green-50 rounded-xl w-full mt-3" />
      </div>
    </div>
  );
}

function LabReportCard({ product, index }: { product: Product; index: number }) {
  const image = product.images?.[0];
  const reportUrl = `/api/lab-report?url=${encodeURIComponent(product.labReportUrl!)}`;
  const downloadUrl = `/api/lab-report?url=${encodeURIComponent(product.labReportUrl!)}&download=1`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="group rounded-2xl overflow-hidden bg-white shadow-sm border border-amber-100/60 hover:shadow-md transition-shadow duration-300 flex flex-col"
    >
      {/* Product image */}
      <Link href={`/products/${product.slug}`} className="block relative aspect-square bg-amber-50/40 overflow-hidden">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FlaskConical className="w-10 h-10 text-amber-200" />
          </div>
        )}
        {/* Badge */}
        <span className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
          style={{ background: 'rgba(26,82,16,0.10)', color: '#1a5210' }}>
          <FileText className="w-3 h-3" /> Lab Tested
        </span>
      </Link>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1 gap-3">
        <div>
          <Link href={`/products/${product.slug}`}
            className="text-[15px] font-semibold text-brand-charcoal leading-snug line-clamp-2 hover:text-brand-brown transition-colors">
            {product.name}
          </Link>
          {product.batchInfo?.batchNumber && (
            <p className="text-[11px] text-brand-muted mt-0.5">
              Batch #{product.batchInfo.batchNumber}
            </p>
          )}
        </div>

        <div className="mt-auto flex gap-2">
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-80 active:scale-95"
            style={{
              background: 'rgba(26,82,16,0.08)',
              border: '1px solid rgba(26,82,16,0.20)',
              color: '#1a5210',
            }}
          >
            <FileText className="w-4 h-4 flex-shrink-0" />
            View
            <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
          </a>
          <a
            href={downloadUrl}
            download
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-80 active:scale-95"
            style={{
              background: 'rgba(26,82,16,0.06)',
              border: '1px solid rgba(26,82,16,0.15)',
              color: '#1a5210',
            }}
            title="Download PDF"
          >
            <Download className="w-4 h-4 flex-shrink-0" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

export default function LabReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['products', 'lab-reports'],
    queryFn: () => api.getProducts({ limit: 100, isActive: true }),
  });

  const productsWithReports = (data?.items ?? []).filter(
    (p: Product) => p.labReportUrl && p.labReportUrl.trim() !== ''
  );

  return (
    <div className="min-h-screen" style={{ background: '#faf9f2' }}>
      {/* Hero header */}
      <div className="relative overflow-hidden border-b border-amber-100/60"
        style={{ background: 'linear-gradient(135deg, #fdf8ee 0%, #f5f0e4 100%)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.9 0 0 0 0 0.7 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            mixBlendMode: 'overlay',
          }}
        />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-5"
              style={{ background: 'rgba(26,82,16,0.08)', color: '#1a5210', border: '1px solid rgba(26,82,16,0.15)' }}>
              <FlaskConical className="w-3.5 h-3.5" />
              Third-party verified
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-brand-charcoal leading-tight mb-4">
              Lab Reports
            </h1>
            <p className="text-brand-muted text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
              Every batch is tested by an independent NABL-accredited laboratory.
              Download the certified report for any product below.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : productsWithReports.length === 0 ? (
          <div className="text-center py-24">
            <FlaskConical className="w-12 h-12 text-amber-200 mx-auto mb-4" />
            <p className="text-brand-muted text-lg font-medium">No lab reports published yet.</p>
            <p className="text-brand-muted/70 text-sm mt-1">Check back soon — we upload reports for every batch.</p>
          </div>
        ) : (
          <>
            <p className="text-brand-muted text-sm mb-6">
              {productsWithReports.length} product{productsWithReports.length !== 1 ? 's' : ''} with lab reports
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {productsWithReports.map((product: Product, i: number) => (
                <LabReportCard key={product._id} product={product} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
