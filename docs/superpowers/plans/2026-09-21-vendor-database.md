# Vendor Database (Purchase FMS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vendor database to the Purchase FMS so PO creators can select a saved vendor and auto-fill all fields in one click.

**Architecture:** New `PurchaseVendor` Mongoose schema (mirrors `PurchaseMaterial`), four CRUD methods added to the existing `PurchaseService`/`PurchaseController`, four matching API methods in `api.ts`, a vendor management page at `/fms/purchase/vendors`, and a vendor `<select>` combobox at the top of `POCreatorPanel` that fills name/phone/address/terms on change.

**Tech Stack:** NestJS/Mongoose (backend), Next.js 14 App Router + TanStack Query + Tailwind (frontend), existing `api.ts` client pattern.

**Spec:** Chat design approved 2026-09-21 (no separate spec file).

## Global Constraints

- All backend routes stay under `@Controller('purchase')` with existing `@UseGuards(RolesGuard) @Roles('admin', 'superadmin')` — no new guards.
- Follow the `PurchaseMaterial` pattern exactly: schema → service → controller → module registration.
- Frontend pages live under `frontend/src/app/fms/purchase/` and use `useAdminAuthStore`, `useToast`, `getApiError`, and TanStack Query exactly as the materials page does.
- `isSuperadmin` is always `user?.role === 'superadmin'` (not the storeId check — that bug was fixed).
- No new npm packages.

## Review Focus

- Duplicate vendor name: `POST /purchase/vendors` with an already-existing name should return 409 — the `unique: true` index on `name` will throw a Mongo 11000 error; the controller must not swallow it.
- Empty vendor list in POCreatorPanel: if no vendors exist yet, the combobox should show a placeholder and not crash — the `useQuery` returning `[]` must be handled.
- Auto-fill on vendor select: changing the select must overwrite all four fields even if the user already typed something — `useState` setters must all fire in the `onChange` handler.
- `isActive: false` vendors: the `GET /purchase/vendors` list endpoint must filter to `isActive: true` by default so deactivated vendors don't appear in the PO form; the management page uses `?all=true`.
- GSTIN field: optional, no server-side format validation required (out of scope), but the frontend input must accept up to 15 characters.

---

## Task 1: Backend — PurchaseVendor Schema + Module Registration

**Files:**
- Create: `backend/src/modules/purchase/schemas/purchase-vendor.schema.ts`
- Modify: `backend/src/modules/purchase/purchase.module.ts`

**Interfaces:**
- Produces: `PurchaseVendor` class, `PurchaseVendorDocument` type, `PurchaseVendorSchema` — consumed by Task 2.

- [ ] **Step 1: Create the schema file**

```typescript
// backend/src/modules/purchase/schemas/purchase-vendor.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PurchaseVendorDocument = PurchaseVendor & Document;

@Schema({ timestamps: true })
export class PurchaseVendor {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: '' })
  email: string;

  @Prop({ default: '' })
  address: string;

  @Prop({ default: '' })
  gstin: string;

  @Prop({ default: '' })
  paymentTerms: string;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const PurchaseVendorSchema = SchemaFactory.createForClass(PurchaseVendor);
```

- [ ] **Step 2: Register schema in PurchaseModule**

Open `backend/src/modules/purchase/purchase.module.ts`. Add the import and register in `MongooseModule.forFeature`:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PurchaseMaterial, PurchaseMaterialSchema } from './schemas/purchase-material.schema';
import { PurchaseRequest, PurchaseRequestSchema } from './schemas/purchase-request.schema';
import { PurchaseVendor, PurchaseVendorSchema } from './schemas/purchase-vendor.schema';
import { AdminUser, AdminUserSchema } from '../admin/schemas/admin-user.schema';
import { PurchaseService } from './purchase.service';
import { PurchaseController } from './purchase.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: PurchaseMaterial.name, schema: PurchaseMaterialSchema },
      { name: PurchaseRequest.name, schema: PurchaseRequestSchema },
      { name: PurchaseVendor.name, schema: PurchaseVendorSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
    ]),
  ],
  controllers: [PurchaseController],
  providers: [PurchaseService],
})
export class PurchaseModule {}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/purchase/schemas/purchase-vendor.schema.ts backend/src/modules/purchase/purchase.module.ts
git commit -m "feat(fms): add PurchaseVendor schema and register in PurchaseModule"
```

---

## Task 2: Backend — Service Methods + Controller Routes

**Files:**
- Modify: `backend/src/modules/purchase/purchase.service.ts`
- Modify: `backend/src/modules/purchase/purchase.controller.ts`

**Interfaces:**
- Consumes: `PurchaseVendor`, `PurchaseVendorDocument`, `PurchaseVendorSchema` from Task 1.
- Produces: REST endpoints `GET /purchase/vendors`, `POST /purchase/vendors`, `PATCH /purchase/vendors/:id`, `DELETE /purchase/vendors/:id` — consumed by Task 3.

- [ ] **Step 1: Inject the vendor model in PurchaseService**

At the top of `purchase.service.ts`, add the import:
```typescript
import { PurchaseVendor, PurchaseVendorDocument } from './schemas/purchase-vendor.schema';
```

In the constructor, add after the `materialModel` injection:
```typescript
@InjectModel(PurchaseVendor.name) private vendorModel: Model<PurchaseVendorDocument>,
```

- [ ] **Step 2: Add the four vendor service methods**

Add this block immediately after the `updateMaterial` method (around line 88), before the `// ─── Requests` section:

```typescript
// ─── Vendors ──────────────────────────────────────────────────────────────

async getVendors(activeOnly = true) {
  const filter = activeOnly ? { isActive: true } : {};
  return this.vendorModel.find(filter).sort({ name: 1 }).lean();
}

async createVendor(data: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  paymentTerms?: string;
}) {
  return this.vendorModel.create({
    name: data.name.trim(),
    phone: data.phone || '',
    email: data.email || '',
    address: data.address || '',
    gstin: data.gstin || '',
    paymentTerms: data.paymentTerms || '',
  });
}

async updateVendor(id: string, data: {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  paymentTerms?: string;
  isActive?: boolean;
}) {
  const vendor = await this.vendorModel.findByIdAndUpdate(id, { $set: data }, { new: true });
  if (!vendor) throw new NotFoundException('Vendor not found');
  return vendor;
}

async deleteVendor(id: string) {
  const vendor = await this.vendorModel.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
  if (!vendor) throw new NotFoundException('Vendor not found');
  return vendor;
}
```

- [ ] **Step 3: Add vendor routes to PurchaseController**

Add this block immediately after the `updateMaterial` route (after the `@Patch('materials/:id')` handler), before the `// ─── Stats` section:

```typescript
// ─── Vendors ─────────────────────────────────────────────────────────────

@Get('vendors')
getVendors(@Query('all') all?: string) {
  return this.purchaseService.getVendors(all !== 'true');
}

@Post('vendors')
createVendor(@Body() body: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  paymentTerms?: string;
}) {
  return this.purchaseService.createVendor(body);
}

@Patch('vendors/:id')
updateVendor(
  @Param('id') id: string,
  @Body() body: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    gstin?: string;
    paymentTerms?: string;
    isActive?: boolean;
  },
) {
  return this.purchaseService.updateVendor(id, body);
}

@Delete('vendors/:id')
deleteVendor(@Param('id') id: string) {
  return this.purchaseService.deleteVendor(id);
}
```

Also add `Delete` to the controller's NestJS imports at the top:
```typescript
import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
```

- [ ] **Step 4: Verify it compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Smoke-test the endpoints (optional but fast)**

Start the backend (`npm run start:dev`) and run:
```bash
curl -s -X POST http://localhost:3001/purchase/vendors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"Test Vendor","phone":"9999999999"}' | jq .
```
Expected: `{ success: true, data: { _id: "...", name: "Test Vendor", ... } }`

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/purchase/purchase.service.ts backend/src/modules/purchase/purchase.controller.ts
git commit -m "feat(fms): add vendor CRUD service methods and controller routes"
```

---

## Task 3: Frontend — API Client Methods

**Files:**
- Modify: `frontend/src/lib/api.ts` (add 4 methods after `updatePurchaseMaterial`, around line 1776)

**Interfaces:**
- Consumes: `GET /purchase/vendors`, `POST /purchase/vendors`, `PATCH /purchase/vendors/:id`, `DELETE /purchase/vendors/:id` from Task 2.
- Produces: `api.getPurchaseVendors(all?)`, `api.createPurchaseVendor(data)`, `api.updatePurchaseVendor(id, data)`, `api.deletePurchaseVendor(id)` — consumed by Tasks 4 and 5.

- [ ] **Step 1: Add the four vendor API methods**

In `frontend/src/lib/api.ts`, after the `updatePurchaseMaterial` method (around line 1776), add:

```typescript
async getPurchaseVendors(all = false): Promise<any[]> {
  const res = await this.client.get<ApiResponse<any[]>>(`/purchase/vendors${all ? '?all=true' : ''}`);
  return res.data.data;
}

async createPurchaseVendor(data: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  paymentTerms?: string;
}): Promise<any> {
  const res = await this.client.post<ApiResponse<any>>('/purchase/vendors', data);
  return res.data.data;
}

async updatePurchaseVendor(id: string, data: {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  paymentTerms?: string;
  isActive?: boolean;
}): Promise<any> {
  const res = await this.client.patch<ApiResponse<any>>(`/purchase/vendors/${id}`, data);
  return res.data.data;
}

async deletePurchaseVendor(id: string): Promise<any> {
  const res = await this.client.delete<ApiResponse<any>>(`/purchase/vendors/${id}`);
  return res.data.data;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(fms): add vendor API client methods"
```

---

## Task 4: Frontend — Vendor Management Page + Nav Link

**Files:**
- Create: `frontend/src/app/fms/purchase/vendors/page.tsx`
- Modify: `frontend/src/app/fms/layout.tsx` (add nav link)

**Interfaces:**
- Consumes: `api.getPurchaseVendors(all)`, `api.createPurchaseVendor`, `api.updatePurchaseVendor`, `api.deletePurchaseVendor` from Task 3.

- [ ] **Step 1: Create the vendors management page**

```tsx
// frontend/src/app/fms/purchase/vendors/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';

type VendorForm = { name: string; phone: string; email: string; address: string; gstin: string; paymentTerms: string };
const EMPTY_FORM: VendorForm = { name: '', phone: '', email: '', address: '', gstin: '', paymentTerms: '' };

export default function FmsPurchaseVendorsPage() {
  const { user } = useAdminAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperadmin = user?.role === 'superadmin';

  const [form, setForm] = useState<VendorForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<Record<string, VendorForm>>({});

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['purchase-vendors-all'],
    queryFn: () => api.getPurchaseVendors(true),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createPurchaseVendor(form),
    onSuccess: () => {
      toast({ title: 'Vendor added' });
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ['purchase-vendors-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-vendors'] });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: any }) => api.updatePurchaseVendor(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-vendors-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-vendors'] });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const startEdit = (v: any) =>
    setEditing((prev) => ({
      ...prev,
      [v._id]: { name: v.name, phone: v.phone, email: v.email, address: v.address, gstin: v.gstin, paymentTerms: v.paymentTerms },
    }));

  const cancelEdit = (id: string) =>
    setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const saveEdit = (id: string) => {
    const data = editing[id];
    if (!data?.name?.trim()) return;
    updateMutation.mutate({ id, data });
    cancelEdit(id);
  };

  if (!isSuperadmin) {
    return (
      <div className="flex flex-col h-screen">
        <Header title="Vendors" icon={<Building2 className="h-6 w-6 text-amber-600" />} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Superadmin only.</p>
        </div>
      </div>
    );
  }

  const setField = (k: keyof VendorForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Vendors"
        description="Saved vendor profiles for Purchase Orders"
        icon={<Building2 className="h-6 w-6 text-amber-600" />}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Add form */}
        <form
          onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) createMutation.mutate(); }}
          className="bg-white rounded-xl border border-gray-100 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-gray-800">Add New Vendor</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Name *</label>
              <Input className="mt-1 h-9 text-sm" value={form.name} onChange={setField('name')} placeholder="e.g. Sunrise Traders" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Phone</label>
              <Input className="mt-1 h-9 text-sm" value={form.phone} onChange={setField('phone')} placeholder="9XXXXXXXXX" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Email</label>
              <Input className="mt-1 h-9 text-sm" value={form.email} onChange={setField('email')} placeholder="vendor@email.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">GSTIN</label>
              <Input className="mt-1 h-9 text-sm" value={form.gstin} onChange={setField('gstin')} placeholder="22AAAAA0000A1Z5" maxLength={15} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Payment Terms</label>
              <Input className="mt-1 h-9 text-sm" value={form.paymentTerms} onChange={setField('paymentTerms')} placeholder="e.g. 30 days credit" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Address</label>
              <Input className="mt-1 h-9 text-sm" value={form.address} onChange={setField('address')} placeholder="Full address" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!form.name.trim() || createMutation.isPending} className="bg-[#2F6B47] hover:bg-[#2F6B47]/90">
              <Plus className="h-4 w-4 mr-1" /> Add Vendor
            </Button>
          </div>
        </form>

        {/* Vendor table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="border-b px-4 py-2">
            <p className="text-sm font-medium text-gray-800">Vendors ({vendors.length})</p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 border-2 border-[#2F6B47] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : vendors.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">No vendors yet. Add one above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Name</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Phone</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">GSTIN</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Terms</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Active</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((v: any) => {
                    const isEditing = v._id in editing;
                    const ef = editing[v._id] ?? {};
                    return (
                      <tr key={v._id} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Input
                                className="h-7 text-xs w-40"
                                value={ef.name}
                                onChange={(e) => setEditing((p) => ({ ...p, [v._id]: { ...p[v._id], name: e.target.value } }))}
                                autoFocus
                              />
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => saveEdit(v._id)}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500" onClick={() => cancelEdit(v._id)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <span
                                className="cursor-pointer font-medium hover:text-[#2F6B47] hover:underline"
                                onClick={() => startEdit(v)}
                              >
                                {v.name}
                              </span>
                              {v.address && <p className="text-xs text-gray-400 truncate max-w-[200px]">{v.address}</p>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                          {isEditing ? (
                            <Input
                              className="h-7 text-xs w-28"
                              value={ef.phone}
                              onChange={(e) => setEditing((p) => ({ ...p, [v._id]: { ...p[v._id], phone: e.target.value } }))}
                            />
                          ) : (v.phone || '—')}
                        </td>
                        <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                          {isEditing ? (
                            <Input
                              className="h-7 text-xs w-36"
                              value={ef.gstin}
                              maxLength={15}
                              onChange={(e) => setEditing((p) => ({ ...p, [v._id]: { ...p[v._id], gstin: e.target.value } }))}
                            />
                          ) : (v.gstin || '—')}
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">
                          {isEditing ? (
                            <Input
                              className="h-7 text-xs w-28"
                              value={ef.paymentTerms}
                              onChange={(e) => setEditing((p) => ({ ...p, [v._id]: { ...p[v._id], paymentTerms: e.target.value } }))}
                            />
                          ) : (v.paymentTerms || '—')}
                        </td>
                        <td className="px-4 py-2">
                          <Switch
                            checked={v.isActive}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({ id: v._id, data: { isActive: checked } })
                            }
                          />
                        </td>
                        <td className="px-4 py-2" />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400">
          Deactivated vendors won&apos;t appear in the PO vendor selector but remain in existing records.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Vendors nav link to FMS sidebar**

In `frontend/src/app/fms/layout.tsx`, update the imports to add `Building2`:
```typescript
import { ShoppingBag, Building2, LogOut, Menu, X } from 'lucide-react';
```

In `FmsSidebar`, the `isActive` check currently covers all `/fms/purchase/` paths. We need per-link active states. Replace the single `isActive` variable and the single `<Link>` with two separate links:

Replace this block (around line 29–69):
```typescript
  const isActive = pathname === '/fms/purchase' || pathname.startsWith('/fms/purchase/');
```
…and the nav section:
```typescript
        <div className="mt-1">
          <p className="px-4 pt-2.5 pb-1 text-[9px] font-mono text-white/30 uppercase tracking-[0.14em] select-none">
            Purchase
          </p>
          <Link
            href="/fms/purchase"
            onClick={onMobileClose}
            className={cn(
              'flex items-center gap-2.5 text-[13px] py-[7px]',
              isActive
                ? 'ml-0 mr-2 pl-5 rounded-r-lg border-l-2 border-[#4ade80] bg-[rgba(74,222,128,0.1)] text-[#4ade80] font-medium'
                : 'mx-2 px-3 rounded-lg text-white/60 hover:text-white/90 hover:bg-white/[0.06]',
            )}
            style={{ transition: 'background-color 0.1s, color 0.1s' }}
          >
            <ShoppingBag className={cn('h-[15px] w-[15px] flex-shrink-0', isActive ? 'opacity-100' : 'opacity-65')} />
            Purchase FMS
          </Link>
        </div>
```

With this:
```typescript
        <div className="mt-1">
          <p className="px-4 pt-2.5 pb-1 text-[9px] font-mono text-white/30 uppercase tracking-[0.14em] select-none">
            Purchase
          </p>
          {[
            { href: '/fms/purchase', label: 'Purchase FMS', Icon: ShoppingBag,
              active: pathname === '/fms/purchase' || (pathname.startsWith('/fms/purchase/') && !pathname.startsWith('/fms/purchase/vendors')) },
            { href: '/fms/purchase/vendors', label: 'Vendors', Icon: Building2,
              active: pathname.startsWith('/fms/purchase/vendors') },
          ].map(({ href, label, Icon, active }) => (
            <Link
              key={href}
              href={href}
              onClick={onMobileClose}
              className={cn(
                'flex items-center gap-2.5 text-[13px] py-[7px]',
                active
                  ? 'ml-0 mr-2 pl-5 rounded-r-lg border-l-2 border-[#4ade80] bg-[rgba(74,222,128,0.1)] text-[#4ade80] font-medium'
                  : 'mx-2 px-3 rounded-lg text-white/60 hover:text-white/90 hover:bg-white/[0.06]',
              )}
              style={{ transition: 'background-color 0.1s, color 0.1s' }}
            >
              <Icon className={cn('h-[15px] w-[15px] flex-shrink-0', active ? 'opacity-100' : 'opacity-65')} />
              {label}
            </Link>
          ))}
        </div>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/fms/purchase/vendors/page.tsx frontend/src/app/fms/layout.tsx
git commit -m "feat(fms): add vendor management page and sidebar nav link"
```

---

## Task 5: Frontend — Vendor Combobox in POCreatorPanel

**Files:**
- Modify: `frontend/src/app/fms/purchase/[id]/page.tsx` — `POCreatorPanel` component (lines 191–299)

**Interfaces:**
- Consumes: `api.getPurchaseVendors()` from Task 3.

- [ ] **Step 1: Add vendor query and auto-fill logic to POCreatorPanel**

In `POCreatorPanel` (starts at line 191), add a `useQuery` for vendors and an `applyVendor` handler. The component signature is `({ req, onSuccess }: { req: any; onSuccess: () => void })` — no changes needed there.

At the top of the `POCreatorPanel` function body, after the existing `useState` declarations, add:

```typescript
const { data: vendors = [] } = useQuery({
  queryKey: ['purchase-vendors'],
  queryFn: () => api.getPurchaseVendors(),
});

const applyVendor = (e: React.ChangeEvent<HTMLSelectElement>) => {
  const v = vendors.find((x: any) => x._id === e.target.value);
  if (!v) return;
  setVendorName(v.name);
  setVendorPhone(v.phone || '');
  setVendorAddress(v.address || '');
  setTerms(v.paymentTerms || '');
};
```

- [ ] **Step 2: Add the vendor selector at the top of the form JSX**

In the `<form>` returned by `POCreatorPanel`, add this block as the very first child inside `<form ... className="space-y-5">`, before the `{/* Vendor Details */}` div:

```tsx
{vendors.length > 0 && (
  <div>
    <label className="text-xs font-medium text-gray-600 mb-1 block">Select Saved Vendor</label>
    <select
      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
      defaultValue=""
      onChange={applyVendor}
    >
      <option value="" disabled>— pick a vendor to auto-fill —</option>
      {vendors.map((v: any) => (
        <option key={v._id} value={v._id}>{v.name}{v.phone ? ` · ${v.phone}` : ''}</option>
      ))}
    </select>
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual test**

1. Add at least one vendor via `/fms/purchase/vendors`.
2. Open any `REQUESTED` purchase request as a `po_creator` or superadmin.
3. In the right sidebar PO panel, verify the "Select Saved Vendor" dropdown appears.
4. Pick the vendor — verify name, phone, address, and payment terms fields populate instantly.
5. Change the vendor — verify fields update.
6. Verify submitting the PO still works end-to-end.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/fms/purchase/[id]/page.tsx
git commit -m "feat(fms): add vendor selector with auto-fill to POCreatorPanel"
```
