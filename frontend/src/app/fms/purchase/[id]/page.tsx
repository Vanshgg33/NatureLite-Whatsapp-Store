'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingBag, CheckCircle2, XCircle, Upload, Package,
  ExternalLink, Printer, Clock, FileText, Paperclip, Plus,
  IndianRupee, CalendarDays, ChevronRight, MoreHorizontal, History,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import Link from 'next/link';

function fmtIST(d: string | Date) {
  return new Date(d).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }) + ' IST';
}

function fmtShort(d: string | Date) {
  return new Date(d).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested',
  PO_CREATED: 'Pending PO',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  VENDOR_BILL_UPLOADED: 'Bill Uploaded',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-blue-50 text-blue-700 border border-blue-200',
  PO_CREATED: 'bg-amber-50 text-amber-700 border border-amber-200',
  APPROVED: 'bg-green-50 text-green-700 border border-green-200',
  REJECTED: 'bg-red-50 text-red-700 border border-red-200',
  VENDOR_BILL_UPLOADED: 'bg-purple-50 text-purple-700 border border-purple-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  CANCELLED: 'bg-gray-50 text-gray-500 border border-gray-200',
};

const STATUS_HOLDER: Record<string, string> = {
  REQUESTED: 'PO Creator',
  PO_CREATED: 'Approver',
  APPROVED: 'Approver',
  REJECTED: 'PO Creator',
  VENDOR_BILL_UPLOADED: 'Receiver',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}`}>
      {STATUS_LABEL[status] || status.replace(/_/g, ' ')}
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
      <Clock className="h-3 w-3" /> {label}
    </span>
  );
}

function FileViewer({ file, label }: { file: { url: string; name: string; mime?: string }; label: string }) {
  const isPdf = file.mime === 'application/pdf' || file.name?.endsWith('.pdf');
  return (
    <div className="border rounded-lg p-3 bg-gray-50 mt-3">
      <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
      {isPdf ? (
        <iframe src={file.url} className="w-full h-48 border rounded" title={label} />
      ) : (
        <img src={file.url} alt={label} className="max-h-48 rounded border object-contain" />
      )}
      <a href={file.url} target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-[#2F6B47] hover:underline">
        <ExternalLink className="h-3 w-3" /> Open in new tab
      </a>
    </div>
  );
}

const PIPELINE_STAGES = [
  { n: 1, label: 'Requested',      role: 'Requester',     doneStatus: 'REQUESTED' },
  { n: 2, label: 'PO Created',     role: 'Purchase Desk', doneStatus: 'PO_CREATED' },
  { n: 3, label: 'Approved',       role: 'Approver',      doneStatus: 'APPROVED' },
  { n: 4, label: 'Goods Received', role: 'Gate / Store',  doneStatus: 'COMPLETED' },
];

const ACTIVE_STAGE: Record<string, number> = {
  REQUESTED: 2, PO_CREATED: 3, REJECTED: 2,
  APPROVED: 4, VENDOR_BILL_UPLOADED: 4,
};

function PipelineTracker({ req }: { req: any }) {
  const timeline: any[] = req.timeline || [];
  const isCancelled = req.status === 'CANCELLED';
  const isRejected  = req.status === 'REJECTED';
  const activeN     = isCancelled ? 0 : (ACTIVE_STAGE[req.status] ?? 0);

  const doneCount = PIPELINE_STAGES.filter(s =>
    !!timeline.find(t => t.status === s.doneStatus) && !isCancelled,
  ).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-10 py-6">
      <div className="relative">
        {/* Background connector line */}
        <div className="absolute top-5 left-[12.5%] right-[12.5%] h-0.5 bg-gray-100" />
        {/* Progress fill */}
        {!isCancelled && doneCount > 1 && (
          <div
            className="absolute top-5 h-0.5 bg-[#2F6B47] transition-all duration-500"
            style={{ left: '12.5%', width: `${((doneCount - 1) / 3) * 75}%` }}
          />
        )}
        <div className="flex">
          {PIPELINE_STAGES.map((stage) => {
            const entry    = timeline.find((t: any) => t.status === stage.doneStatus);
            const isDone   = !!entry && !isCancelled;
            const isActive = !isDone && !isCancelled && stage.n === activeN;
            const isRejHere = isRejected && stage.n === 3;

            return (
              <div key={stage.n} className="flex-1 flex flex-col items-center gap-1.5">
                <div className={`relative z-10 h-10 w-10 rounded-full border-2 flex items-center justify-center text-sm font-bold
                  ${isCancelled  ? 'bg-gray-50 border-gray-200 text-gray-300'
                  : isRejHere   ? 'bg-red-50 border-red-400 text-red-600'
                  : isDone      ? 'bg-[#2F6B47] border-[#2F6B47] text-white'
                  : isActive    ? 'bg-white border-amber-400 text-amber-600 shadow-[0_0_0_4px_rgba(251,191,36,0.12)]'
                  :               'bg-white border-gray-200 text-gray-300'}`}
                >
                  {isDone ? <CheckCircle2 className="h-5 w-5" /> : isRejHere ? <XCircle className="h-4 w-4" /> : stage.n}
                </div>
                <p className={`text-xs font-semibold text-center leading-tight
                  ${isDone || isActive ? 'text-gray-800' : 'text-gray-400'}`}>
                  {stage.n}. {stage.label}
                </p>
                {isRejHere ? (
                  <p className="text-xs text-red-500 font-medium">Rejected</p>
                ) : entry ? (
                  <div className="text-center">
                    <p className="text-[11px] text-gray-400 leading-tight">{fmtShort(entry.at)}</p>
                    <p className="text-[11px] text-gray-500 leading-tight">by <span className="font-medium">{entry.byName}</span></p>
                  </div>
                ) : (
                  <p className={`text-[11px] text-center leading-tight ${isActive ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                    {isActive ? 'Awaiting...' : stage.role}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {isCancelled && (
          <p className="text-center text-xs text-gray-400 mt-3 font-medium">This request was cancelled</p>
        )}
      </div>
    </div>
  );
}

const PO_FORM_ID = 'po-creator-form';
const RECEIVE_FORM_ID = 'receive-goods-form';

function POCreatorPanel({ req, onSuccess }: { req: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [vendorName, setVendorName]     = useState('');
  const [vendorPhone, setVendorPhone]   = useState('');
  const [vendorAddress, setVendorAddress] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [terms, setTerms]               = useState('');
  const [poItems, setPoItems]           = useState(req.items.map((i: any) => ({ ...i, ratePerKg: '' })));

  const mutation = useMutation({
    mutationFn: (data: any) => api.createPurchasePO(req._id, data),
    onSuccess: () => { toast({ title: 'PO created' }); onSuccess(); },
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
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
    <form id={PO_FORM_ID} onSubmit={handleSubmit} className="space-y-5">
      {/* Vendor Details */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-[#2F6B47]" />
          <h3 className="text-sm font-semibold text-gray-800">Purchase Order Details</h3>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Vendor Name *</label>
              <Input className="h-9 text-sm" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Search vendor..." />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Vendor Phone</label>
              <Input className="h-9 text-sm" value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} placeholder="Phone number" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Vendor Address</label>
            <textarea
              className="w-full text-sm border border-input rounded-md px-3 py-2 min-h-[72px] resize-none focus:outline-none focus:ring-2 focus:ring-[#2F6B47]/20 focus:border-[#2F6B47]/60 placeholder:text-gray-400"
              value={vendorAddress}
              onChange={(e) => setVendorAddress(e.target.value)}
              placeholder="Enter vendor address..."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Expected Delivery Date</label>
              <Input type="date" className="h-9 text-sm" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Payment Terms</label>
              <Input className="h-9 text-sm" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. 30 days credit" />
            </div>
          </div>
        </div>
      </div>

      {/* Rate Details */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <IndianRupee className="h-4 w-4 text-[#2F6B47]" />
          <h3 className="text-sm font-semibold text-gray-800">Rate Details</h3>
        </div>
        <p className="text-xs text-gray-500 mb-2">Rate per KG</p>
        <div className="space-y-2">
          {poItems.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex items-center flex-1 min-w-0">
                <span className="h-9 flex items-center px-2.5 border border-r-0 rounded-l-md bg-gray-50 text-sm text-gray-500 flex-shrink-0">₹</span>
                <Input
                  type="number" min="0" step="0.01"
                  value={item.ratePerKg}
                  onChange={(e) => setPoItems((prev: any[]) => prev.map((p, idx) => idx === i ? { ...p, ratePerKg: e.target.value } : p))}
                  className="h-9 text-sm rounded-l-none"
                  placeholder="0.00"
                />
              </div>
              <div className="text-xs text-gray-500 text-right flex-shrink-0 w-20 leading-tight">
                <div className="text-gray-700 truncate">{item.materialName}</div>
                <div className="font-medium">{item.qtyKg} KG</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-green-50 border border-green-100 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-green-800">Total Amount</span>
          <span className="text-base font-bold text-[#2F6B47]">
            ₹ {total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </form>
  );
}

function ApproverPanel({ req, onSuccess }: { req: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [rejectionReason, setRejectionReason] = useState('');
  const [showReject, setShowReject]   = useState(false);
  const [uploading, setUploading]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const decisionMutation = useMutation({
    mutationFn: (data: any) => api.makePurchaseDecision(req._id, data),
    onSuccess: () => { toast({ title: 'Decision recorded' }); onSuccess(); },
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const billMutation = useMutation({
    mutationFn: (data: any) => api.uploadPurchaseVendorBill(req._id, data),
    onSuccess: () => { toast({ title: 'Vendor bill uploaded' }); onSuccess(); },
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
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
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-[#2F6B47]" />
            <h3 className="text-sm font-semibold text-gray-800">Purchase Order Details</h3>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-1">
            <p className="text-xs text-blue-600">PO No: <span className="font-semibold text-blue-800">{req.po?.poNo}</span></p>
            <p className="text-sm text-blue-800">Vendor: <span className="font-semibold">{req.po?.vendorName}</span></p>
            {req.po?.vendorPhone && <p className="text-xs text-blue-600">{req.po.vendorPhone}</p>}
            {req.po?.expectedDelivery && <p className="text-xs text-blue-600">Expected: {fmtShort(req.po.expectedDelivery)}</p>}
            <p className="text-sm font-bold text-[#2F6B47] pt-1">Total: ₹{req.po?.totalAmount?.toLocaleString('en-IN')}</p>
          </div>
        </div>
        {!showReject ? (
          <div className="flex gap-2">
            <Button
              onClick={() => decisionMutation.mutate({ action: 'APPROVED' })}
              disabled={decisionMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 flex-1 h-9"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve PO
            </Button>
            <Button variant="outline" onClick={() => setShowReject(true)} className="text-red-600 border-red-200 flex-1 h-9">
              <XCircle className="h-4 w-4 mr-1.5" /> Reject
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              placeholder="Rejection reason (required)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => decisionMutation.mutate({ action: 'REJECTED', reason: rejectionReason })}
                disabled={!rejectionReason.trim() || decisionMutation.isPending}
                className="flex-1 h-9"
              >
                Confirm Rejection
              </Button>
              <Button variant="outline" onClick={() => setShowReject(false)} className="h-9">Cancel</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (req.status === 'APPROVED') {
    return (
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Upload className="h-4 w-4 text-[#2F6B47]" />
            <h3 className="text-sm font-semibold text-gray-800">Upload Vendor Bill</h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">PO approved. Upload vendor bill when received.</p>
        </div>
        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadBill(f); }} />
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || billMutation.isPending}
          variant="outline"
          className="w-full border-dashed h-9"
        >
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? 'Uploading…' : 'Upload Vendor Bill (JPG/PNG/PDF)'}
        </Button>
      </div>
    );
  }

  return null;
}

function ReceiverPanel({ req, onSuccess }: { req: any; onSuccess: () => void }) {
  const { toast }   = useToast();
  const [uploading, setUploading]   = useState(false);
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
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const handleUploadGateBill = async (file: File) => {
    setUploading(true);
    try {
      const result = await api.uploadDocument(file, 'purchase-bills');
      setGateBillData({ url: result.secureUrl || result.url, name: file.name, mime: file.type, publicId: result.publicId });
      toast({ title: 'Gate bill uploaded', description: 'Enter received quantities and submit.' });
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
    <form id={RECEIVE_FORM_ID} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Package className="h-4 w-4 text-[#2F6B47]" />
          <h3 className="text-sm font-semibold text-gray-800">Goods Receipt</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">Received Quantities (KG)</p>
        {receivedItems.map((item: any, i: number) => (
          <div key={i} className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-xs font-medium text-gray-700">{item.materialName}</span>
              <span className="text-xs text-gray-400">Ordered: {item.orderedKg} KG</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number" min="0" step="0.1"
                value={item.receivedKg}
                onChange={(e) => setReceivedItems((prev: any[]) => prev.map((p, idx) => idx === i ? { ...p, receivedKg: e.target.value } : p))}
                className="h-9 text-sm flex-1" placeholder="Received KG"
              />
              {item.receivedKg !== '' && (
                <span className={`text-xs font-medium w-16 text-right ${varianceColor(item.orderedKg, parseFloat(item.receivedKg))}`}>
                  {(parseFloat(item.receivedKg) - item.orderedKg > 0 ? '+' : '')}
                  {(parseFloat(item.receivedKg) - item.orderedKg).toFixed(1)} KG
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Gate Bill (image/PDF) *</label>
        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadGateBill(f); }} />
        <Button
          type="button" variant="outline"
          className={`w-full mt-1 border-dashed h-9 ${gateBillData ? 'border-emerald-400 text-emerald-700' : ''}`}
          onClick={() => fileRef.current?.click()} disabled={uploading}
        >
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? 'Uploading…' : gateBillData ? `✓ ${gateBillData.name}` : 'Upload Gate Bill'}
        </Button>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Remarks (optional)</label>
        <Input className="h-9 text-sm" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any notes on the delivery" />
      </div>
    </form>
  );
}

function DeadlineSetter({ reqId, currentDeadline, onSuccess }: { reqId: string; currentDeadline?: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState('');

  const mutation = useMutation({
    mutationFn: (dueAt: string) => api.setPurchaseDeadline(reqId, dueAt),
    onSuccess: () => { toast({ title: 'Deadline set' }); setValue(''); onSuccess(); },
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  return (
    <div className="border-t pt-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="h-4 w-4 text-[#2F6B47]" />
        <h3 className="text-sm font-semibold text-gray-800">Set Deadline (for this stage)</h3>
      </div>
      <div className="flex gap-2">
        <Input
          type="datetime-local"
          className="h-9 text-xs flex-1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          size="sm" variant="outline" className="h-9 text-xs px-4"
          disabled={!value || mutation.isPending}
          onClick={() => mutation.mutate(new Date(value).toISOString())}
        >
          Set
        </Button>
      </div>
      {currentDeadline?.dueAt && (
        <p className="text-xs text-gray-400 mt-1.5">
          Current: {fmtIST(currentDeadline.dueAt)} (set by {currentDeadline.setByName})
        </p>
      )}
    </div>
  );
}

export default function FmsPurchaseRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAdminAuthStore();
  const isSuperadmin  = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');
  const purchaseRole  = user?.purchaseRole;

  const [notesTab, setNotesTab] = useState<'notes' | 'attachments'>('notes');
  const [noteText, setNoteText] = useState('');

  const { data: req, isLoading, refetch } = useQuery({
    queryKey: ['purchase-request', params.id],
    queryFn:  () => api.getPurchaseRequest(params.id),
    refetchInterval: 15000,
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.cancelPurchaseRequest(params.id, reason),
    onSuccess: () => { toast({ title: 'Request cancelled' }); refetch(); },
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const onActionSuccess = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
    queryClient.invalidateQueries({ queryKey: ['purchase-stats'] });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F7F5F0]">
        <div className="h-8 w-8 border-2 border-[#2F6B47] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!req) return null;

  const canCancel  = !['COMPLETED', 'CANCELLED'].includes(req.status) && (isSuperadmin || req.requestedById === user?.id);
  const holderRole = STATUS_HOLDER[req.status];

  const isMyAction = () => {
    if (req.status === 'COMPLETED' || req.status === 'CANCELLED') return false;
    if (isSuperadmin) return true;
    if (purchaseRole === 'po_creator' && (req.status === 'REQUESTED' || req.status === 'REJECTED')) return true;
    if (purchaseRole === 'approver'   && (req.status === 'PO_CREATED' || req.status === 'APPROVED')) return true;
    if (purchaseRole === 'receiver'   && req.status === 'VENDOR_BILL_UPLOADED') return true;
    return false;
  };
  const showAction = isMyAction();

  const description = req.items?.map((i: any) => `${i.materialName} ${i.qtyKg}KG`).join(', ');

  const isPoCreator = showAction && (isSuperadmin || purchaseRole === 'po_creator') &&
    (req.status === 'REQUESTED' || req.status === 'REJECTED');
  const isReceiver  = showAction && (isSuperadmin || purchaseRole === 'receiver') &&
    req.status === 'VENDOR_BILL_UPLOADED';

  // All 4 stages shown in timeline with pending states
  const allStages = [
    { label: 'Purchase request created', doneStatus: 'REQUESTED' },
    { label: 'PO created',               doneStatus: 'PO_CREATED' },
    { label: 'Approved',                 doneStatus: 'APPROVED' },
    { label: 'Goods received',           doneStatus: 'COMPLETED' },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#F7F5F0]">
      {/* Page header */}
      <div className="bg-[#F7F5F0] border-b border-gray-200 px-6 py-3 flex-shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
          <Link href="/fms/purchase" className="hover:text-[#2F6B47] transition-colors font-medium text-[#2F6B47]">
            Purchase FMS
          </Link>
          <ChevronRight className="h-3 w-3 text-gray-400" />
          <span className="text-gray-600">{req.reqNo}</span>
        </div>
        {/* Title row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{req.reqNo}</h1>
                <StatusBadge status={req.status} />
                {req.deadline && <DeadlineChip deadline={req.deadline} />}
              </div>
              <p className="text-sm text-gray-500 truncate mt-0.5">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button className="h-8 w-8 rounded-md border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <Link href="/fms/purchase">
              <Button variant="outline" size="sm" className="h-8 text-sm bg-white">
                ‹ Back
              </Button>
            </Link>
            {req.po && (
              <button
                onClick={() => window.open(`/fms/purchase/${req._id}/po/print`, '_blank')}
                className="h-8 inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md px-3 bg-white transition-colors"
              >
                <Printer className="h-3.5 w-3.5" /> Print PO
              </button>
            )}
            {isPoCreator && (
              <Button type="submit" form={PO_FORM_ID} size="sm"
                className="h-8 bg-[#2F6B47] hover:bg-[#2F6B47]/90 text-sm font-medium">
                Create Purchase Order <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {isReceiver && (
              <Button type="submit" form={RECEIVE_FORM_ID} size="sm"
                className="h-8 bg-[#2F6B47] hover:bg-[#2F6B47]/90 text-sm font-medium">
                <Package className="h-4 w-4 mr-1.5" /> Mark Goods Received
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Scrollable left + center */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl space-y-5">

            {/* Pipeline */}
            <PipelineTracker req={req} />

            {/* Row 1: Request Details + Items */}
            <div className="grid grid-cols-2 gap-5">

              {/* Request Details */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                  <FileText className="h-4 w-4 text-[#2F6B47]" />
                  <h3 className="text-sm font-semibold text-gray-800">Request Details</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {([
                    ['PR Number',     req.reqNo],
                    ['Requested By',  req.requestedByName],
                    ['Department',    '—'],
                    ['Request Date',  fmtShort(req.createdAt)],
                    ['Required Date', '—'],
                    ['Purpose',       req.note || '—'],
                    ['Status',        <StatusBadge key="s" status={req.status} />],
                    ['Description',   description],
                  ] as Array<[string, any]>).map(([label, value]) => (
                    <div key={label} className="flex items-start gap-4 px-5 py-2.5">
                      <span className="text-xs text-gray-400 w-28 flex-shrink-0 pt-0.5">{label}</span>
                      {typeof value === 'string'
                        ? <span className="text-sm text-gray-800 font-medium flex-1 min-w-0">{value}</span>
                        : <div className="flex-1">{value}</div>
                      }
                    </div>
                  ))}
                </div>
                {req.decision && (
                  <div className={`px-5 py-3 border-t text-xs ${req.decision.action === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    <span className="font-semibold">{req.decision.action}</span> by {req.decision.byName}
                    {req.decision.reason && <div className="mt-0.5">Reason: {req.decision.reason}</div>}
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                  <Package className="h-4 w-4 text-[#2F6B47]" />
                  <h3 className="text-sm font-semibold text-gray-800">Items ({req.items?.length ?? 0})</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-400 px-5 py-2.5 w-8">#</th>
                      <th className="text-left text-xs font-medium text-gray-400 px-2 py-2.5">Item Name</th>
                      <th className="text-right text-xs font-medium text-gray-400 px-2 py-2.5">Quantity</th>
                      <th className="text-left text-xs font-medium text-gray-400 px-2 py-2.5">UOM</th>
                      <th className="text-left text-xs font-medium text-gray-400 px-5 py-2.5">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {req.items?.map((item: any, idx: number) => (
                      <tr key={idx} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-2 py-3 text-gray-800 font-medium">{item.materialName}</td>
                        <td className="px-2 py-3 text-right text-gray-800 font-mono font-medium">{item.qtyKg}</td>
                        <td className="px-2 py-3 text-gray-500">KG</td>
                        <td className="px-5 py-3 text-gray-400 text-xs">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {req.po && (
                  <div className="px-5 py-3 border-t border-gray-100 bg-blue-50">
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-blue-600">
                        <span className="font-semibold">{req.po.poNo}</span> — {req.po.vendorName}
                        {req.po.vendorPhone && <span className="ml-2 text-blue-500">{req.po.vendorPhone}</span>}
                      </div>
                      <div className="text-sm font-bold text-[#2F6B47]">
                        ₹{req.po.totalAmount?.toLocaleString('en-IN')}
                      </div>
                    </div>
                    {req.po.items && (
                      <div className="mt-2 space-y-0.5">
                        {req.po.items.map((i: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-xs text-blue-600">
                            <span>{i.materialName} {i.qtyKg}KG × ₹{i.ratePerKg}/KG</span>
                            <span>₹{i.amount?.toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {req.receipt && (
                  <div className="px-5 py-3 border-t border-gray-100 bg-emerald-50">
                    <p className="text-xs font-semibold text-emerald-700 mb-1">Goods Received</p>
                    {req.receipt.receivedItems?.map((i: any, idx: number) => {
                      const variance = i.receivedKg - i.orderedKg;
                      const pct = Math.abs(variance / i.orderedKg);
                      const color = pct > 0.05 ? 'text-red-600' : variance < 0 ? 'text-amber-600' : 'text-emerald-600';
                      return (
                        <div key={idx} className="flex justify-between text-xs py-0.5">
                          <span className="text-emerald-700">{i.materialName}</span>
                          <span className="text-emerald-600">Ordered: {i.orderedKg}KG | <strong>Rcvd: {i.receivedKg}KG</strong></span>
                          <span className={`font-medium ${color}`}>{variance > 0 ? '+' : ''}{variance.toFixed(1)}KG</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Timeline + Notes */}
            <div className="grid grid-cols-2 gap-5">

              {/* Timeline */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-[#2F6B47]" />
                    <h3 className="text-sm font-semibold text-gray-800">Timeline</h3>
                  </div>
                </div>
                <div className="p-5">
                  {allStages.map((stage, idx) => {
                    const entry  = req.timeline?.find((t: any) => t.status === stage.doneStatus);
                    const isDone = !!entry;
                    const isLast = idx === allStages.length - 1;
                    return (
                      <div key={idx} className="flex gap-3">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className={`h-3 w-3 rounded-full mt-0.5 ${isDone ? 'bg-[#2F6B47]' : 'bg-gray-200'}`} />
                          {!isLast && <div className="w-px flex-1 bg-gray-100 min-h-[20px] my-1" />}
                        </div>
                        <div className="pb-4 flex-1 min-w-0">
                          <p className={`text-sm font-medium leading-tight ${isDone ? 'text-gray-800' : 'text-gray-400'}`}>
                            {isDone && entry.action ? entry.action : stage.label}
                          </p>
                          {isDone && entry ? (
                            <>
                              <p className="text-xs text-gray-500 mt-0.5">by {entry.byName}</p>
                              <p className="text-xs text-gray-400">{fmtShort(entry.at)}</p>
                            </>
                          ) : (
                            <p className="text-xs text-gray-400 mt-0.5">Pending</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attachments & Notes */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-[#2F6B47]" />
                    <h3 className="text-sm font-semibold text-gray-800">Attachments & Notes</h3>
                  </div>
                  <button className="h-7 flex items-center gap-1.5 text-xs font-medium text-white bg-[#2F6B47] hover:bg-[#2F6B47]/90 rounded-lg px-3 transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add Note
                  </button>
                </div>
                {/* Tabs */}
                <div className="flex border-b border-gray-100">
                  <button
                    onClick={() => setNotesTab('notes')}
                    className={`px-5 py-2.5 text-xs font-medium border-b-2 transition-colors ${notesTab === 'notes' ? 'border-[#2F6B47] text-[#2F6B47]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    Notes
                  </button>
                  <button
                    onClick={() => setNotesTab('attachments')}
                    className={`px-5 py-2.5 text-xs font-medium border-b-2 transition-colors ${notesTab === 'attachments' ? 'border-[#2F6B47] text-[#2F6B47]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    Attachments
                  </button>
                </div>
                {notesTab === 'notes' ? (
                  <div className="p-4">
                    <textarea
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 min-h-[90px] resize-none focus:outline-none focus:ring-2 focus:ring-[#2F6B47]/20 focus:border-[#2F6B47]/60 placeholder:text-gray-400"
                      placeholder="Add a note..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value.slice(0, 500))}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-400">{noteText.length}/500 characters</span>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!noteText.trim()}>
                        Add Note
                      </Button>
                    </div>
                    {req.vendorBill && <FileViewer file={req.vendorBill} label="Vendor Bill" />}
                    {req.receipt?.gateBill && <FileViewer file={req.receipt.gateBill} label="Gate Bill" />}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                      <FileText className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-600">No notes yet</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-[200px]">
                      Add a note to keep track of important information about this purchase request.
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-80 border-l border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-hidden">
          <div className="flex-1 overflow-auto p-5 space-y-0">
            {showAction ? (
              <>
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
              </>
            ) : !['COMPLETED', 'CANCELLED'].includes(req.status) ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800">Waiting on {holderRole}</p>
                {req.deadline && <div className="mt-2"><DeadlineChip deadline={req.deadline} /></div>}
              </div>
            ) : req.status === 'COMPLETED' ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-800">Order Closed</p>
                {req.receipt?.at && <p className="text-xs text-emerald-600 mt-1">{fmtIST(req.receipt.at)}</p>}
              </div>
            ) : null}
          </div>

          {/* Bottom CTA buttons */}
          {(showAction && (isPoCreator || isReceiver)) && (
            <div className="border-t border-gray-200 p-4 flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" className="flex-1 h-9 text-sm">
                Save as Draft
              </Button>
              <Button
                type="submit"
                form={isPoCreator ? PO_FORM_ID : RECEIVE_FORM_ID}
                size="sm"
                className="flex-1 h-9 bg-[#2F6B47] hover:bg-[#2F6B47]/90 text-sm font-medium"
              >
                {isPoCreator ? 'Create Purchase Order' : 'Mark Received'}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {canCancel && (
            <div className="border-t border-gray-200 p-4 flex-shrink-0">
              <Button
                variant="outline" size="sm" className="w-full text-red-600 border-red-200 h-9"
                onClick={() => {
                  const reason = prompt('Reason for cancellation:');
                  if (reason?.trim()) cancelMutation.mutate(reason.trim());
                }}
                disabled={cancelMutation.isPending}
              >
                Cancel Request
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
