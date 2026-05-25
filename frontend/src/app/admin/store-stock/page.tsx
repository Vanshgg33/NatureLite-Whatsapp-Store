'use client';

import Link from 'next/link';
import { Boxes, Cog, FlaskConical, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const pages = [
  {
    href: '/admin/ims',
    icon: Boxes,
    title: 'IMS — Inventory Management',
    desc: 'Track packed goods available for sale in store',
    color: 'bg-blue-50 text-blue-700',
  },
  {
    href: '/admin/pms',
    icon: Cog,
    title: 'PMS — Production Management',
    desc: 'Log daily raw material usage and oil output in litres',
    color: 'bg-orange-50 text-orange-700',
  },
  {
    href: '/admin/rms',
    icon: FlaskConical,
    title: 'RMS — Raw Material Stock',
    desc: 'Current raw material stock levels at the factory',
    color: 'bg-emerald-50 text-emerald-700',
  },
];

export default function StoreStockPage() {
  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Stock Management</h1>
      <p className="text-gray-500 text-sm mb-6">These features have moved to dedicated pages in the sidebar under <strong>Factory</strong>.</p>
      <div className="space-y-3">
        {pages.map((p) => (
          <Link key={p.href} href={p.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer border hover:border-gray-300">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${p.color}`}>
                  <p.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{p.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{p.desc}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
