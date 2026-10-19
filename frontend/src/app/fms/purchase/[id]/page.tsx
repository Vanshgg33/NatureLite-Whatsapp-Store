'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, Upload, Package, ExternalLink, Printer,
  FileText, Paperclip, ChevronRight, History, User, Building2,
  Calendar, AlertCircle, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import { StageBadge, WaitChip } from '@/components/fms/purchase/chips';
import { getStage, getOverdueMs } from '@/lib/fms/stage';
import { fmtDate, shortPr } from '@/lib/fms/format';
import { usePermission } from '@/lib/fms/permissions';

function fmtIST(d: string | Date) {
  return new Date(d).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }) + ' IST';
}

function fmtShort(d: string | Date) {
  return new Date(d).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

const AVATAR_COLORS = ['#1E5E3F','#2F6FB5','#C77700','#4B3FAC','#A3241A','#4A6FA5'];
function nameColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function LockButton({ label, permission }: { label: string; permission: string }) {
  return (
    <div className="relative group inline-block">
      <button
        disabled
        className="h-8 inline-flex items-center gap-1.5 text-xs text-[#B0B8B3] border border-[#ECE9E1] rounded-[10px] px-3 bg-white font-jakarta cursor-not-allowed opacity-60"
      >
        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        {label}
      </button>
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 hidden group-hover:block">
        <div className="bg-[#18211C] text-white text-[11px] font-jakarta px-2.5 py-1.5 rounded-[8px] whitespace-nowrap shadow-md">
          Needs <span className="font-semibold font-jetbrains">{permission}</span> — ask admin
        </div>
      </div>
    </div>
  );
}

function ActorAvatar({ actor, byName, size = 28 }: { actor?: any; byName?: string; size?: number }) {
  const name = actor?.name || byName || '?';
  const initial = name[0]?.toUpperCase() ?? '?';
  if (actor?.photoUrl) {
    return (
      <img src={actor.photoUrl} alt={name}
        className="rounded-full object-cover ring-2 ring-[#1E5E3F]/25 shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center text-white font-semibold ring-2 ring-[#1E5E3F]/15 shrink-0"
      style={{ width: size, height: size, background: nameColor(name), fontSize: Math.round(size * 0.38) }}>
      {initial}
    </div>
  );
}

function FileViewer({ file, label }: { file: { url: string; name: string; mime?: string }; label: string }) {
  const isPdf = file.mime === 'application/pdf' || file.name?.endsWith('.pdf');
  return (
    <div className="border border-[#ECE9E1] rounded-[12px] p-3 bg-[#F7F6F2] mt-3">
      <p className="text-xs font-medium text-[#66706A] mb-2 font-jakarta">{label}</p>
      {isPdf
        ? <iframe src={file.url} className="w-full h-48 border rounded" title={label} />
        : <img src={file.url} alt={label} className="max-h-48 rounded border object-contain" />}
      <a href={file.url} target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-[#1E5E3F] hover:underline font-jakarta">
        <ExternalLink className="h-3 w-3" /> Open
      </a>
    </div>
  );
}

// ─── 5-step pipeline ──────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { n: 1, label: 'Requested',     doneStatus: 'REQUESTED' },
  { n: 2, label: 'PO Created',    doneStatus: 'PO_CREATED' },
  { n: 3, label: 'Approved',      doneStatus: 'APPROVED' },
  { n: 4, label: 'Bill Uploaded', doneStatus: 'VENDOR_BILL_UPLOADED' },
  { n: 5, label: 'Closed',        doneStatus: 'COMPLETED' },
];
const ACTIVE_STEP: Record<string, number> = {
  REQUESTED: 2, REJECTED: 2, PO_CREATED: 3, SPLIT: 3, APPROVED: 4, VENDOR_BILL_UPLOADED: 5,
};

function ChildRollup({ req }: { req: any }) {
  if (req.status !== 'SPLIT' || !req.children?.length) return null;
  const children: any[] = req.children;
  const allDone = children.every((c: any) => c.status === 'COMPLETED');
  return (
    <div className="bg-white rounded-[18px] border border-[#ECE9E1] px-5 py-4 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
      <p className="text-xs font-semibold text-[#4B3FAC] font-jakarta mb-3 uppercase tracking-wider">Child PO Progress</p>
      <div className="space-y-2">
        {children.map((child: any) => {
          const STEPS = ['REQUESTED','PO_CREATED','APPROVED','VENDOR_BILL_UPLOADED','COMPLETED'];
          const step = STEPS.indexOf(child.status);
          const pct = step < 0 ? 0 : Math.round((step / (STEPS.length - 1)) * 100);
          return (
            <Link key={child._id} href={`/fms/purchase/${child._id}`} className="block group">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold font-jetbrains text-[#4B3FAC] group-hover:underline">{child.reqNo}</span>
                  {child.po?.vendorName && <span className="text-[11px] text-[#8A9490] font-jakarta">{child.po.vendorName}</span>}
                </div>
                <StageBadge req={child} />
              </div>
              <div className="h-1.5 rounded-full bg-[#ECE9E1] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: child.status === 'COMPLETED' ? '#1E5E3F' : '#D9902B' }} />
              </div>
            </Link>
          );
        })}
      </div>
      {allDone && (
        <p className="mt-3 text-xs text-[#1E5E3F] font-jakarta font-medium">All child POs completed</p>
      )}
    </div>
  );
}

function PipelineTracker({ req }: { req: any }) {
  const timeline: any[] = req.timeline || [];
  const cancelled = req.status === 'CANCELLED';
  const rejected  = req.status === 'REJECTED';
  const activeN   = cancelled ? 0 : (ACTIVE_STEP[req.status] ?? 0);
  const doneCount = PIPELINE_STAGES.filter(s =>
    !!timeline.find((t: any) => t.status === s.doneStatus) && !cancelled,
  ).length;

  return (
    <div className="bg-white rounded-[18px] border border-[#ECE9E1] px-8 py-5 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
      <div className="relative">
        <div className="absolute top-[18px] left-[10%] right-[10%] h-px bg-[#ECE9E1]" />
        {!cancelled && doneCount > 1 && (
          <div className="absolute top-[18px] h-px bg-[#1E5E3F] transition-all duration-500"
            style={{ left: '10%', width: `${((doneCount - 1) / 4) * 80}%` }} />
        )}
        <div className="flex">
          {PIPELINE_STAGES.map(stage => {
            const entry     = timeline.find((t: any) => t.status === stage.doneStatus);
            const isDone    = !!entry && !cancelled;
            const isActive  = !isDone && !cancelled && stage.n === activeN;
            const isRejHere = rejected && stage.n === 3;
            return (
              <div key={stage.n} className="flex-1 flex flex-col items-center gap-1.5">
                <div className={[
                  'relative z-10 h-9 w-9 rounded-full border-2 flex items-center justify-center text-xs font-semibold font-jakarta',
                  cancelled  ? 'bg-[#F7F6F2] border-[#ECE9E1] text-[#B0B8B3]'
                  : isRejHere? 'bg-[#FDECEA] border-[#E87171] text-[#A3241A]'
                  : isDone   ? 'bg-[#1E5E3F] border-[#1E5E3F] text-white'
                  : isActive ? 'bg-white border-[#D9902B] text-[#8A4B06] shadow-[0_0_0_3px_rgba(217,144,43,0.12)]'
                  :            'bg-white border-[#ECE9E1] text-[#B0B8B3]',
                ].join(' ')}>
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : isRejHere ? <XCircle className="h-4 w-4" /> : stage.n}
                </div>
                <p className={`text-[11px] font-medium font-jakarta text-center leading-tight ${isDone || isActive ? 'text-[#18211C]' : 'text-[#8A9490]'}`}>
                  {stage.label}
                </p>
                {isRejHere ? (
                  <p className="text-[10px] text-[#A3241A] font-jakarta">Rejected</p>
                ) : entry ? (
                  <div className="flex flex-col items-center gap-0.5 mt-0.5">
                    <ActorAvatar actor={entry.actor} byName={entry.byName} size={24} />
                    <p className="text-[10px] font-medium text-[#18211C] font-jakarta leading-tight truncate max-w-[72px] text-center">
                      {entry.actor?.name || entry.byName}
                    </p>
                    {entry.actor?.designation && (
                      <p className="text-[9px] text-[#8A9490] font-jakarta leading-tight truncate max-w-[72px] text-center">
                        {entry.actor.designation}
                      </p>
                    )}
                    <p className="text-[9px] text-[#B0B8B3] font-jakarta leading-tight text-center">{fmtShort(entry.at)}</p>
                  </div>
                ) : isActive ? (
                  <p className="text-[10px] text-[#8A4B06] font-jakarta font-medium">Awaiting…</p>
                ) : null}
              </div>
            );
          })}
        </div>
        {cancelled && <p className="text-center text-xs text-[#8A9490] mt-3 font-jakarta">This request was cancelled</p>}
      </div>
    </div>
  );
}

// ─── Next-step banner ─────────────────────────────────────────────────────────

function NextStepBanner({ req, purchaseRole, isSuperadmin }: { req: any; purchaseRole?: string; isSuperadmin: boolean }) {
  const stage = getStage(req);
  const overdueMs = getOverdueMs(req, stage);
  const OPEN = ['NEEDS_PO','AWAITING_APPROVAL','AWAITING_DELIVERY','PARTLY_RECEIVED','READY_TO_CLOSE'];
  if (!OPEN.includes(stage)) return null;

  const myTurn = isSuperadmin ||
    (purchaseRole === 'po_creator' && stage === 'NEEDS_PO') ||
    (purchaseRole === 'approver'   && stage === 'AWAITING_APPROVAL') ||
    (purchaseRole === 'receiver'   && (stage === 'AWAITING_DELIVERY' || stage === 'PARTLY_RECEIVED'));

  const actionPath =
    stage === 'NEEDS_PO'          ? `/fms/purchase/${req._id}/raise-po` :
    stage === 'AWAITING_APPROVAL' ? `/fms/purchase/${req._id}/approve`  :
    (stage === 'AWAITING_DELIVERY' || stage === 'PARTLY_RECEIVED') ? `/fms/purchase/${req._id}/receive` :
    null;

  const actionLabel =
    stage === 'NEEDS_PO'          ? 'Create PO'       :
    stage === 'AWAITING_APPROVAL' ? 'Review & Approve' :
    (stage === 'AWAITING_DELIVERY' || stage === 'PARTLY_RECEIVED') ? 'Receive Goods' :
    stage === 'READY_TO_CLOSE'    ? 'Ready to close'  : '';

  const roleLabel =
    stage === 'NEEDS_PO'          ? 'Purchase Desk' :
    stage === 'AWAITING_APPROVAL' ? 'Approver'       : 'Receiver / Gate';

  if (myTurn && actionPath) {
    const isOD = overdueMs !== null;
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-[12px] border font-jakarta text-sm"
        style={{ background: isOD ? '#FDECEA' : '#EAF3EE', borderColor: isOD ? '#F3C7C2' : '#B8DFC8', color: isOD ? '#A3241A' : '#1E5E3F' }}>
        <span className="flex-1 font-medium">{isOD ? '⏰ Overdue — ' : '→ Your turn — '}{actionLabel}</span>
        <Link href={actionPath}>
          <button className="text-xs font-semibold px-3 py-1.5 rounded-[10px] text-white font-jakarta"
            style={{ background: isOD ? '#A3241A' : '#1E5E3F' }}>
            {actionLabel} <ArrowRight className="inline h-3 w-3 ml-0.5" />
          </button>
        </Link>
      </div>
    );
  }
  if (stage === 'READY_TO_CLOSE') {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-[12px] border border-[#B8DFC8] bg-[#EAF3EE] text-[#1E5E3F] text-sm font-jakarta">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="font-medium">All goods received — close the request</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-[12px] border border-[#ECE9E1] bg-[#FAF9F5] text-sm text-[#66706A] font-jakarta">
      <span className="text-[#B0B8B3]">◷</span>
      Waiting on <span className="font-medium text-[#3E4A43] ml-1">{roleLabel}</span>
    </div>
  );
}

// ─── Inline quick-action panels ───────────────────────────────────────────────

const PO_FORM_ID      = 'po-creator-form';
const RECEIVE_FORM_ID = 'receive-goods-form';

function POCreatorPanel({ req, onSuccess }: { req: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [poItems, setPoItems] = useState(
    req.items.map((i: any) => ({ ...i, ratePerKg: '', vendorId: '', vendorName: '', vendorPhone: '', vendorAddress: '', terms: '' }))
  );
  const { data: vendors = [] } = useQuery({ queryKey: ['purchase-vendors'], queryFn: () => api.getPurchaseVendors() });
  const applyVendor = (idx: number, vid: string) => {
    const v = vendors.find((x: any) => x._id === vid);
    if (!v) return;
    setPoItems((prev: any[]) => prev.map((p, i) => i !== idx ? p :
      { ...p, vendorId: v._id, vendorName: v.name, vendorPhone: v.phone || '', vendorAddress: v.address || '', terms: v.paymentTerms || '' }
    ));
  };
  const mutation = useMutation({
    mutationFn: (data: any) => api.splitPurchasePO(req._id, data),
    onSuccess: () => { toast({ title: 'POs created' }); onSuccess(); },
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });
  const total = poItems.reduce((s: number, i: any) => s + (i.qtyKg * (parseFloat(i.ratePerKg) || 0)), 0);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const item of poItems) {
      if (!item.vendorName) { toast({ title: `Select vendor for ${item.materialName}`, variant: 'destructive' }); return; }
      if (!item.ratePerKg || parseFloat(item.ratePerKg) <= 0) { toast({ title: `Enter rate for ${item.materialName}`, variant: 'destructive' }); return; }
    }
    mutation.mutate({
      expectedDelivery,
      items: poItems.map((i: any) => ({
        materialId: i.materialId, materialName: i.materialName, qtyKg: i.qtyKg,
        ratePerKg: parseFloat(i.ratePerKg), vendorName: i.vendorName,
        vendorPhone: i.vendorPhone, vendorAddress: i.vendorAddress, terms: i.terms,
      })),
    });
  };
  return (
    <form id={PO_FORM_ID} onSubmit={handleSubmit} className="space-y-3">
      <Link href={`/fms/purchase/${req._id}/raise-po`}
        className="block text-center text-xs text-[#1E5E3F] hover:underline font-jakarta">
        Full PO creation →
      </Link>
      <Input type="date" className="h-8 text-xs font-jakarta" value={expectedDelivery}
        onChange={e => setExpectedDelivery(e.target.value)} placeholder="Expected delivery" />
      {poItems.map((item: any, i: number) => (
        <div key={i} className="rounded-[12px] border border-[#ECE9E1] bg-[#FAF9F5] p-2.5 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-xs font-semibold text-[#18211C] font-jakarta">{item.materialName}</span>
            <span className="text-[11px] text-[#8A9490] font-jetbrains">{item.qtyKg} {item.uom || 'kg'}</span>
          </div>
          <select className="w-full h-7 rounded-[8px] border border-[#ECE9E1] bg-white px-2 text-xs font-jakarta"
            value={item.vendorId} onChange={e => applyVendor(i, e.target.value)}>
            <option value="">— vendor —</option>
            {vendors.map((v: any) => <option key={v._id} value={v._id}>{v.name}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <span className="h-7 flex items-center px-2 border border-r-0 rounded-l-[8px] bg-white text-xs text-[#66706A] shrink-0 font-jakarta">₹/kg</span>
            <Input type="number" min="0" step="0.01" value={item.ratePerKg} placeholder="rate"
              onChange={e => setPoItems((p: any[]) => p.map((x, idx) => idx !== i ? x : { ...x, ratePerKg: e.target.value }))}
              className="h-7 text-xs rounded-l-none flex-1 font-jetbrains" />
            {item.ratePerKg && parseFloat(item.ratePerKg) > 0 && (
              <span className="text-xs text-[#1E5E3F] font-medium w-16 text-right shrink-0 font-jetbrains">
                ₹{(item.qtyKg * parseFloat(item.ratePerKg)).toLocaleString('en-IN')}
              </span>
            )}
          </div>
        </div>
      ))}
      {total > 0 && (
        <div className="rounded-[12px] bg-[#EAF3EE] border border-[#B8DFC8] px-3 py-2 flex justify-between">
          <span className="text-xs font-medium text-[#1E5E3F] font-jakarta">Total</span>
          <span className="text-sm font-bold text-[#1E5E3F] font-jetbrains">₹{total.toLocaleString('en-IN')}</span>
        </div>
      )}
    </form>
  );
}

function SplitApproverCards({ items, onSuccess }: { items: any[]; onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejReasons, setRejReasons] = useState<Record<string, string>>({});
  const [showReject, setShowReject] = useState<Record<string, boolean>>({});

  const decisionMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.makePurchaseDecision(id, data),
    onSuccess: () => {
      toast({ title: 'Decision recorded' });
      queryClient.invalidateQueries({ queryKey: ['purchase-request'] });
      onSuccess();
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const approvable = items.filter((c: any) => c.status === 'PO_CREATED');
  if (!approvable.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[#1F4F8A] font-jakarta uppercase tracking-wider">
        Pending approval ({approvable.length})
      </p>
      {approvable.map((child: any) => (
        <div key={child._id} className="rounded-[12px] border border-[#C8D9F0] bg-[#EDF3FB] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold font-jetbrains text-[#1F4F8A]">{child.reqNo}</span>
              {child.po?.vendorName && <span className="ml-1.5 text-xs text-[#3A5C8A] font-jakarta">{child.po.vendorName}</span>}
            </div>
            {child.po?.totalAmount && (
              <span className="text-sm font-bold font-jetbrains text-[#1E5E3F]">₹{child.po.totalAmount.toLocaleString('en-IN')}</span>
            )}
          </div>
          {child.po?.items?.map((item: any, idx: number) => (
            <div key={idx} className="flex justify-between text-xs text-[#1F4F8A] font-jakarta">
              <span>{item.materialName} {item.qtyKg} {item.uom || 'kg'} × ₹{item.ratePerKg}/kg</span>
              <span className="font-medium">₹{item.amount?.toLocaleString('en-IN')}</span>
            </div>
          ))}
          {showReject[child._id] ? (
            <div className="space-y-1.5">
              <input
                className="w-full h-8 rounded-[8px] border border-[#C8D9F0] px-2 text-xs font-jakarta focus:outline-none"
                placeholder="Reason for rejection…"
                value={rejReasons[child._id] || ''}
                onChange={e => setRejReasons(p => ({ ...p, [child._id]: e.target.value }))}
              />
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs font-jakarta"
                  onClick={() => setShowReject(p => ({ ...p, [child._id]: false }))}>
                  Cancel
                </Button>
                <Button size="sm" className="flex-1 h-7 text-xs text-white font-jakarta bg-red-600 hover:bg-red-700"
                  disabled={!rejReasons[child._id]?.trim() || decisionMut.isPending}
                  onClick={() => decisionMut.mutate({ id: child._id, data: { action: 'REJECTED', reason: rejReasons[child._id] } })}>
                  Confirm Reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Button size="sm" className="flex-1 h-7 text-xs text-white font-jakarta" style={{ background: '#1E5E3F' }}
                disabled={decisionMut.isPending}
                onClick={() => decisionMut.mutate({ id: child._id, data: { action: 'APPROVED' } })}>
                Approve
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs font-jakarta border-red-200 text-red-600"
                onClick={() => setShowReject(p => ({ ...p, [child._id]: true }))}>
                Reject
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ApproverPanel({ req, onSuccess }: { req: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [rejReason, setRejReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const decisionMut = useMutation({
    mutationFn: (data: any) => api.makePurchaseDecision(req._id, data),
    onSuccess: () => { toast({ title: 'Decision recorded' }); onSuccess(); },
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });
  const billMut = useMutation({
    mutationFn: (data: any) => api.uploadPurchaseVendorBill(req._id, data),
    onSuccess: () => { toast({ title: 'Bill uploaded' }); onSuccess(); },
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });
  const handleBill = async (file: File) => {
    setUploading(true);
    try {
      const r = await api.uploadDocument(file, 'purchase-bills');
      await billMut.mutateAsync({ url: r.secureUrl || r.url, name: file.name, mime: file.type, publicId: r.publicId });
    } catch (err) { toast({ title: 'Upload failed', description: getApiError(err), variant: 'destructive' });
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const handleDelBill = async (publicId: string) => {
    setDeletingId(publicId);
    try { await api.deletePurchaseVendorBill(req._id, publicId); toast({ title: 'Removed' }); onSuccess(); }
    catch (err) { toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }); }
    finally { setDeletingId(null); }
  };

  if (req.status === 'PO_CREATED') {
    return (
      <div className="space-y-3">
        <Link href={`/fms/purchase/${req._id}/approve`}
          className="block text-center text-xs text-[#1E5E3F] hover:underline font-jakarta">
          Full approval view →
        </Link>
        <div className="rounded-[12px] border border-[#C8D9F0] bg-[#EDF3FB] p-3 space-y-1">
          <p className="text-xs text-[#1F4F8A] font-jakarta">PO: <span className="font-semibold">{req.po?.poNo}</span></p>
          <p className="text-sm font-medium text-[#18211C] font-jakarta">{req.po?.vendorName}</p>
          {req.po?.vendorPhone && <p className="text-xs text-[#3A5C8A] font-jakarta">{req.po.vendorPhone}</p>}
          {req.po?.expectedDelivery && <p className="text-xs text-[#3A5C8A] font-jakarta">Delivery: {fmtShort(req.po.expectedDelivery)}</p>}
          <p className="text-sm font-bold text-[#1E5E3F] font-jetbrains">₹{req.po?.totalAmount?.toLocaleString('en-IN')}</p>
        </div>
        {!showReject ? (
          <div className="flex gap-2">
            <Button onClick={() => decisionMut.mutate({ action: 'APPROVED' })} disabled={decisionMut.isPending}
              className="flex-1 h-8 text-xs bg-[#1E5E3F] hover:bg-[#17382A] font-jakarta rounded-[10px]">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
            <Button variant="outline" onClick={() => setShowReject(true)}
              className="text-red-600 border-red-200 flex-1 h-8 text-xs font-jakarta rounded-[10px]">
              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input placeholder="Rejection reason" value={rejReason} onChange={e => setRejReason(e.target.value)} className="h-8 text-xs font-jakarta" />
            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1 h-8 text-xs font-jakarta rounded-[10px]"
                onClick={() => decisionMut.mutate({ action: 'REJECTED', reason: rejReason })}
                disabled={!rejReason.trim() || decisionMut.isPending}>Confirm</Button>
              <Button variant="outline" className="h-8 text-xs font-jakarta rounded-[10px]" onClick={() => setShowReject(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (req.status === 'APPROVED' || req.status === 'VENDOR_BILL_UPLOADED') {
    const bills: any[] = req.vendorBills?.length ? req.vendorBills : req.vendorBill ? [req.vendorBill] : [];
    return (
      <div className="space-y-2">
        {bills.map(bill => (
          <div key={bill.publicId} className="flex items-center justify-between rounded-[10px] border border-[#ECE9E1] bg-[#FAF9F5] px-3 py-2">
            <a href={bill.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[#1E5E3F] hover:underline truncate flex-1 min-w-0 mr-2 font-jakarta">{bill.name}</a>
            <button onClick={() => handleDelBill(bill.publicId)} disabled={deletingId === bill.publicId}
              className="text-red-400 hover:text-red-600 text-sm font-medium px-1">
              {deletingId === bill.publicId ? '…' : '×'}
            </button>
          </div>
        ))}
        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleBill(f); }} />
        <Button onClick={() => fileRef.current?.click()} disabled={uploading || billMut.isPending}
          variant="outline" className="w-full border-dashed h-8 text-xs font-jakarta rounded-[10px]">
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          {uploading ? 'Uploading…' : bills.length ? 'Upload Another' : 'Upload Vendor Bill'}
        </Button>
      </div>
    );
  }
  return null;
}

function ReceiverPanel({ req, onSuccess }: { req: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [uploading, setUploading]   = useState(false);
  const [gateBill, setGateBill]     = useState<any>(null);
  const [items, setItems]           = useState(
    (req.po?.items || req.items || []).map((i: any) => ({ materialName: i.materialName, orderedKg: i.qtyKg, receivedKg: '' }))
  );
  const [remarks, setRemarks]       = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const receiveMut = useMutation({
    mutationFn: (data: any) => api.receivePurchaseGoods(req._id, data),
    onSuccess: () => { toast({ title: 'Goods receipt recorded' }); onSuccess(); },
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gateBill) { toast({ title: 'Upload gate bill first', variant: 'destructive' }); return; }
    for (const item of items) {
      if (item.receivedKg === '' || isNaN(parseFloat(item.receivedKg))) {
        toast({ title: 'Enter received qty for all items', variant: 'destructive' }); return;
      }
    }
    receiveMut.mutate({ gateBill, receivedItems: items.map((i: any) => ({ ...i, receivedKg: parseFloat(i.receivedKg) })), remarks });
  };
  return (
    <form id={RECEIVE_FORM_ID} onSubmit={handleSubmit} className="space-y-3">
      <Link href={`/fms/purchase/${req._id}/receive`}
        className="block text-center text-xs text-[#1E5E3F] hover:underline font-jakarta">
        Full receive view (mobile-friendly) →
      </Link>
      {items.map((item: any, i: number) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between">
            <span className="text-xs font-medium text-[#18211C] font-jakarta">{item.materialName}</span>
            <span className="text-[11px] text-[#8A9490] font-jetbrains">ordered {item.orderedKg}</span>
          </div>
          <Input type="number" min="0" step="0.1" value={item.receivedKg} placeholder="Received qty"
            onChange={e => setItems((p: any[]) => p.map((x, idx) => idx !== i ? x : { ...x, receivedKg: e.target.value }))}
            className="h-8 text-xs font-jetbrains" />
        </div>
      ))}
      <div>
        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]; if (!f) return;
            setUploading(true);
            api.uploadDocument(f, 'purchase-bills')
              .then(r => setGateBill({ url: r.secureUrl || r.url, name: f.name, mime: f.type, publicId: r.publicId }))
              .catch(() => toast({ title: 'Upload failed', variant: 'destructive' }))
              .finally(() => setUploading(false));
          }} />
        {gateBill ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-[#B8DFC8] bg-[#EAF3EE] px-3 py-2">
            <span className="text-xs text-[#1E5E3F] flex-1 truncate font-jakarta">✓ {gateBill.name}</span>
            <button type="button" onClick={() => setGateBill(null)} className="text-red-400 hover:text-red-600 text-sm">×</button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="w-full border-dashed h-8 text-xs font-jakarta rounded-[10px]"
            onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />{uploading ? 'Uploading…' : 'Gate Bill'}
          </Button>
        )}
      </div>
    </form>
  );
}

function DeadlineSetter({ reqId, currentDeadline, onSuccess }: { reqId: string; currentDeadline?: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState('');
  const mut = useMutation({
    mutationFn: (dueAt: string) => api.setPurchaseDeadline(reqId, dueAt),
    onSuccess: () => { toast({ title: 'Deadline set' }); setValue(''); onSuccess(); },
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });
  return (
    <div className="border-t border-[#ECE9E1] pt-3 mt-3">
      <p className="text-[11px] font-semibold text-[#8A9490] uppercase tracking-[0.07em] font-jakarta mb-2">Set Deadline</p>
      <div className="flex gap-2">
        <Input type="datetime-local" className="h-7 text-xs flex-1 font-jakarta" value={value} onChange={e => setValue(e.target.value)} />
        <Button size="sm" variant="outline" className="h-7 text-xs font-jakarta px-3 rounded-[8px]"
          disabled={!value || mut.isPending} onClick={() => mut.mutate(new Date(value).toISOString())}>Set</Button>
      </div>
      {currentDeadline?.dueAt && (
        <p className="text-[10px] text-[#8A9490] mt-1 font-jakarta">Current: {fmtIST(currentDeadline.dueAt)}</p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FmsPurchaseRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAdminAuthStore();
  const isSuperadmin = user?.role === 'superadmin';
  const purchaseRole = user?.purchaseRole;
  const canRaisePO   = usePermission('po.raise');
  const canApprove   = usePermission('po.approve');
  const canReceive   = usePermission('delivery.receive');
  const canCancel_p  = usePermission('request.cancel');

  const [notesTab, setNotesTab] = useState<'notes' | 'attachments'>('notes');

  const { data: req, isLoading, refetch } = useQuery({
    queryKey: ['purchase-request', params.id],
    queryFn:  () => api.getPurchaseRequest(params.id),
    refetchInterval: 15000,
  });
  const cancelMut = useMutation({
    mutationFn: (reason: string) => api.cancelPurchaseRequest(params.id, reason),
    onSuccess: () => { toast({ title: 'Request cancelled' }); refetch(); },
    onError:   (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });
  const onActionSuccess = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
    queryClient.invalidateQueries({ queryKey: ['purchase-summary'] });
  };

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center" style={{ background: '#F7F6F2' }}>
      <div className="h-8 w-8 border-2 border-[#1E5E3F] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!req) return null;

  const canCancel   = !['COMPLETED','CANCELLED'].includes(req.status) && (isSuperadmin || canCancel_p || req.requestedById === user?.id);
  // Stage-based flags — show action area to ALL users so lock buttons appear for those without permission
  const needsPOStage  = req.status === 'REQUESTED' || req.status === 'REJECTED' || (req.status === 'SPLIT' && (req.items || []).some((i: any) => i.lineStatus === 'NEEDS_PO'));
  const appStage      = req.status === 'PO_CREATED' || req.status === 'APPROVED' || req.status === 'VENDOR_BILL_UPLOADED';
  const rcvStage      = req.status === 'VENDOR_BILL_UPLOADED';
  const showPOPanel   = canRaisePO && (req.status === 'REQUESTED' || req.status === 'REJECTED');
  const showAppPanel  = canApprove && appStage;
  const showRcvPanel  = canReceive && rcvStage;

  const description = req.items?.map((i: any) => `${i.materialName} ${i.qtyKg} ${i.uom || 'kg'}`).join(', ');

  return (
    <div className="flex flex-col h-screen" style={{ background: '#F7F6F2' }}>
      {/* ── Header ── */}
      <div className="bg-white border-b border-[#ECE9E1] px-6 py-3 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-[#8A9490] mb-1.5 font-jakarta">
          <Link href="/fms/purchase" className="text-[#1E5E3F] font-medium hover:underline">Purchase FMS</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-jetbrains">{shortPr(req.reqNo)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-fraunces text-[22px] font-semibold text-[#18211C]">{shortPr(req.reqNo)}</h1>
              <StageBadge req={req} />
              <WaitChip req={req} />
            </div>
            <p className="text-xs text-[#8A9490] font-jakarta mt-0.5 truncate max-w-[480px]">{description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {req.po && (
              <button onClick={() => window.open(`/fms/purchase/${req._id}/po/print`, '_blank')}
                className="h-8 inline-flex items-center gap-1.5 text-xs text-[#66706A] hover:text-[#18211C] border border-[#ECE9E1] rounded-[10px] px-3 bg-white font-jakarta">
                <Printer className="h-3.5 w-3.5" /> Print PO
              </button>
            )}
            <Link href="/fms/purchase">
              <Button variant="outline" size="sm" className="h-8 text-xs font-jakarta rounded-[10px]">‹ Back</Button>
            </Link>
            {needsPOStage && !canRaisePO && <LockButton label="Create PO" permission="po.raise" />}
            {needsPOStage && canRaisePO && (
              <Link href={`/fms/purchase/${req._id}/raise-po`}>
                <Button size="sm" className="h-8 text-xs font-jakarta rounded-[10px] text-white" style={{ background: '#1E5E3F' }}>
                  Create PO <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            )}
            {appStage && req.status === 'PO_CREATED' && !canApprove && <LockButton label="Review & Approve" permission="po.approve" />}
            {appStage && req.status === 'PO_CREATED' && canApprove && (
              <Link href={`/fms/purchase/${req._id}/approve`}>
                <Button size="sm" className="h-8 text-xs font-jakarta rounded-[10px] text-white" style={{ background: '#1E5E3F' }}>
                  Review & Approve <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            )}
            {rcvStage && !canReceive && <LockButton label="Receive Goods" permission="delivery.receive" />}
            {rcvStage && canReceive && (
              <Link href={`/fms/purchase/${req._id}/receive`}>
                <Button size="sm" className="h-8 text-xs font-jakarta rounded-[10px] text-white" style={{ background: '#1E5E3F' }}>
                  Receive Goods <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl space-y-4">

            <NextStepBanner req={req} purchaseRole={purchaseRole} isSuperadmin={isSuperadmin} />
            <PipelineTracker req={req} />
            <ChildRollup req={req} />

            {/* Items */}
            <div className="bg-white rounded-[18px] border border-[#ECE9E1] overflow-hidden shadow-[0_1px_2px_rgba(24,33,28,.06)]">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-[#ECE9E1]">
                <Package className="h-4 w-4 text-[#1E5E3F]" />
                <h3 className="text-sm font-semibold text-[#18211C] font-jakarta">Items ({req.items?.length ?? 0})</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: '#FAF9F5' }} className="border-b border-[#ECE9E1]">
                    {['#','Material','Qty','UOM','Notes'].map(h => (
                      <th key={h} className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[#8A9490] font-jakarta">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {req.items?.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b border-[#F5F3EE] last:border-0 hover:bg-[#FAF9F5]">
                      <td className="px-5 py-3 text-[#8A9490] text-xs font-jetbrains">{idx + 1}</td>
                      <td className="px-5 py-3 text-[#18211C] font-medium font-jakarta">{item.materialName}</td>
                      <td className="px-5 py-3 text-[#18211C] font-jetbrains font-medium">{item.qtyKg}</td>
                      <td className="px-5 py-3 text-[#66706A] font-jakarta">{item.uom || 'kg'}</td>
                      <td className="px-5 py-3 text-[#8A9490] text-xs font-jakarta">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {req.po && (
                <div className="px-5 py-3 border-t border-[#ECE9E1] bg-[#EDF3FB]">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-xs text-[#1F4F8A] font-jakarta">
                      <span className="font-semibold">{req.po.poNo}</span> — {req.po.vendorName}
                      {req.po.vendorPhone && <span className="ml-2">{req.po.vendorPhone}</span>}
                    </div>
                    <span className="text-sm font-bold text-[#1E5E3F] font-jetbrains">₹{req.po.totalAmount?.toLocaleString('en-IN')}</span>
                  </div>
                  {req.po.items?.map((i: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs text-[#1F4F8A] font-jakarta py-0.5">
                      <span>{i.materialName} {i.qtyKg} {i.uom || 'kg'} × ₹{i.ratePerKg}/kg</span>
                      <span className="font-medium">₹{i.amount?.toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
              {req.status === 'SPLIT' && req.children?.length > 0 && (
                <div className="px-5 py-3 border-t border-[#ECE9E1]" style={{ background: '#F5F3FF' }}>
                  <p className="text-xs font-semibold mb-2 font-jakarta" style={{ color: '#4B3FAC' }}>
                    Split into {req.children.length} vendor POs
                  </p>
                  {req.children.map((child: any) => (
                    <Link key={child._id} href={`/fms/purchase/${child._id}`}
                      className="flex items-center justify-between py-1.5 hover:bg-white/60 rounded px-1 -mx-1">
                      <div className="text-xs font-jakarta" style={{ color: '#4B3FAC' }}>
                        <span className="font-semibold font-jetbrains">{child.reqNo}</span>
                        <span className="ml-1 opacity-60">— {child.po?.vendorName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StageBadge req={child} />
                        <span className="text-xs font-bold font-jetbrains text-[#1E5E3F]">₹{child.po?.totalAmount?.toLocaleString('en-IN')}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {req.receipt && (
                <div className="px-5 py-3 border-t border-[#ECE9E1] bg-[#EAF3EE]">
                  <p className="text-xs font-semibold text-[#1E5E3F] mb-1 font-jakarta">Goods Received</p>
                  {req.receipt.receivedItems?.map((i: any, idx: number) => {
                    const v = i.receivedKg - i.orderedKg;
                    const pct = Math.abs(v / i.orderedKg);
                    const c = pct > 0.05 ? '#A3241A' : v < 0 ? '#8A4B06' : '#1E5E3F';
                    return (
                      <div key={idx} className="flex justify-between text-xs py-0.5 font-jakarta">
                        <span className="text-[#1E5E3F]">{i.materialName}</span>
                        <span className="text-[#3E6B50]">ordered {i.orderedKg} · <strong>rcvd {i.receivedKg}</strong></span>
                        <span className="font-medium font-jetbrains" style={{ color: c }}>{v > 0 ? '+' : ''}{v.toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Timeline + Notes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-[18px] border border-[#ECE9E1] overflow-hidden shadow-[0_1px_2px_rgba(24,33,28,.06)]">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-[#ECE9E1]">
                  <History className="h-4 w-4 text-[#1E5E3F]" />
                  <h3 className="text-sm font-semibold text-[#18211C] font-jakarta">Timeline</h3>
                  {req.timeline?.length > 0 && (
                    <span className="ml-auto text-[11px] text-[#8A9490] font-jakarta">{req.timeline.length} event{req.timeline.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <div className="p-5 space-y-0">
                  {(!req.timeline || req.timeline.length === 0) ? (
                    <p className="text-xs text-[#B0B8B3] font-jakarta text-center py-4">No events yet.</p>
                  ) : (req.timeline as any[]).map((entry: any, idx: number) => {
                    const isLast = idx === req.timeline.length - 1;
                    const actorName = entry.actor?.name || entry.byName || '?';
                    return (
                      <div key={idx} className="flex gap-3">
                        {/* Left: avatar + connector line */}
                        <div className="flex flex-col items-center shrink-0">
                          <ActorAvatar actor={entry.actor} byName={entry.byName} size={28} />
                          {!isLast && <div className="w-px flex-1 bg-[#ECE9E1] min-h-[16px] my-1" />}
                        </div>
                        {/* Right: content */}
                        <div className="pb-4 flex-1 min-w-0 pt-0.5">
                          <p className="text-sm font-medium text-[#18211C] font-jakarta leading-snug">
                            {entry.action || entry.status}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-xs font-medium text-[#3E4A43] font-jakarta">{actorName}</span>
                            {entry.actor?.designation && (
                              <span className="text-xs text-[#8A9490] font-jakarta">· {entry.actor.designation}</span>
                            )}
                            <span className="text-xs text-[#B0B8B3] font-jakarta">· {fmtDate(entry.at)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-[18px] border border-[#ECE9E1] overflow-hidden shadow-[0_1px_2px_rgba(24,33,28,.06)]">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-[#ECE9E1]">
                  <Paperclip className="h-4 w-4 text-[#1E5E3F]" />
                  <h3 className="text-sm font-semibold text-[#18211C] font-jakarta">Notes & Files</h3>
                </div>
                <div className="flex border-b border-[#ECE9E1]">
                  {(['notes','attachments'] as const).map(tab => (
                    <button key={tab} onClick={() => setNotesTab(tab)}
                      className={`px-5 py-2 text-xs font-medium font-jakarta border-b-2 capitalize ${notesTab === tab ? 'border-[#1E5E3F] text-[#1E5E3F]' : 'border-transparent text-[#66706A] hover:text-[#18211C]'}`}>
                      {tab}
                    </button>
                  ))}
                </div>
                {notesTab === 'notes' ? (
                  <div className="p-4">
                    {(() => {
                      const bills = req.vendorBills?.length ? req.vendorBills : req.vendorBill ? [req.vendorBill] : [];
                      const billEntries = (req.timeline || []).filter((t: any) => t.status === 'VENDOR_BILL_UPLOADED');
                      return bills.map((bill: any, i: number) => {
                        const entry = billEntries[i];
                        const uploadedAt = entry?.at;
                        return (
                          <div key={bill.publicId || i}>
                            <FileViewer file={bill} label={bills.length > 1 ? `Vendor Bill ${i + 1}` : 'Vendor Bill'} />
                            {uploadedAt && (
                              <p className="text-[10px] text-[#8A9490] font-jakarta mt-1 ml-1">
                                Uploaded {fmtIST(uploadedAt)}{entry?.actor?.name || entry?.byName ? ` by ${entry.actor?.name || entry.byName}` : ''}
                              </p>
                            )}
                          </div>
                        );
                      });
                    })()}
                    {req.receipt?.gateBill && (
                      <div>
                        <FileViewer file={req.receipt.gateBill} label="Gate Bill" />
                        {req.receipt.at && (
                          <p className="text-[10px] text-[#8A9490] font-jakarta mt-1 ml-1">
                            Uploaded {fmtIST(req.receipt.at)}{req.receipt.byName ? ` by ${req.receipt.byName}` : ''}
                          </p>
                        )}
                      </div>
                    )}
                    {!req.vendorBills?.length && !req.vendorBill && !req.receipt?.gateBill && (
                      <p className="text-xs text-[#B0B8B3] font-jakarta text-center py-4">No documents yet.</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="h-10 w-10 rounded-full bg-[#F7F6F2] flex items-center justify-center mb-3">
                      <FileText className="h-5 w-5 text-[#B0B8B3]" />
                    </div>
                    <p className="text-sm font-medium text-[#66706A] font-jakarta">No attachments yet</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className="w-72 border-l border-[#ECE9E1] bg-white flex flex-col shrink-0 overflow-hidden">
          {/* Metadata */}
          <div className="p-4 border-b border-[#ECE9E1]">
            <p className="text-[11px] font-semibold text-[#8A9490] uppercase tracking-[0.07em] font-jakarta mb-3">Request Info</p>
            {[
              { Icon: User,      label: 'Requester',    value: req.requestedByName },
              { Icon: Building2, label: 'Department',   value: req.department || '—' },
              { Icon: Calendar,  label: 'Required by',  value: req.requiredBy ? fmtDate(req.requiredBy) : '—' },
              { Icon: FileText,  label: 'Purpose',      value: req.note || req.purpose || '—' },
            ].map(({ Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2 py-1.5">
                <Icon className="h-3.5 w-3.5 text-[#B0B8B3] shrink-0 mt-0.5" />
                <span className="text-[11px] text-[#8A9490] font-jakarta w-20 shrink-0">{label}</span>
                <span className={`text-xs font-medium font-jakarta flex-1 min-w-0 ${!value || value === '—' ? 'text-[#D9902B]' : 'text-[#18211C]'}`}>
                  {value || '—'}
                </span>
              </div>
            ))}
            {(!req.department || !req.requiredBy) && (
              <div className="mt-2 flex items-start gap-1.5 rounded-[10px] bg-[#FDF3E3] border border-[#F5D798] p-2">
                <AlertCircle className="h-3.5 w-3.5 text-[#8A4B06] shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#8A4B06] font-jakarta">Missing fields affect overdue tracking.</p>
              </div>
            )}
          </div>

          {/* Action panels */}
          <div className="flex-1 overflow-auto p-4">
            {req.status === 'SPLIT' ? (
              <div className="space-y-3">
                {/* Pending PO items — orange block */}
                {(() => {
                  const pendingItems = (req.items || []).filter((i: any) => !i.lineStatus || i.lineStatus === 'NEEDS_PO');
                  if (!pendingItems.length) return null;
                  return (
                    <div className="rounded-[12px] border border-[#F5D798] bg-[#FDF3E3] p-3 space-y-1.5">
                      <p className="text-sm font-semibold text-[#8A4B06] font-jakarta">
                        Pending PO ({pendingItems.length} item{pendingItems.length !== 1 ? 's' : ''})
                      </p>
                      {pendingItems.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs font-jakarta text-[#8A4B06]">
                          <span>{item.materialName}</span>
                          <span className="font-jetbrains font-medium">{item.qtyKg} {item.uom || 'kg'}</span>
                        </div>
                      ))}
                      {canRaisePO && (
                        <Link href={`/fms/purchase/${req._id}/split-po`}
                          className="mt-2 flex items-center gap-1 text-xs text-[#8A4B06] font-medium font-jakarta hover:underline">
                          Raise PO for these items <ChevronRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  );
                })()}
                {/* Raised POs — purple block */}
                {req.children?.length > 0 && (
                  <div className="rounded-[12px] border p-3 space-y-2" style={{ borderColor: '#DDD9F0', background: '#F5F3FF' }}>
                    <p className="text-sm font-semibold font-jakarta" style={{ color: '#4B3FAC' }}>
                      Raised POs ({req.children.length})
                    </p>
                    {req.children.map((child: any) => (
                      <Link key={child._id} href={`/fms/purchase/${child._id}`}
                        className="flex items-center justify-between py-1.5 px-2 rounded-[10px] bg-white border hover:border-[#9B8FE0]" style={{ borderColor: '#DDD9F0' }}>
                        <div>
                          <span className="text-xs font-medium font-jetbrains" style={{ color: '#4B3FAC' }}>{child.reqNo}</span>
                          {child.po?.vendorName && <span className="text-xs ml-1.5 text-[#4B3FAC] opacity-60 font-jakarta">{child.po.vendorName}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <StageBadge req={child} />
                          {child.po?.totalAmount && <span className="text-xs font-bold font-jetbrains text-[#1E5E3F]">₹{child.po.totalAmount.toLocaleString('en-IN')}</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                {/* Per-child approval cards for approvers */}
                {canApprove && req.children?.some((c: any) => c.status === 'PO_CREATED') && (
                  <SplitApproverCards items={req.children} onSuccess={onActionSuccess} />
                )}
              </div>
            ) : (
              <>
                {showPOPanel  && <POCreatorPanel req={req} onSuccess={onActionSuccess} />}
                {showAppPanel && <ApproverPanel  req={req} onSuccess={onActionSuccess} />}
                {showRcvPanel && <ReceiverPanel  req={req} onSuccess={onActionSuccess} />}
                {(showPOPanel || showAppPanel || showRcvPanel) &&
                  <DeadlineSetter reqId={req._id} currentDeadline={req.deadline} onSuccess={onActionSuccess} />}
                {!showPOPanel && !showAppPanel && !showRcvPanel && !['COMPLETED','CANCELLED'].includes(req.status) && (
                  <div className="rounded-[12px] border border-[#F5D798] bg-[#FDF3E3] p-3">
                    <p className="text-sm font-semibold text-[#8A4B06] font-jakarta">Waiting for action</p>
                    {req.deadline?.dueAt && <p className="text-xs text-[#8A4B06] mt-1 font-jakarta">Due: {fmtIST(req.deadline.dueAt)}</p>}
                  </div>
                )}
                {req.status === 'COMPLETED' && (
                  <div className="rounded-[12px] border border-[#B8DFC8] bg-[#EAF3EE] p-3">
                    <p className="text-sm font-semibold text-[#1E5E3F] font-jakarta">Order closed</p>
                    {req.receipt?.at && <p className="text-xs text-[#3E6B50] mt-1 font-jakarta">{fmtIST(req.receipt.at)}</p>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Submit CTA for inline forms */}
          {(showPOPanel || showRcvPanel) && (
            <div className="border-t border-[#ECE9E1] p-3 flex gap-2 shrink-0">
              <Button type="submit" form={showPOPanel ? PO_FORM_ID : RECEIVE_FORM_ID}
                size="sm" className="flex-1 h-8 text-xs font-jakarta rounded-[10px] text-white" style={{ background: '#1E5E3F' }}>
                {showPOPanel ? 'Create PO' : 'Mark Received'}
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}

          {/* Cancel */}
          {canCancel && (
            <div className="border-t border-[#ECE9E1] p-3 shrink-0">
              <Button variant="outline" size="sm" className="w-full text-red-600 border-red-200 h-8 text-xs font-jakarta rounded-[10px]"
                onClick={() => {
                  const reason = prompt('Reason for cancellation:');
                  if (reason?.trim()) cancelMut.mutate(reason.trim());
                }} disabled={cancelMut.isPending}>
                Cancel Request
              </Button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
