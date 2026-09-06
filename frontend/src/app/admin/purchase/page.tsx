'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, Plus, TrendingUp, Clock, CheckCircle2, AlertCircle, Timer, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function fmtIST(d: string | Date) {
  return new Date(d).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }) + ' IST';
}

function DeadlineChip({ deadline }: { deadline?: { dueAt: string } }) {
  if (!deadline?.dueAt) return null;
  const hours = (new Date(deadline.dueAt).getTime() - Date.now()) / 3_600_000;
  const cls = hours <= 0 ? 'text-red-600' : hours < 24 ? 'text-amber-600' : 'text-green-600';
  const label = hours <= 0
    ? `Overdue ${Math.round(Math.abs(hours))}h`
    : hours < 24
    ? `Due ${Math.round(hours)}h`
    : fmtIST(deadline.dueAt);
  return (
    <span className={`text-xs font-medium ${cls} flex items-center gap-0.5`}>
      <Timer className="h-3 w-3" />{label}
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-slate-100 text-slate-700',
  PO_CREATED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  VENDOR_BILL_UPLOADED: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const ROLE_TO_STATUSES: Record<string, string[]> = {
  po_creator: ['REQUESTED', 'REJECTED'],
  approver: ['PO_CREATED', 'APPROVED'],
  receiver: ['VENDOR_BILL_UPLOADED'],
};

export default function PurchasePage() {
  const { user } = useAdminAuthStore();
  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');
  const purchaseRole = user?.purchaseRole;

  const { data: stats } = useQuery({
    queryKey: ['purchase-stats'],
    queryFn: () => api.getPurchaseStats(),
    refetchInterval: 15000,
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['purchase-requests'],
    queryFn: () => api.getPurchaseRequests(),
    refetchInterval: 15000,
  });

  const myActionStatuses = isSuperadmin ? null : (purchaseRole ? ROLE_TO_STATUSES[purchaseRole] : null);
  const myQueue = myActionStatuses
    ? requests.filter((r: any) => myActionStatuses.includes(r.status))
    : isSuperadmin
    ? requests.filter((r: any) => !['COMPLETED', 'CANCELLED'].includes(r.status))
    : [];

  const canCreate = purchaseRole === 'requester' || isSuperadmin;

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Purchase FMS"
        description="Raw material procurement pipeline"
        icon={<ShoppingBag className="h-6 w-6 text-amber-600" />}
        action={
          <div className="flex items-center gap-2">
            {isSuperadmin && (
              <Link href="/admin/purchase/materials">
                <Button size="sm" variant="outline">
                  <Package className="h-4 w-4 mr-1" />
                  Materials
                </Button>
              </Link>
            )}
            {canCreate && (
              <Link href="/admin/purchase/new">
                <Button size="sm" className="bg-[#2F6B47] hover:bg-[#2F6B47]/90">
                  <Plus className="h-4 w-4 mr-1" />
                  New Request
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Open</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.open ?? '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">My Action</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.myAction ?? '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Done This Month</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.completedThisMonth ?? '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-slate-50 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.total ?? '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My Action Queue */}
        {myQueue.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              My Action Queue ({myQueue.length})
            </h2>
            <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
              {myQueue.map((req: any) => (
                <Link
                  key={req._id}
                  href={`/admin/purchase/${req._id}`}
                  className="flex items-center justify-between px-4 py-3 border-b border-amber-100 last:border-0 hover:bg-amber-100/50 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-semibold text-gray-900">{req.reqNo}</span>
                    <span className="ml-2 text-xs text-gray-500 truncate">
                      {req.items?.map((i: any) => `${i.materialName} ${i.qtyKg}KG`).join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {req.deadline && <DeadlineChip deadline={req.deadline} />}
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[req.status]}`}>
                      {req.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Pipeline Table */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">All Requests</h2>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-8 w-8 border-2 border-[#2F6B47] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : requests.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">
                No purchase requests yet.
                {canCreate && (
                  <Link href="/admin/purchase/new" className="ml-1 text-[#2F6B47] underline">
                    Create one
                  </Link>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Req No</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Materials</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Requested By</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Deadline</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Date</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((req: any) => (
                      <tr
                        key={req._id}
                        className={`border-b last:border-0 hover:bg-gray-50 ${req.deadline?.dueAt && new Date(req.deadline.dueAt) < new Date() ? 'border-l-2 border-l-red-400' : ''}`}
                      >
                        <td className="px-4 py-2 font-mono font-semibold text-gray-900">{req.reqNo}</td>
                        <td className="px-4 py-2 text-gray-600 max-w-xs truncate">
                          {req.items?.map((i: any) => `${i.materialName} ${i.qtyKg}KG`).join(', ')}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{req.requestedByName}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[req.status]}`}>
                            {req.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <DeadlineChip deadline={req.deadline} />
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{fmtIST(req.createdAt)}</td>
                        <td className="px-4 py-2 text-right">
                          <Link href={`/admin/purchase/${req._id}`}>
                            <Button variant="ghost" size="sm" className="text-xs">View</Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
