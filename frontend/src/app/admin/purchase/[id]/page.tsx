'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingBag, CheckCircle2, XCircle, Upload, Package, ChevronLeft,
  ExternalLink, Printer, Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import Link from 'next/link';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtIST(d: string | Date) {
  return new Date(d).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }) + ' IST';
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

const STATUS_HOLDER: Record<string, string> = {
  REQUESTED: 'PO Creator',
  PO_CREATED: 'Approver',
  APPROVED: 'Approver',
  REJECTED: 'PO Creator',
  VENDOR_BILL_UPLOADED: 'Receiver',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-3 py-1 rounded-full font-semibold ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function DeadlineChip({ deadline }: { deadline?: { dueAt: string; stage: string; setByName: string } }) {
  if (!deadline?.dueAt) return null;
  const diff = new Date(deadline.dueAt).getTime() - Date.now();
  const hours = diff / 3_600_000;
  const cls = hours <= 0
    ? 'bg-red-100 text-red-700 border-red-200'
    : hours < 24
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-green-100 text-green-700 border-green-200';
  const label = hours <= 0
    ? `Overdue by ${Math.round(Math.abs(hours))}h`
    : hours < 24
    ? `Due in ${Math.round(hours)}h`
    : `Due ${fmtIST(deadline.dueAt)}`;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium ${cls}`}>
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}

function FileViewer({ file, label }: { file: { url: string; name: string; mime?: string }; label: string }) {
  const isPdf = file.mime === 'application/pdf' || file.name?.endsWith('.pdf');
  return (
    <div className="border rounded-lg p-3 bg-gray-50">
      <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
      {isPdf ? (
        <iframe src={file.url} className="w-full h-64 border rounded" title={label} />
      ) : (
        <img src={file.url} alt={label} className="max-h-64 rounded border object-contain" />
      )}
      <a
        href={file.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-[#2F6B47] hover:underline"
      >
        <ExternalLink className="h-3 w-3" />
        Open in new tab
      </a>
    </div>
  );
}

// ── Stage-specific action panels ──────────────────────────────────────────────

function POCreatorPanel({ req, onSuccess }: { req: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [vendorName, setVendorName] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorAddress, setVendorAddress] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [terms, setTerms] = useState('');
  const [poItems, setPoItems] = useState(req.items.map((i: any) => ({ ...i, ratePerKg: '' })));

  const mutation = useMutation({
    mutationFn: (data: any) => api.createPurchasePO(req._id, data),
    onSuccess: () => { toast({ title: 'PO created' }); onSuccess(); },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const total = poItems.reduce((s: number, i: any) => s + (i.qtyKg * (parseFloat(i.ratePerKg) || 0)), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName) { toast({ title: 'Vendor name required', variant: 'destructive' }); return; }
    for (const item of poItems) {
      if (!item.ratePerKg || parseFloat(item.ratePerKg) <= 0) {
        toast({ title: 'Enter rate for all items', variant: 'destructive' }); return;
      }
    }
    mutation.mutate({
      vendorName, vendorPhone, vendorAddress, expectedDelivery, terms,
      items: poItems.map((i: any) => ({ ...i, ratePerKg: parseFloat(i.ratePerKg) })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700">Vendor Name *</label>
          <Input className="mt-1 text-sm h-9" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor / Supplier" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700">Vendor Phone</label>
          <Input className="mt-1 text-sm h-9" value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} placeholder="Phone number" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-700">Vendor Address</label>
          <Input className="mt-1 text-sm h-9" value={vendorAddress} onChange={(e) => setVendorAddress(e.target.value)} placeholder="Address" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700">Expected Delivery</label>
          <Input type="date" className="mt-1 text-sm h-9" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700">Payment Terms</label>
          <Input className="mt-1 text-sm h-9" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. 30 days credit" />
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">Rate per KG</p>
        {poItems.map((item: any, i: number) => (
          <div key={i} className="flex items-center gap-3 mb-2">
            <span className="text-sm text-gray-700 flex-1">{item.materialName} — {item.qtyKg} KG</span>
            <div className="flex items-center w-36">
              <span className="h-9 flex items-center px-2 border rounded-l-md bg-gray-50 text-xs text-gray-500">₹</span>
              <Input
                type="number" min="0" step="0.01"
                value={item.ratePerKg}
                onChange={(e) => setPoItems((prev: any[]) => prev.map((p, idx) => idx === i ? { ...p, ratePerKg: e.target.value } : p))}
                className="h-9 text-sm rounded-l-none"
                placeholder="Rate/KG"
              />
            </div>
            <span className="text-sm font-medium w-24 text-right">
              ₹{(item.qtyKg * (parseFloat(item.ratePerKg) || 0)).toLocaleString('en-IN')}
            </span>
          </div>
        ))}
        <div className="text-right font-semibold text-sm mt-2 border-t pt-2">
          Total: ₹{total.toLocaleString('en-IN')}
        </div>
      </div>
      <Button type="submit" disabled={mutation.isPending} className="bg-[#2F6B47] hover:bg-[#2F6B47]/90">
        {mutation.isPending ? 'Creating PO…' : 'Create Purchase Order'}
      </Button>
    </form>
  );
}

function ApproverPanel({ req, onSuccess }: { req: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [rejectionReason, setRejectionReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const decisionMutation = useMutation({
    mutationFn: (data: any) => api.makePurchaseDecision(req._id, data),
    onSuccess: () => { toast({ title: 'Decision recorded' }); onSuccess(); },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const billMutation = useMutation({
    mutationFn: (data: any) => api.uploadPurchaseVendorBill(req._id, data),
    onSuccess: () => { toast({ title: 'Vendor bill uploaded' }); onSuccess(); },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const handleUploadBill = async (file: File) => {
    setUploading(true);
    try {
      const result = await api.uploadDocument(file, 'purchase-bills');
      await billMutation.mutateAsync({ url: result.secureUrl || result.url, name: file.name, mime: file.type, publicId: result.publicId });
    } catch (err) {
      toast({ title: 'Upload failed', description: getApiError(err), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  if (req.status === 'PO_CREATED') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-4 bg-blue-50">
          <p className="text-sm font-semibold text-blue-800 mb-1">PO Details</p>
          <p className="text-sm text-blue-700">Vendor: {req.po?.vendorName}</p>
          {req.po?.vendorPhone && <p className="text-xs text-blue-600">{req.po.vendorPhone}</p>}
          <p className="text-sm font-bold text-blue-900 mt-2">Total: ₹{req.po?.totalAmount?.toLocaleString('en-IN')}</p>
        </div>
        {!showReject ? (
          <div className="flex gap-2">
            <Button onClick={() => decisionMutation.mutate({ action: 'APPROVED' })} disabled={decisionMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 flex-1">
              <CheckCircle2 className="h-4 w-4 mr-2" /> Approve PO
            </Button>
            <Button variant="outline" onClick={() => setShowReject(true)} className="text-red-600 border-red-200 flex-1">
              <XCircle className="h-4 w-4 mr-2" /> Reject
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input placeholder="Rejection reason (required)" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="destructive" onClick={() => decisionMutation.mutate({ action: 'REJECTED', reason: rejectionReason })} disabled={!rejectionReason.trim() || decisionMutation.isPending} className="flex-1">
                Confirm Rejection
              </Button>
              <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (req.status === 'APPROVED') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">PO approved. Upload vendor bill when received:</p>
        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadBill(f); }} />
        <Button onClick={() => fileRef.current?.click()} disabled={uploading || billMutation.isPending} variant="outline" className="w-full border-dashed">
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? 'Uploading…' : 'Upload Vendor Bill (JPG/PNG/PDF)'}
        </Button>
      </div>
    );
  }

  return null;
}

function ReceiverPanel({ req, onSuccess }: { req: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [gateBillData, setGateBillData] = useState<any>(null);
  const [receivedItems, setReceivedItems] = useState(
    req.po?.items?.map((i: any) => ({ materialName: i.materialName, orderedKg: i.qtyKg, receivedKg: '' })) ||
    req.items.map((i: any) => ({ materialName: i.materialName, orderedKg: i.qtyKg, receivedKg: '' })),
  );
  const [remarks, setRemarks] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const receiveMutation = useMutation({
    mutationFn: (data: any) => api.receivePurchaseGoods(req._id, data),
    onSuccess: () => { toast({ title: 'Goods receipt recorded — order closed' }); onSuccess(); },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const handleUploadGateBill = async (file: File) => {
    setUploading(true);
    try {
      const result = await api.uploadDocument(file, 'purchase-bills');
      setGateBillData({ url: result.secureUrl || result.url, name: file.name, mime: file.type, publicId: result.publicId });
      toast({ title: 'Gate bill uploaded', description: 'Now enter received quantities and submit.' });
    } catch (err) {
      toast({ title: 'Upload failed', description: getApiError(err), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gateBillData) { toast({ title: 'Upload gate bill first', variant: 'destructive' }); return; }
    for (const item of receivedItems) {
      if (item.receivedKg === '' || isNaN(parseFloat(item.receivedKg))) {
        toast({ title: 'Enter received KG for all items', variant: 'destructive' }); return;
      }
    }
    receiveMutation.mutate({
      gateBill: gateBillData,
      receivedItems: receivedItems.map((i: any) => ({ ...i, receivedKg: parseFloat(i.receivedKg) })),
      remarks,
    });
  };

  const varianceColor = (ordered: number, received: number) => {
    if (!received) return '';
    const pct = Math.abs((received - ordered) / ordered);
    if (pct > 0.05) return 'text-red-600';
    if (received < ordered) return 'text-amber-600';
    return 'text-emerald-600';
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {req.vendorBill && <FileViewer file={req.vendorBill} label="Vendor Bill" />}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">Received Quantities (KG)</p>
        {receivedItems.map((item: any, i: number) => (
          <div key={i} className="flex items-center gap-3 mb-2">
            <span className="text-sm text-gray-700 flex-1">{item.materialName}</span>
            <span className="text-xs text-gray-500 w-20">Ordered: {item.orderedKg}</span>
            <Input
              type="number" min="0" step="0.1"
              value={item.receivedKg}
              onChange={(e) => setReceivedItems((prev: any[]) => prev.map((p, idx) => idx === i ? { ...p, receivedKg: e.target.value } : p))}
              className="h-9 text-sm w-28" placeholder="Rcvd KG"
            />
            {item.receivedKg !== '' && (
              <span className={`text-xs font-medium w-20 text-right ${varianceColor(item.orderedKg, parseFloat(item.receivedKg))}`}>
                {(parseFloat(item.receivedKg) - item.orderedKg > 0 ? '+' : '')}
                {(parseFloat(item.receivedKg) - item.orderedKg).toFixed(1)} KG
              </span>
            )}
          </div>
        ))}
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">Gate Bill (image/PDF) *</label>
        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadGateBill(f); }} />
        <Button type="button" variant="outline"
          className={`w-full mt-1 border-dashed ${gateBillData ? 'border-emerald-400 text-emerald-700' : ''}`}
          onClick={() => fileRef.current?.click()} disabled={uploading}
        >
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? 'Uploading…' : gateBillData ? `Uploaded: ${gateBillData.name}` : 'Upload Gate Bill'}
        </Button>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">Remarks (optional)</label>
        <Input className="mt-1 text-sm h-9" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any notes on the delivery" />
      </div>
      <Button type="submit" disabled={receiveMutation.isPending || !gateBillData} className="bg-emerald-600 hover:bg-emerald-700 w-full">
        <Package className="h-4 w-4 mr-2" />
        {receiveMutation.isPending ? 'Closing…' : 'Mark Goods Received & Close'}
      </Button>
    </form>
  );
}

// ── Deadline setter (for active stage holder) ─────────────────────────────────

function DeadlineSetter({ reqId, currentDeadline, onSuccess }: { reqId: string; currentDeadline?: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState('');

  const mutation = useMutation({
    mutationFn: (dueAt: string) => api.setPurchaseDeadline(reqId, dueAt),
    onSuccess: () => { toast({ title: 'Deadline set' }); setValue(''); onSuccess(); },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  return (
    <div className="pt-3 border-t mt-3">
      <label className="text-xs font-medium text-gray-600">Set Deadline (for this stage)</label>
      <div className="flex gap-2 mt-1">
        <Input
          type="datetime-local"
          className="h-8 text-xs flex-1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!value || mutation.isPending}
          onClick={() => mutation.mutate(new Date(value).toISOString())}
        >
          Set
        </Button>
      </div>
      {currentDeadline?.dueAt && (
        <p className="text-xs text-gray-400 mt-1">
          Current: {fmtIST(currentDeadline.dueAt)} (set by {currentDeadline.setByName})
        </p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PurchaseRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAdminAuthStore();
  const isSuperadmin = user?.role === 'superadmin';
  const purchaseRole = user?.purchaseRole;

  const { data: req, isLoading, refetch } = useQuery({
    queryKey: ['purchase-request', params.id],
    queryFn: () => api.getPurchaseRequest(params.id),
    refetchInterval: 15000,
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.cancelPurchaseRequest(params.id, reason),
    onSuccess: () => { toast({ title: 'Request cancelled' }); refetch(); },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const onActionSuccess = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
    queryClient.invalidateQueries({ queryKey: ['purchase-stats'] });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen">
        <Header title="Purchase Request" icon={<ShoppingBag className="h-6 w-6 text-amber-600" />} />
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-[#2F6B47] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!req) return null;

  const canCancel = !['COMPLETED', 'CANCELLED'].includes(req.status) && (isSuperadmin || req.requestedById === user?.id);

  const holderRole = STATUS_HOLDER[req.status];
  const isMyAction = () => {
    if (req.status === 'COMPLETED' || req.status === 'CANCELLED') return false;
    if (isSuperadmin) return true;
    if (purchaseRole === 'po_creator' && (req.status === 'REQUESTED' || req.status === 'REJECTED')) return true;
    if (purchaseRole === 'approver' && (req.status === 'PO_CREATED' || req.status === 'APPROVED')) return true;
    if (purchaseRole === 'receiver' && req.status === 'VENDOR_BILL_UPLOADED') return true;
    return false;
  };

  const showAction = isMyAction();
  const waitingSince = req.timeline?.length ? fmtIST(req.timeline[req.timeline.length - 1].at) : '';

  return (
    <div className="flex flex-col h-screen">
      <Header
        title={req.reqNo}
        description={req.items?.map((i: any) => `${i.materialName} ${i.qtyKg}KG`).join(', ')}
        icon={<ShoppingBag className="h-6 w-6 text-amber-600" />}
        action={
          <Link href="/admin/purchase">
            <Button variant="outline" size="sm">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left column ── */}
          <div className="lg:col-span-2 space-y-4">
            {/* Status + meta */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={req.status} />
                    {req.deadline && <DeadlineChip deadline={req.deadline} />}
                  </div>
                  <span className="text-xs text-gray-500">{fmtIST(req.createdAt)}</span>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Requested by</p>
                  <p className="text-sm font-medium">{req.requestedByName}</p>
                </div>
                {req.note && (
                  <div>
                    <p className="text-xs text-gray-500">Note</p>
                    <p className="text-sm text-gray-700">{req.note}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Items</p>
                  {req.items?.map((i: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm py-1 border-b last:border-0">
                      <span>{i.materialName}</span>
                      <span className="font-mono font-medium">{i.qtyKg} KG</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* PO Details */}
            {req.po && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Purchase Order — {req.po.poNo}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#2F6B47]">₹{req.po.totalAmount?.toLocaleString('en-IN')}</span>
                      <button
                        onClick={() => window.open(`/admin/purchase/${req._id}/po/print`, '_blank')}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#2F6B47] border border-gray-200 rounded px-2 py-0.5"
                      >
                        <Printer className="h-3 w-3" /> Print PO
                      </button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p><span className="text-gray-500">Vendor:</span> {req.po.vendorName}</p>
                  {req.po.vendorPhone && <p><span className="text-gray-500">Phone:</span> {req.po.vendorPhone}</p>}
                  {req.po.vendorAddress && <p><span className="text-gray-500">Address:</span> {req.po.vendorAddress}</p>}
                  {req.po.expectedDelivery && <p><span className="text-gray-500">Expected:</span> {fmtIST(req.po.expectedDelivery)}</p>}
                  {req.po.terms && <p><span className="text-gray-500">Terms:</span> {req.po.terms}</p>}
                  <div className="mt-2 pt-2 border-t">
                    {req.po.items?.map((i: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs py-0.5">
                        <span>{i.materialName} {i.qtyKg}KG × ₹{i.ratePerKg}/KG</span>
                        <span>₹{i.amount?.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Files */}
            {req.vendorBill && <FileViewer file={req.vendorBill} label="Vendor Bill" />}
            {req.receipt?.gateBill && <FileViewer file={req.receipt.gateBill} label="Gate Bill" />}

            {/* Goods Receipt */}
            {req.receipt && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Goods Receipt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p><span className="text-gray-500">Received by:</span> {req.receipt.byName}</p>
                  <p><span className="text-gray-500">At:</span> {req.receipt.at ? fmtIST(req.receipt.at) : '—'}</p>
                  {req.receipt.remarks && <p><span className="text-gray-500">Remarks:</span> {req.receipt.remarks}</p>}
                  {req.receipt.receivedItems?.map((i: any, idx: number) => {
                    const variance = i.receivedKg - i.orderedKg;
                    const pct = Math.abs(variance / i.orderedKg);
                    const color = pct > 0.05 ? 'text-red-600' : variance < 0 ? 'text-amber-600' : 'text-emerald-600';
                    return (
                      <div key={idx} className="flex justify-between text-xs py-0.5 border-b last:border-0">
                        <span>{i.materialName}</span>
                        <span>Ordered: {i.orderedKg}KG | Received: <strong>{i.receivedKg}KG</strong></span>
                        <span className={`font-medium ${color}`}>{variance > 0 ? '+' : ''}{variance.toFixed(1)}KG</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Decision */}
            {req.decision && (
              <Card className={req.decision.action === 'REJECTED' ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}>
                <CardContent className="pt-4 text-sm">
                  <p className={`font-semibold ${req.decision.action === 'REJECTED' ? 'text-red-700' : 'text-emerald-700'}`}>
                    {req.decision.action} by {req.decision.byName}
                    {req.decision.at && <span className="font-normal text-xs ml-2">{fmtIST(req.decision.at)}</span>}
                  </p>
                  {req.decision.reason && <p className="text-red-600 mt-1">Reason: {req.decision.reason}</p>}
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(req.timeline || []).map((entry: any, idx: number) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`h-2.5 w-2.5 rounded-full mt-1 flex-shrink-0 ${STATUS_COLORS[entry.status]?.includes('emerald') ? 'bg-emerald-500' : STATUS_COLORS[entry.status]?.includes('red') ? 'bg-red-500' : STATUS_COLORS[entry.status]?.includes('blue') ? 'bg-blue-500' : 'bg-[#2F6B47]'}`} />
                        {idx < req.timeline.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                      </div>
                      <div className="pb-3 flex-1">
                        <p className="text-sm font-medium text-gray-800">{entry.action}</p>
                        <p className="text-xs text-gray-500">by {entry.byName} · {fmtIST(entry.at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-4">
            {/* Action panel */}
            {showAction && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Your Action</CardTitle>
                </CardHeader>
                <CardContent>
                  {(isSuperadmin || purchaseRole === 'po_creator') && (req.status === 'REQUESTED' || req.status === 'REJECTED') && (
                    <POCreatorPanel req={req} onSuccess={onActionSuccess} />
                  )}
                  {(isSuperadmin || purchaseRole === 'approver') && (req.status === 'PO_CREATED' || req.status === 'APPROVED') && (
                    <ApproverPanel req={req} onSuccess={onActionSuccess} />
                  )}
                  {(isSuperadmin || purchaseRole === 'receiver') && req.status === 'VENDOR_BILL_UPLOADED' && (
                    <ReceiverPanel req={req} onSuccess={onActionSuccess} />
                  )}
                  <DeadlineSetter reqId={req._id} currentDeadline={req.deadline} onSuccess={onActionSuccess} />
                </CardContent>
              </Card>
            )}

            {/* Waiting message */}
            {!showAction && !['COMPLETED', 'CANCELLED'].includes(req.status) && holderRole && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="pt-4 text-sm text-amber-800">
                  <p className="font-medium">Waiting on {holderRole}</p>
                  {waitingSince && <p className="text-xs text-amber-600 mt-0.5">Since {waitingSince}</p>}
                  {req.deadline && <div className="mt-2"><DeadlineChip deadline={req.deadline} /></div>}
                </CardContent>
              </Card>
            )}

            {/* Completed summary */}
            {req.status === 'COMPLETED' && (
              <Card className="border-emerald-200 bg-emerald-50">
                <CardContent className="pt-4 text-sm text-emerald-800">
                  <p className="font-semibold">Order Closed</p>
                  {req.receipt?.at && <p className="text-xs mt-1">{fmtIST(req.receipt.at)}</p>}
                </CardContent>
              </Card>
            )}

            {/* Cancel */}
            {canCancel && (
              <Card className="border-red-100">
                <CardContent className="pt-4">
                  <Button
                    variant="outline" size="sm"
                    className="w-full text-red-600 border-red-200"
                    onClick={() => {
                      const reason = prompt('Reason for cancellation:');
                      if (reason?.trim()) cancelMutation.mutate(reason.trim());
                    }}
                    disabled={cancelMutation.isPending}
                  >
                    Cancel Request
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
