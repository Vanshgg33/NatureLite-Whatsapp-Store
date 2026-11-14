'use client';
import { istDateKey } from '@/lib/time';

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
import type { Formulas } from '@/lib/billing/formula-engine';
import { channelForCustomer, CHANNEL_TIER, type PriceTier, type SalesChannel } from '@/lib/billing/channel';
import type { LineItem, BillCharge, PaidSplit, GodownDto } from './types';

const DELIVERY_TAGS = ['Home Delivery Order', 'Transport Order'];

const CHARGE_SAC = '996511';
const CHARGE_GST_RATE = 18;

/** mode 'order' = sale order: the same form, but no stock/balance/WhatsApp effect until the order is confirmed into a bill */
export function BillForm({ mode = 'bill' }: { mode?: 'bill' | 'order' }) {
  const isOrder = mode === 'order';
  const router = useRouter();
  const { toast } = useToast();

  // ─── All state first ──────────────────────────────────────────────────────
  const [customer, setCustomer] = useState<any | null>(null);
  const [deliveryUserId, setDeliveryUserId] = useState('');
  const [deliveryUserName, setDeliveryUserName] = useState('');
  const [settingPermanent, setSettingPermanent] = useState(false);

  const [paymentTerm, setPaymentTerm] = useState<'cash' | 'credit'>('credit');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => istDateKey());
  const [invoiceTime, setInvoiceTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [godownId, setGodownId] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('22');
  const [orderTag, setOrderTag] = useState<SalesChannel | ''>('');
  // which product price fills the bill lines: the normal price, or the B2B price set on the product
  const [priceMode, setPriceMode] = useState<PriceTier>('Store/Retail');

  const [billingAddress, setBillingAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [sameAsBilling, setSameAsBilling] = useState(true);

  const [rawItems, setRawItems] = useState<LineItem[]>([]);
  const [globalPriceInclTax, setGlobalPriceInclTax] = useState(true);

  const [billDiscountPct, setBillDiscountPct] = useState(0); // typed value: % or ₹ per discountMode
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [charges, setCharges] = useState<BillCharge[]>([]);
  const [roundOffEnabled, setRoundOffEnabled] = useState(true);
  const [paid, setPaid] = useState<PaidSplit>({ cash: 0, upi: 0 });
  const amountPaidRupees = paid.cash + paid.upi;
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [storeId, setStoreId] = useState(''); // IMS store the stock is checked and deducted from

  // ─── Derived ──────────────────────────────────────────────────────────────
  const isInterState = placeOfSupply !== '22';
  const needsDelivery = DELIVERY_TAGS.includes(orderTag);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: godowns = [] } = useQuery<GodownDto[]>({
    queryKey: ['billing-godowns'],
    queryFn: () => api.getBillingGodowns(),
    staleTime: 60_000,
  });

  const { data: stores = [] } = useQuery({
    queryKey: ['billing-stores'],
    queryFn: () => api.getBillingStores(),
    staleTime: 60_000,
  });

  const { data: deliveryStaff = [] } = useQuery({
    queryKey: ['delivery-staff'],
    queryFn: () => api.getDeliveryStaff(),
    enabled: needsDelivery,
    staleTime: 60_000,
  });

  // ─── Edit mode: /billing/new?edit=<billId> loads that bill; saving cancels it and issues a corrected one ──
  const [editId, setEditId] = useState('');
  const [editInvoiceNo, setEditInvoiceNo] = useState('');
  const [convertId, setConvertId] = useState(''); // /billing/new?convert=<orderId>: confirming a sale order into a real bill
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const convert = qs.get('convert');
    const id = convert || qs.get('edit');
    if (!id) return;
    (async () => {
      try {
        const b = await api.getBillingBill(id);
        const want = convert || isOrder ? 'SALE_ORDER' : 'SALE';
        if (b.status !== 'active' || (b.docType ?? 'SALE') !== want) { toast({ title: 'This document cannot be edited or confirmed', variant: 'destructive' }); return; }
        setCustomer(await api.getBillingCustomer(String(b.customerId)));
        if (convert) setConvertId(id); else setEditId(id);
        setEditInvoiceNo(b.invoiceNo);
        setOrderTag(b.orderTag); setPriceMode(CHANNEL_TIER[b.orderTag as SalesChannel] ?? 'Store/Retail');
        setPlaceOfSupply(b.placeOfSupply ?? '22');
        setInvoiceDate(new Date(b.invoiceDate ?? b.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
        if (b.godownId) setGodownId(b.godownId);
        if (b.storeId) setStoreId(String(b.storeId));
        setBillingAddress(b.billingAddress ?? ''); setShippingAddress(b.shippingAddress ?? ''); setSameAsBilling(b.sameAsBilling !== false);
        setNotes(b.notes ?? ''); setTerms(b.terms ?? '');
        setDeliveryUserId(b.deliveryUserId ?? ''); setDeliveryUserName(b.deliveryUserName ?? '');
        setRawItems((b.items ?? []).map((i: any) => ({
          _key: crypto.randomUUID(), productId: String(i.productId), variantSku: i.variantSku || undefined,
          name: i.name, sku: i.sku, hsnCode: i.hsnCode ?? '', mrp: i.mrp ?? 0, qty: i.qty, unit: i.unit ?? 'NOS',
          rate: i.rate ?? 0, priceInclTax: i.priceInclTax !== false, discountPct: i.discountPct ?? 0, gstRate: i.gstRate ?? 0,
          manualRate: true, // keep the rates the bill was issued at
          discountAmt: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0,
        })));
        if (b.billDiscountAmtPaise > 0) { setDiscountMode('amount'); setBillDiscountPct(b.billDiscountAmtPaise / 100); }
        setCharges((b.charges ?? []).map((c: any) => ({ label: c.label, amtRupees: c.amtPaise / 100 })));
        const sum = (m: string) => (b.payments ?? []).filter((p: any) => p.mode === m).reduce((s: number, p: any) => s + p.amountPaise, 0) / 100;
        setPaid({ cash: sum('cash'), upi: sum('upi') });
        if (!convert) setSendWhatsApp(false); // the customer already got the original (a confirmed order sends its first invoice)
      } catch {
        toast({ title: 'Could not load the bill to edit', variant: 'destructive' });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Effects ──────────────────────────────────────────────────────────────
  // start on the main IMS store; the cashier can switch
  useEffect(() => {
    if (!storeId && stores.length) setStoreId((stores.find(s => s.isMainStore) ?? stores[0])._id);
  }, [stores]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const { data: activeFormulas } = useQuery({ queryKey: ['billing-formulas', invoiceDate], queryFn: () => api.getActiveFormulas(invoiceDate), staleTime: 60_000 });
  const { lines, totals } = useBillCalc(rawItems, billDiscountPct, charges, roundOffEnabled, isInterState, amountPaidRupees, discountMode, activeFormulas?.formulas as Formulas | undefined);

  // flipping ₹ <-> % keeps the discount the same: re-express the typed value in the new mode
  const changeDiscountMode = (m: 'percent' | 'amount') => {
    if (m === discountMode) return;
    const amt = totals.billDiscAmtPaise;
    setDiscountMode(m);
    if (m === 'amount') setBillDiscountPct(amt / 100);
    else {
      const pre = lines.reduce((s, l) => s + l.taxable, 0) + amt; // subtotal before bill discount
      setBillDiscountPct(pre > 0 ? Math.min(100, +(amt * 100 / pre).toFixed(2)) : 0);
    }
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const toggleGlobalInclTax = () => {
    const next = !globalPriceInclTax;
    setGlobalPriceInclTax(next);
    setRawItems(prev => prev.map(i => ({ ...i, priceInclTax: next })));
  };

  const changeChannel = (ch: SalesChannel | '') => setOrderTag(ch);

  // switching Retail / B2B pricing re-prices every line the cashier did not price by hand
  const changePriceMode = (tier: PriceTier) => {
    setPriceMode(tier);
    setRawItems(prev => prev.map(i => {
      if (i.manualRate) return i;
      const price = i.tierPrices?.[tier];
      return price === undefined ? { ...i, missingTier: tier } : { ...i, rate: price, missingTier: undefined };
    }));
  };

  const handleCustomerSelect = (c: any) => {
    setCustomer(c);
    changeChannel(channelForCustomer(c.tags));
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
      const ex = prev.findIndex(i => i.productId === item.productId && i.variantSku === item.variantSku);
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
    setDiscountMode('percent');
    setCharges([]);
    setPaid({ cash: 0, upi: 0 });
    setNotes('');
    setTerms('');
    setInvoiceDate(istDateKey());
    setBillingAddress('');
    setDeliveryUserId('');
    setDeliveryUserName('');
  };

  // ─── Save mutation ────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (opts: { print: boolean; saveNew: boolean }) => {
      if (!customer) throw new Error('Select a customer first');
      if (!rawItems.length) throw new Error('Add at least one item');
      if (!orderTag) throw new Error('Select a sales channel');
      if (!isOrder && !storeId) throw new Error('Select the store the stock comes from');
      const noRate = rawItems.find(i => i.missingTier);
      if (noRate) throw new Error(`No ${noRate.missingTier} rate set for ${noRate.name}`);

      // save a newly typed address on the customer so it autofills next time (never blocks the bill)
      const typed = billingAddress.trim();
      const saved: any[] = customer.addresses ?? [];
      if (typed && !saved.some(a => a.line === typed)) {
        api.updateBillingCustomer(customer._id, {
          addresses: [...saved.map(a => ({ ...a, isDefault: false })), { label: 'Billing', line: typed, isDefault: true }],
        }).then(setCustomer).catch(() => {});
      }

      const payload = {
        docType: isOrder ? ('SALE_ORDER' as const) : undefined,
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
        payments: [{ mode: 'cash' as const, amountRupees: paid.cash }, { mode: 'upi' as const, amountRupees: paid.upi }],
        items: rawItems.map(i => ({
          productId: i.productId,
          variantSku: i.variantSku,
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
        billDiscountMode: discountMode,
        storeId,
        sendWhatsApp,
        // additional charges are a taxable service line (SAC 996511) so they flow into the GST reports
        charges: charges.map(c => ({ ...c, hsn: CHARGE_SAC, gstRate: CHARGE_GST_RATE })),
        roundOffEnabled,
        terms,
        notes,
        deliveryUserId: deliveryUserId || undefined,
        deliveryUserName: deliveryUserName || undefined,
      };
      const bill = convertId ? await api.convertBillingOrder(convertId, payload)
        : editId ? await api.reissueBillingBill(editId, payload)
        : await api.createBillingBillV1(payload);
      return { bill, ...opts };
    },
    onSuccess: ({ bill, print, saveNew }) => {
      toast(isOrder
        ? { title: `Sale order ${bill.invoiceNo} saved`, description: 'No stock or balance changes until you confirm it' }
        : { title: `Invoice ${bill.invoiceNo} saved`, description: bill.whatsapp?.status === 'skipped_no_phone' ? 'No WhatsApp number' : sendWhatsApp ? 'WhatsApp queued' : undefined });
      if (saveNew) {
        setEditId(''); setConvertId('');
        resetForm();
      } else if (print) {
        router.push(`/billing/invoice/${bill._id}?print=1`);
      } else if (isOrder) {
        router.push('/billing/orders');
      } else {
        router.push(`/billing/invoice/${bill._id}`);
      }
    },
    onError: (e: any) => {
      // the server's message first (axios' own message is only "Request failed with status code 400"); validation errors come as an array
      const raw = e?.response?.data?.message ?? e?.message ?? 'Failed to save bill';
      const msg = Array.isArray(raw) ? raw.join(', ') : String(raw);
      // "Not enough stock in Store: A2 GHEE: need 1, Store has 0" -> title + the shortfall lines
      const stock = msg.match(/^(Not enough stock in [^:]+): (.+)$/);
      if (stock) {
        toast({ title: stock[1], description: stock[2].split('; ').join('\n') + '\nPick another store or add stock to this store first.', variant: 'destructive' });
      } else {
        toast({ title: msg, variant: 'destructive' });
      }
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
        <span className="font-semibold text-gray-800 text-sm">
          {convertId ? `Confirm ${editInvoiceNo}` : editId ? `Edit ${editInvoiceNo}` : isOrder ? 'New Sale Order' : 'New Bill'}
        </span>
        {editId && <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded">Saving cancels {editInvoiceNo}{isOrder ? '' : ' (stock returned)'} and issues a new {isOrder ? 'sale order' : 'invoice'}</span>}
        {convertId && <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded">Saving issues the invoice, deducts stock and closes {editInvoiceNo}</span>}
        {isOrder && !editId && <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded">Sale order: no stock or balance effect until confirmed</span>}
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
              priceMode={priceMode} onPriceModeChange={changePriceMode}
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
              orderTag={orderTag} onOrderTagChange={(v: string) => changeChannel(v as SalesChannel)}
              storeId={storeId} onStoreChange={setStoreId} stores={stores}
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
              channel={orderTag}
              tier={priceMode}
              storeId={storeId}
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
              discountMode={discountMode} onDiscountModeChange={changeDiscountMode}
              billDiscAmtPaise={totals.billDiscAmtPaise}
              charges={charges} onChargesChange={setCharges}
              roundOffEnabled={roundOffEnabled} onRoundOffEnabledChange={setRoundOffEnabled}
              paid={paid} onPaidChange={setPaid}
              sendWhatsApp={sendWhatsApp} onSendWhatsAppChange={setSendWhatsApp}
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
