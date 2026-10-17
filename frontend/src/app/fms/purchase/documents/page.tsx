'use client';
import { Suspense } from 'react';
import { DocumentsVault } from '@/components/fms/purchase/DocumentsVault';

export default function DocumentsPage() {
  return (
    <div className="flex flex-col min-h-full" style={{ background: 'var(--cream, #f4efe3)' }}>
      <div className="px-7 pt-7 pb-7">
        <Suspense fallback={null}>
          <DocumentsVault />
        </Suspense>
      </div>
    </div>
  );
}
