'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, X, Pin } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { BillHeader } from './components/BillHeader';
import { ItemGrid } from './components/ItemGrid';
import { BillFooter } from './components/BillFooter';
import { SummaryPanel } from './components/SummaryPanel';
import { useBillCalc } from './useBillCalc';
import type { LineItem, BillCharge, PaymentMode, GodownDto } from './types';

const DELIVERY_TAGS = ['Home Delivery', 'Transport'];
const TAG_PRIORITY = ['Wholesale', 'B2B', 'Transport', 'Home Delivery', 'Store/Retail', 'Retail'];

const CHARGE_SAC = '996511';
const CHARGE_GST_RATE = 18;

export default function NewBillPage() {
  const router = useRouter();
  const { toast } = useToast();

  // ─── All state first ──────────────────────────────────────────────────────
  const [customer, setCustomer] = useState<any | null>(null);
  const [deliveryUserId, setDeliveryUserId] = useState('');
  const [deliveryUserName, setDeliveryUserName] = useState('');
  const [settingPermanent, setSettingPermanent] = useState(false);

  const [paymentTerm, setPaymentTerm] = useState<'cash' | 'credit'>('credit');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoiceTime, setInvoiceTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [godownId, setGodownId] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('22');
  const [orderTag, setOrderTag] = useState('');

  const [billingAddress, setBillingAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [sameAsBilling, setSameAsBilling] = useState(true);

  const [rawItems, setRawItems] = useState<LineItem[]>([]);
  const [globalPriceInclTax, setGlobalPriceInclTax] = useState(true);

  const [billDiscountPct, setBillDiscountPct] = useState(0);
  const [charges, setCharges] = useState<BillCharge[]>([]);
  const [roundOffEnabled, setRoundOffEnabled] = useState(true);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('credit');
  const [amountPaidRupees, setAmountPaidRupees] = useState(0);
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');

  // ─── Derived ──────────────────────────────────────────────────────────────
  const isInterState = placeOfSupply !== '22';
  const needsDelivery = DELIVERY_TAGS.includes(orderTag);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: godowns = [] } = useQuery<GodownDto[]>({
    queryKey: ['billing-godowns'],
    queryFn: () => api.getBillingGodowns(),
    staleTime: 60_000,
  });

  const { data: deliveryStaff = [] } = useQuery({
    queryKey: ['delivery-staff'],
    queryFn: () => api.getDeliveryStaff(),
    enabled: needsDelivery,
    staleTime: 60_000,
  });

  // ─── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const def = godowns.find((g: GodownDto) => g.isDefault);
    if (def && !godownId) setGodownId(def._id);
  }, [godowns]);

  useEffect(() => {
    if (deliveryUserId && deliveryStaff.length) {
      const match = deliveryStaff.find((d: any) => d._id === deliveryUserId);
      if (match) setDeliveryUserName(match.name);
    }
  }, [deliveryUserId, deliveryStaff]);

  // ─── Calc ─────────────────────────────────────────────────────────────────
  const { lines, totals } = useBillCalc(rawItems, billDiscountPct, charges, roundOffEnabled, isInterState, amountPaidRupees);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const toggleGlobalInclTax = () => {
    const next = !globalPriceInclTax;
    setGlobalPriceInclTax(next);
    setRawItems(prev => prev.map(i => ({ ...i, priceInclTax: next })));
  };

  const handleCustomerSelect = (c: any) => {
    setCustomer(c);
    const primary = TAG_PRIORITY.find(t => c.tags?.includes(t)) ?? '';
    setOrderTag(primary);
    const defAddr = c.addresses?.find((a: any) => a.isDefault) ?? c.addresses?.[0];
    setBillingAddress(defAddr?.line ?? '');
    const gstin = c.gstNo ?? '';
    if (/^[0-9]{2}/.test(gstin)) setPlaceOfSupply(gstin.slice(0, 2));
    setDeliveryUserId(c.assignedDeliveryUserId ?? '');
    if (!c.assignedDeliveryUserId) setDeliveryUserName('');
  };

  const handleCustomerClear = () => {
    setCustomer(null);
    setOrderTag('');
    setDeliveryUserId('');
    setDeliveryUserName('');
    setBillingAddress('');
  };

  const makePermanent = async () => {
    if (!customer || !deliveryUserId) return;
    setSettingPermanent(true);
    try {
      const updated = await api.setDefaultDeliveryForBillingCustomer(customer._id, deliveryUserId);
      setCustomer(updated);
      toast({ title: `${deliveryUserName} set as permanent delivery for ${customer.name}` });
    } catch {
      toast({ title: 'Failed to set permanent delivery', variant: 'destructive' });
    } finally {
      setSettingPermanent(false);
    }
  };

  const handleAdd = (item: Omit<LineItem, 'discountAmt' | 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total'>) => {
    setRawItems(prev => {
      const ex = prev.findIndex(i => i.productId === item.productId);
      if (ex >= 0) {
        const u = [...prev];
        u[ex] = { ...u[ex], qty: u[ex].qty + item.qty };
        return u;
      }
      return [...prev, item as LineItem];
    });
  };

  const resetForm = () => {
    setRawItems([]);
    setCustomer(null);
    setOrderTag('');
    setInvoiceNo('');
    setBillDiscountPct(0);
    setCharges([]);
    setAmountPaidRupees(0);
    setNotes('');
    setTerms('');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setBillingAddress('');
    setDeliveryUserId('');
    setDeliveryUserName('');
  };

  // ─── Save mutation ────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (opts: { print: boolean; saveNew: boolean }) => {
      if (!customer) throw new Error('Select a customer first');
      if (!rawItems.length) throw new Error('Add at least one item');
      if (!orderTag) throw new Error('Select an order type');

      const bill = await api.createBillingBillV1({
        paymentTerm,
        invoiceDate,
        invoiceNo: invoiceNo || undefined,
        placeOfSupply,
        godownId: godownId || undefined,
        customerId: customer._id,
        billingAddress,
        shippingAddress: sameAsBilling ? billingAddress : shippingAddress,
        sameAsBilling,
        orderTag,
        paymentMode,
        items: rawItems.map(i => ({
          productId: i.productId,
          name: i.name,
          sku: i.sku,
          hsnCode: i.hsnCode,
          mrp: i.mrp,
          qty: i.qty,
          unit: i.unit,
          rate: i.rate,
          priceInclTax: i.priceInclTax,
          discountPct: i.discountPct,
          gstRate: i.gstRate,
        })),
        billDiscountPct,
        // additional charges are a taxable service line (SAC 996511) so they flow into the GST reports
        charges: charges.map(c => ({ ...c, hsn: CHARGE_SAC, gstRate: CHARGE_GST_RATE })),
        roundOffEnabled,
        amountPaidRupees,
        terms,
        notes,
        deliveryUserId: deliveryUserId || undefined,
        deliveryUserName: deliveryUserName || undefined,
      });
      return { bill, ...opts };
    },
    onSuccess: ({ bill, print, saveNew }) => {
      toast({ title: `Invoice ${bill.invoiceNo} saved` });
      if (saveNew) {
        resetForm();
      } else if (print) {
        router.push(`/billing/invoice/${bill._id}?print=1`);
      } else {
        router.push(`/billing/invoice/${bill._id}`);
      }
    },
    onError: (e: any) => {
      toast({ title: e?.message ?? e?.response?.data?.message ?? 'Failed to save bill', variant: 'destructive' });
    },
  });

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); resetForm(); }
      if (e.key === 'F3') { e.preventDefault(); document.getElementById('customer-search')?.focus(); }
      if (e.key === 'Escape') router.push('/billing/customers');
      if (e.key === 'F8') { e.preventDefault(); saveMutation.mutate({ print: false, saveNew: false }); }
      if (e.key === 'F9') { e.preventDefault(); saveMutation.mutate({ print: true, saveNew: false }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full">
      {/* Page header bar */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 h-12 bg-white border-b border-gray-200 shrink-0">
        <button
          onClick={() => router.push('/billing/customers')}
          className="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-sm transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Back</span>
        </button>
        <div className="w-px h-4 bg-gray-200" />
        <span className="font-semibold text-gray-800 text-sm">New Bill</span>
        <span className="hidden lg:flex items-center gap-1 text-[11px] text-gray-400 ml-1">
          <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">F3</kbd> Customer ·
          <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">F8</kbd> Save ·
          <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">F9</kbd> Print ·
          <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">Esc</kbd> Cancel
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/billing/customers')} className="text-xs h-8">
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Left: header + items + footer */}
        <div className="flex flex-col flex-1 min-w-0 border-b lg:border-b-0 lg:border-r border-gray-200">
          {/* Bill header */}
          <div className="p-4 bg-white border-b border-gray-200">
            <BillHeader
              paymentTerm={paymentTerm} onPaymentTermChange={setPaymentTerm}
              invoiceNo={invoiceNo} onInvoiceNoChange={setInvoiceNo}
              invoiceDate={invoiceDate} onInvoiceDateChange={setInvoiceDate}
              invoiceTime={invoiceTime} onInvoiceTimeChange={setInvoiceTime}
              godownId={godownId} onGodownChange={setGodownId} godowns={godowns}
              customer={customer} onCustomerSelect={handleCustomerSelect} onCustomerClear={handleCustomerClear}
              billingAddress={billingAddress} onBillingAddressChange={setBillingAddress}
              shippingAddress={shippingAddress} onShippingAddressChange={setShippingAddress}
              sameAsBilling={sameAsBilling} onSameAsBillingChange={setSameAsBilling}
              placeOfSupply={placeOfSupply} onPlaceOfSupplyChange={setPlaceOfSupply}
              isInterState={isInterState}
              orderTag={orderTag} onOrderTagChange={setOrderTag}
            />
          </div>

          {/* Delivery staff — only for Transport/Home Delivery */}
          {needsDelivery && (
            <div className="px-4 py-3 bg-white border-b border-gray-100">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Delivery Person
              </label>
              <select
                value={deliveryUserId}
                onChange={e => {
                  const id = e.target.value;
                  setDeliveryUserId(id);
                  const match = deliveryStaff.find((d: any) => d._id === id);
                  setDeliveryUserName(match?.name ?? '');
                }}
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30 bg-white"
              >
                <option value="">— Select —</option>
                {deliveryStaff.map((d: any) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
              {deliveryUserId && deliveryUserId !== customer?.assignedDeliveryUserId && (
                <div className="flex items-center justify-between mt-1.5">
                  <button type="button" onClick={makePermanent} disabled={settingPermanent}
                    className="flex items-center gap-1.5 text-[11px] text-[#2d7a4f] hover:underline disabled:opacity-50">
                    <Pin className="h-3 w-3" />
                    {settingPermanent ? 'Saving…' : `Make permanent for ${customer?.name?.split(' ')[0]}`}
                  </button>
                  <span className="text-[11px] text-gray-400">or just this bill ↑</span>
                </div>
              )}
            </div>
          )}

          {/* Item grid */}
          <div className="flex-1 bg-white">
            <ItemGrid
              lines={lines}
              rawItems={rawItems}
              isInterState={isInterState}
              customerTags={customer?.tags ?? []}
              globalPriceInclTax={globalPriceInclTax}
              onGlobalInclTaxToggle={toggleGlobalInclTax}
              onUpdate={(idx, patch) => setRawItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))}
              onRemove={(idx) => setRawItems(prev => prev.filter((_, i) => i !== idx))}
              onAdd={handleAdd}
            />
          </div>

          {/* Bill footer */}
          <div className="p-4 bg-white border-t border-gray-100">
            <BillFooter
              billDiscountPct={billDiscountPct} onBillDiscountPctChange={setBillDiscountPct}
              charges={charges} onChargesChange={setCharges}
              roundOffEnabled={roundOffEnabled} onRoundOffEnabledChange={setRoundOffEnabled}
              paymentMode={paymentMode} onPaymentModeChange={setPaymentMode}
              amountPaidRupees={amountPaidRupees} onAmountPaidChange={setAmountPaidRupees}
              terms={terms} onTermsChange={setTerms}
              notes={notes} onNotesChange={setNotes}
            />
          </div>
        </div>

        {/* Right: summary panel */}
        <div className="lg:sticky lg:top-12 lg:self-start lg:max-h-[calc(100vh-48px)] overflow-y-auto">
          <SummaryPanel
            totals={totals}
            isInterState={isInterState}
            lines={lines}
            onSave={() => saveMutation.mutate({ print: false, saveNew: false })}
            onSaveAndPrint={() => saveMutation.mutate({ print: true, saveNew: false })}
            onSaveAndNew={() => saveMutation.mutate({ print: false, saveNew: true })}
            isSaving={saveMutation.isPending}
          />
        </div>
      </div>
    </div>
  );
}
