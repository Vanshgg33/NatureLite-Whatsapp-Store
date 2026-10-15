# FMS Blueprint Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all remaining items from the NatureLite Purchase FMS blueprint: auth login enrichment, mustChangePassword gate, photo upload, RBAC UX guards, materials UOM/tag fields, inline quick-add, tags management page, partial-PO split view, multi-child PO workflow, mandatory form fields, and migration script.

**Architecture:** NestJS backend (MongoDB/Mongoose) + Next.js 14 App Router frontend (React Query + Zustand). All changes are additive: no schema migrations for required fields, no breaking API changes. Frontend permissions live in `useAdminAuthStore` fed from the login response.

**Tech Stack:** NestJS, MongoDB/Mongoose, Next.js 14 App Router, React Query (`@tanstack/react-query`), Zustand, Tailwind CSS, shadcn/ui, Lucide icons, `canvas` API for photo crop.

**Spec:** `C:\Users\jaisw\Downloads\Purchase_FMS_Upgrade_Blueprint.pdf`

## Global Constraints

- Brand colors: `#1E5E3F` green, `#17382A` dark sidebar, `#F7F6F2` cream bg, `#ECE9E1` border, `#18211C` ink, `#66706A` muted, `#8A9490` faint
- Fonts: `font-fraunces` headings, `font-jakarta` body, `font-jetbrains` mono/numbers
- All rounded corners: `rounded-[10px]` controls, `rounded-[18px]` cards
- No new npm dependencies — use `<canvas>` for image crop (already in browser)
- Do NOT commit — user commits manually
- Rate limiting (5 failures / 15 min) is already implemented in `auth.service.ts:134–148` — skip it

## Review Focus

- Permissions not populated: after login, `user.permissions` in Zustand store is `[]` for all FMS users; every `usePermission('x')` returns false. Fix is Task 1 (login response enrichment). If Task 1 is skipped, all RBAC UX tasks (Task 4, 5) produce no visible change.
- mustChangePassword loop: if `changePassword` doesn't clear `mustChangePassword` in DB, the user gets stuck in an infinite redirect. Task 2 must set `mustChangePassword: false` on success.
- Photo base64 size: a 256×256 JPEG at q=0.85 is ~15 KB which fits in a POST body. Larger originals need to be resized on the canvas before converting to base64, or the request will be very slow.
- Tag "remember" race: if the user selects a tag and immediately submits before the `PATCH /materials/:id` debounce fires, the tag won't be saved to the material. The checkbox must trigger an immediate PATCH on check, not on submit.
- Migration idempotency: the script must handle re-runs gracefully (already-migrated docs must not be double-patched). Use `$exists` / `$eq: null` guards in every update filter.

---

### Task 1: Enrich Login Response + Populate FMS User Store

**Files:**
- Modify: `backend/src/modules/auth/dto/auth.dto.ts:121–135`
- Modify: `backend/src/modules/auth/auth.service.ts:164–188` (adminLogin response)
- Modify: `frontend/src/app/admin-login/page.tsx:38–49` (setUser call)

**Interfaces:**
- Produces: `response.user.permissions: string[]`, `response.user.designation?: string`, `response.user.rolePreset?: string`, `response.user.photoUrl?: string` (mapped from `avatar`), `response.user.mustChangePassword?: boolean`, `response.user.loginId?: string`

- [ ] **Step 1: Extend AuthResponse DTO**

In `backend/src/modules/auth/dto/auth.dto.ts`, replace the `AuthResponse` interface (lines 121–135):

```typescript
export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email?: string;
    phone?: string;
    name?: string;
    role: string;
    departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior' | 'fms';
    purchaseRole?: 'requester' | 'po_creator' | 'approver' | 'receiver';
    storeId?: string;
    storeName?: string;
    permissions?: string[];
    designation?: string;
    rolePreset?: string;
    photoUrl?: string;
    mustChangePassword?: boolean;
    loginId?: string;
  };
}
```

- [ ] **Step 2: Include fields in adminLogin response**

In `backend/src/modules/auth/auth.service.ts`, the `adminLogin` method (around line 175) returns `{ ...tokens, user: {...} }`. Add the missing fields:

```typescript
return {
  ...tokens,
  user: {
    id: admin._id.toString(),
    email: admin.email,
    name: admin.name,
    role: admin.role,
    departmentType: admin.departmentType,
    purchaseRole: admin.purchaseRole,
    storeId,
    storeName,
    permissions: admin.permissions ?? [],
    designation: admin.designation,
    rolePreset: admin.rolePreset,
    photoUrl: admin.avatar,
    mustChangePassword: admin.mustChangePassword ?? false,
    loginId: admin.loginId,
  },
};
```

Note: `admin` is loaded via `findOneForAuthByLoginIdOrEmail` which uses `select: false` on `password` but returns all other fields. The `permissions`, `designation`, `rolePreset`, `avatar`, `mustChangePassword`, `loginId` fields are all present on `AdminUser` schema.

- [ ] **Step 3: Populate store on login**

In `frontend/src/app/admin-login/page.tsx`, replace the `setUser` call (lines 39–48):

```typescript
setUser({
  id: response.user.id,
  email: response.user.email,
  name: response.user.name,
  role: response.user.role,
  storeId: response.user.storeId,
  storeName: response.user.storeName,
  departmentType: response.user.departmentType,
  purchaseRole: response.user.purchaseRole,
  permissions: response.user.permissions,
  designation: response.user.designation,
  rolePreset: response.user.rolePreset,
  photoUrl: response.user.photoUrl,
  mustChangePassword: response.user.mustChangePassword,
});
```

- [ ] **Step 4: Verify**

Log in as an FMS user with `REQUESTER` role preset. Open browser DevTools → Application → Local Storage. Key `admin-auth-storage` should show `permissions: ["pr.create","request.close"]`. The sidebar Users link should NOT appear for a requester (because `hasPermission(user, 'users.manage')` returns false). Confirm it's hidden.

---

### Task 2: mustChangePassword Forced-Change Screen

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts:466–469` (changePassword clears flag)
- Modify: `backend/src/modules/purchase/purchase.service.ts` (createFmsUser + resetFmsUserPassword set flag)
- Create: `frontend/src/app/fms/change-password/page.tsx`
- Modify: `frontend/src/app/fms/layout.tsx:185–191` (add mustChangePassword redirect)

**Interfaces:**
- Consumes: `POST /auth/change-password` with `{ currentPassword: string; newPassword: string }` — already exists
- Produces: Redirect to `/fms/change-password` when `user.mustChangePassword === true`; clear flag after success

- [ ] **Step 1: changePassword clears mustChangePassword**

In `backend/src/modules/auth/auth.service.ts`, change the `updateOne` inside `changePassword` (line 466):

```typescript
await this.adminUserRepository.updateOne(
  { _id: parseObjectId(adminId, 'adminId') },
  { $set: { password: hashedPassword, mustChangePassword: false }, $unset: { lockoutUntil: 1 }, $set: { failedLoginAttempts: 0 } },
);
```

Wait, can't do two `$set`. Correct version:

```typescript
await this.adminUserRepository.updateOne(
  { _id: parseObjectId(adminId, 'adminId') },
  {
    $set: { password: hashedPassword, mustChangePassword: false, failedLoginAttempts: 0 },
    $unset: { lockoutUntil: 1 },
  },
);
```

- [ ] **Step 2: createFmsUser sets mustChangePassword when tempPassword given**

In `backend/src/modules/purchase/purchase.service.ts`, find `createFmsUser`. It creates an AdminUser doc. When a `tempPassword` is provided, the user must change it on first login. Add `mustChangePassword: true` in the create call. The method currently calls `adminModel.create(...)` with fields from the body. Add:

```typescript
mustChangePassword: true,
```

to the create payload.

- [ ] **Step 3: resetFmsUserPassword sets mustChangePassword**

In `backend/src/modules/purchase/purchase.service.ts`, find `resetFmsUserPassword`. It calls `adminModel.findByIdAndUpdate`. Add `mustChangePassword: true` to the `$set`:

```typescript
{ $set: { password: hash, mustChangePassword: true, failedLoginAttempts: 0 } }
```

- [ ] **Step 4: Create /fms/change-password/page.tsx**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';

export default function FmsChangePasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, setUser } = useAdminAuthStore();
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { toast({ title: 'Passwords do not match', variant: 'destructive' }); return; }
    if (next.length < 8) { toast({ title: 'Min 8 characters', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      if (user) setUser({ ...user, mustChangePassword: false });
      toast({ title: 'Password changed' });
      router.replace('/fms/purchase');
    } catch (err) {
      toast({ title: 'Error', description: getApiError(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F6F2' }}>
      <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-8 w-full max-w-sm shadow-[0_2px_8px_rgba(24,33,28,.08)]">
        <h1 className="font-fraunces text-[22px] font-semibold text-[#18211C] mb-1">Set your password</h1>
        <p className="text-xs text-[#66706A] font-jakarta mb-6">Your account requires a password change before you can continue.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Current (temp) password</label>
            <Input type="password" value={current} onChange={e => setCurrent(e.target.value)} className="h-9 text-sm font-jakarta" required />
          </div>
          <div>
            <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">New password</label>
            <Input type="password" value={next} onChange={e => setNext(e.target.value)} className="h-9 text-sm font-jakarta" required minLength={8} />
          </div>
          <div>
            <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Confirm new password</label>
            <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="h-9 text-sm font-jakarta" required />
          </div>
          <Button type="submit" className="w-full h-10 text-sm text-white font-jakarta" style={{ background: '#1E5E3F' }} disabled={loading}>
            {loading ? 'Saving…' : 'Set Password & Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}
```

Note: `api.changePassword` must be wired. In `frontend/src/lib/api.ts`, add:

```typescript
async changePassword(dto: { currentPassword: string; newPassword: string }): Promise<void> {
  await this.client.post('/auth/change-password', dto);
}
```

- [ ] **Step 5: Gate in layout.tsx**

In `frontend/src/app/fms/layout.tsx`, in the `FmsLayout` component, add mustChangePassword redirect in the `useEffect` (after the existing guards):

```typescript
useEffect(() => {
  if (!hasHydrated) return;
  if (!isAuthenticated) { router.push('/admin-login'); return; }
  if (!hasFmsAccess) { router.push('/admin/dashboard'); return; }
  if (user?.mustChangePassword && pathname !== '/fms/change-password') {
    router.push('/fms/change-password');
  }
}, [hasHydrated, isAuthenticated, hasFmsAccess, user?.mustChangePassword, pathname, router]);
```

Also import `usePathname` (it's already imported). And update the early return to also skip rendering for the change-password path:

```typescript
if (!hasHydrated || !isAuthenticated || !hasFmsAccess) return null;
if (user?.mustChangePassword && pathname !== '/fms/change-password') return null;
```

The `/fms/change-password` page is a standalone full-screen page — it does NOT use the FMS layout sidebar. So it must live outside the layout. Make it `frontend/src/app/fms/change-password/page.tsx` (not inside `(fms)` route group if one exists — check the actual directory structure). The layout.tsx applies to all routes under `/fms/`, so the change-password page WILL be wrapped by layout. To avoid the redirect loop, the gate must check `pathname !== '/fms/change-password'` before redirecting.

- [ ] **Step 6: Verify**

Create a new FMS user with a temp password. Log in. Should redirect to `/fms/change-password`. Enter temp password + new password. Should redirect to `/fms/purchase`. Log out and re-log in with new password — should go straight to dashboard (no redirect).

---

### Task 3: Photo Upload in User Drawer

**Files:**
- Modify: `frontend/src/app/fms/purchase/users/page.tsx`

**Interfaces:**
- Consumes: `POST /purchase/users/:id/photo` with `{ photoUrl: string }` (a base64 data URL or a hosted URL)
- Note: the endpoint just stores whatever URL is passed. We'll pass a base64 data URL directly (no Cloudinary for simplicity; images are small at 256×256).

- [ ] **Step 1: Add photo state and canvas-crop helper to DrawerUser**

At the top of the `FmsUsersPage` component (after the existing `useState` hooks), add:

```typescript
const photoRef = useRef<HTMLInputElement>(null);
const [photoPreview, setPhotoPreview] = useState<string>('');
const [uploadingPhoto, setUploadingPhoto] = useState(false);
```

Add `import { useRef } from 'react';` if not already present (it's not — add it).

- [ ] **Step 2: Canvas-crop function**

Inside the component (before the JSX return), add:

```typescript
const cropToSquare = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = Math.min(img.width, img.height);
      const offX = (img.width  - size) / 2;
      const offY = (img.height - size) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      canvas.getContext('2d')!.drawImage(img, offX, offY, size, size, 0, 0, 256, 256);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
```

- [ ] **Step 3: photoMut mutation**

Add a mutation for uploading the photo:

```typescript
const photoMut = useMutation({
  mutationFn: ({ id, photoUrl }: { id: string; photoUrl: string }) =>
    api.setFmsUserPhoto(id, photoUrl),
  onSuccess: () => {
    toast({ title: 'Photo updated' });
    queryClient.invalidateQueries({ queryKey: ['fms-users'] });
  },
  onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
});
```

Also add `api.setFmsUserPhoto` in `frontend/src/lib/api.ts`:

```typescript
async setFmsUserPhoto(id: string, photoUrl: string): Promise<void> {
  await this.client.post(`/purchase/users/${id}/photo`, { photoUrl });
}
```

- [ ] **Step 4: File input handler**

```typescript
const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file || !form._id) return;
  setUploadingPhoto(true);
  try {
    const dataUrl = await cropToSquare(file);
    setPhotoPreview(dataUrl);
    photoMut.mutate({ id: form._id, photoUrl: dataUrl });
  } catch {
    toast({ title: 'Failed to process image', variant: 'destructive' });
  } finally {
    setUploadingPhoto(false);
    if (photoRef.current) photoRef.current.value = '';
  }
};
```

- [ ] **Step 5: Add photo UI in the drawer**

In the drawer JSX, after the name/loginId/designation fields and before the role preset buttons, add (only when editing an existing user, i.e., `form._id`):

```tsx
{form._id && (
  <div className="flex items-center gap-3">
    {(photoPreview || (users as any[]).find((u: any) => u._id === form._id)?.avatar) ? (
      <img
        src={photoPreview || (users as any[]).find((u: any) => u._id === form._id)?.avatar}
        alt="photo"
        className="h-14 w-14 rounded-full object-cover ring-2 ring-[#1E5E3F]/20 shrink-0"
      />
    ) : (
      <div className="h-14 w-14 rounded-full flex items-center justify-center text-white font-semibold shrink-0 text-lg" style={{ background: '#1E5E3F' }}>
        {form.name?.[0]?.toUpperCase() ?? '?'}
      </div>
    )}
    <div>
      <p className="text-xs font-semibold text-[#18211C] font-jakarta mb-1">Profile photo</p>
      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile} />
      <button
        type="button"
        onClick={() => photoRef.current?.click()}
        disabled={uploadingPhoto || photoMut.isPending}
        className="text-xs text-[#1E5E3F] font-medium hover:underline font-jakarta disabled:opacity-40"
      >
        <Camera className="inline h-3 w-3 mr-0.5" />
        {uploadingPhoto ? 'Processing…' : 'Upload photo'}
      </button>
      <p className="text-[10px] text-[#8A9490] font-jakarta mt-0.5">Cropped to 256×256 px</p>
    </div>
  </div>
)}
```

`Camera` is already imported from lucide-react.

- [ ] **Step 6: Reset photoPreview when drawer closes/reopens**

In `openCreate` and `openEdit`, add `setPhotoPreview('')` to reset the preview state.

- [ ] **Step 7: Verify**

Open user drawer for an existing user. Click "Upload photo". Pick an image. Should see it crop and show the preview. The user card on the list should update after the mutation.

---

### Task 4: Disabled Action Buttons with Lock Icon + Tooltip

**Files:**
- Modify: `frontend/src/app/fms/purchase/[id]/page.tsx`

**Context:** When the current user lacks a permission, action buttons (Create PO, Approve, Receive, Cancel) should appear disabled with a lock icon and a tooltip "Needs X permission — ask admin".

- [ ] **Step 1: Add a LockButton helper component**

Near the top of `[id]/page.tsx` (below `ActorAvatar`), add:

```tsx
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
```

- [ ] **Step 2: Replace primary CTA buttons with lock variants when user lacks permission**

In the `FmsPurchaseRequestDetailPage` component, the header currently has a `primaryCTA` link. Update the conditional rendering. Currently:

```tsx
{primaryCTA && (
  <Link href={primaryCTA.href}>
    <Button size="sm" ...>{primaryCTA.label}</Button>
  </Link>
)}
```

Replace with:

```tsx
{showPOPanel && !canRaisePO && (
  <LockButton label="Create PO" permission="po.raise" />
)}
{showPOPanel && canRaisePO && primaryCTA && (
  <Link href={primaryCTA.href}>
    <Button size="sm" className="h-8 text-xs font-jakarta rounded-[10px] text-white" style={{ background: '#1E5E3F' }}>
      {primaryCTA.label} <ArrowRight className="h-3.5 w-3.5 ml-1" />
    </Button>
  </Link>
)}
{showAppPanel && req.status === 'PO_CREATED' && !canApprove && (
  <LockButton label="Review & Approve" permission="po.approve" />
)}
{showAppPanel && req.status === 'PO_CREATED' && canApprove && primaryCTA && (
  <Link href={primaryCTA.href}>
    <Button size="sm" className="h-8 text-xs font-jakarta rounded-[10px] text-white" style={{ background: '#1E5E3F' }}>
      {primaryCTA.label} <ArrowRight className="h-3.5 w-3.5 ml-1" />
    </Button>
  </Link>
)}
{showRcvPanel && !canReceive && (
  <LockButton label="Receive Goods" permission="delivery.receive" />
)}
{showRcvPanel && canReceive && primaryCTA && (
  <Link href={primaryCTA.href}>
    <Button size="sm" className="h-8 text-xs font-jakarta rounded-[10px] text-white" style={{ background: '#1E5E3F' }}>
      {primaryCTA.label} <ArrowRight className="h-3.5 w-3.5 ml-1" />
    </Button>
  </Link>
)}
```

Note: `showPOPanel`, `showAppPanel`, `showRcvPanel` are already defined as boolean checks on the role — but they currently only show when the user HAS the right role. Change them to show when the request is in the right stage (regardless of permission), so the lock button appears for users without the permission:

```typescript
const showPOPanel  = req.status === 'REQUESTED' || req.status === 'REJECTED';
const showAppPanel = req.status === 'PO_CREATED' || req.status === 'APPROVED' || req.status === 'VENDOR_BILL_UPLOADED';
const showRcvPanel = req.status === 'VENDOR_BILL_UPLOADED';
```

The inline action panels (POCreatorPanel, ApproverPanel, ReceiverPanel) in the sidebar already require the permission to render — keep those unchanged.

- [ ] **Step 3: Cancel button**

In the body, find where the cancel button renders (it's conditionally shown when `canCancel`). Add a lock state for users who are not the requester and lack `request.cancel`:

```tsx
{!canCancel && !['COMPLETED','CANCELLED'].includes(req.status) && (
  <LockButton label="Cancel" permission="request.cancel" />
)}
```

- [ ] **Step 4: Verify**

Log in as a `REQUESTER` (has `pr.create` only). Open a request in `NEEDS_PO` stage. The "Create PO" button should appear as a greyed lock icon. Hover it — tooltip "Needs po.raise — ask admin" appears.

---

### Task 5: "Last action by" Column in Dashboard Table

**Files:**
- Modify: `frontend/src/components/fms/purchase/request-table.tsx`

**Context:** Add a 24px avatar + first name column between Stage and Waiting. The last actor is the last entry in `req.timeline`.

- [ ] **Step 1: Add LastActor helper**

At the top of `request-table.tsx` (after imports), add the AVATAR_COLORS and helpers (same as in `[id]/page.tsx` — do NOT import from there, just re-declare to keep files independent):

```typescript
const AVATAR_COLORS = ['#1E5E3F','#2F6FB5','#C77700','#4B3FAC','#A3241A','#4A6FA5'];
function nameColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function LastActor({ req }: { req: any }) {
  const timeline: any[] = req.timeline || [];
  const last = timeline[timeline.length - 1];
  if (!last) return <span className="text-[#B0B8B3] text-[11px] font-jakarta">—</span>;
  const name: string = last.actor?.name || last.byName || '';
  const firstName = name.split(' ')[0];
  return (
    <div className="flex items-center gap-1.5">
      {last.actor?.photoUrl ? (
        <img src={last.actor.photoUrl} alt={firstName} className="h-6 w-6 rounded-full object-cover shrink-0" />
      ) : (
        <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
          style={{ background: nameColor(name) }}>
          {name[0]?.toUpperCase() ?? '?'}
        </div>
      )}
      <span className="text-[12px] text-[#3E4A43] font-jakarta truncate max-w-[64px]">{firstName}</span>
    </div>
  );
}
```

- [ ] **Step 2: Add column header**

In the `<thead>`, change:

```typescript
{['Request', 'Items', 'Stage', 'Waiting', 'Date', ''].map(h => (
```

to:

```typescript
{['Request', 'Items', 'Stage', 'Last action', 'Waiting', 'Date', ''].map(h => (
```

- [ ] **Step 3: Add cell in tbody**

After the `<td>` for `<StageBadge req={req} />` and before `<WaitChip>`, add:

```tsx
<td className="px-4 py-3 whitespace-nowrap"><LastActor req={req} /></td>
```

- [ ] **Step 4: Verify**

Open the dashboard. The table should now show a small avatar + first name after the Stage column.

---

### Task 6: Materials — UOM Field on Add Form + Default Tag Column

**Files:**
- Modify: `backend/src/modules/purchase/purchase.controller.ts:26–30` (createMaterial body)
- Modify: `backend/src/modules/purchase/purchase.controller.ts:38–44` (updateMaterial body)
- Modify: `backend/src/modules/purchase/purchase.service.ts:165–170` (createMaterial)
- Modify: `backend/src/modules/purchase/purchase.service.ts:172–176` (updateMaterial)
- Modify: `frontend/src/app/fms/purchase/materials/page.tsx`

- [ ] **Step 1: Backend — createMaterial accepts uom**

In `purchase.controller.ts`, change `createMaterial` body type:

```typescript
@Body() body: { name: string; category?: string; uom?: string }
```

In `purchase.service.ts`, `createMaterial`:

```typescript
async createMaterial(data: { name: string; category?: string; uom?: string }) {
  return this.materialModel.create({
    name: data.name.trim(),
    category: data.category || 'OTHER',
    uom: data.uom || 'kg',
  });
}
```

- [ ] **Step 2: Backend — updateMaterial accepts uom + defaultTagId**

In `purchase.controller.ts`, `updateMaterial` body type:

```typescript
@Body() body: { name?: string; category?: string; isActive?: boolean; uom?: string; defaultTagId?: string }
```

In `purchase.service.ts`, `updateMaterial` body type:

```typescript
async updateMaterial(id: string, data: { name?: string; category?: string; isActive?: boolean; uom?: string; defaultTagId?: string })
```

The `$set: data` already passes all fields through, so no other change needed.

- [ ] **Step 3: Frontend — add uom state + field in create form**

In `materials/page.tsx`, add `const [uom, setUom] = useState('kg');` with the other state hooks.

Add a UOM selector in the add form, after the Category select:

```tsx
<div className="w-28">
  <label className="text-xs font-medium text-gray-700">UOM</label>
  <select
    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-jetbrains"
    value={uom}
    onChange={(e) => setUom(e.target.value)}
  >
    {['kg','g','L','ml','pcs','box','packet','roll'].map(u => <option key={u}>{u}</option>)}
  </select>
</div>
```

Change the `createMutation` mutationFn to:

```typescript
mutationFn: () => api.createPurchaseMaterial({ name: name.trim(), category, uom }),
```

Also ensure `api.createPurchaseMaterial` in `api.ts` passes `uom`:

```typescript
async createPurchaseMaterial(data: { name: string; category?: string; uom?: string }): Promise<any> {
  const response = await this.client.post('/purchase/materials', data);
  return response.data.data ?? response.data;
}
```

(If it already exists, just add `uom` to the type.)

- [ ] **Step 4: Frontend — default tag chip column in materials table**

Add `const { data: tags = [] } = useQuery({ queryKey: ['purchase-tags'], queryFn: () => api.getPurchaseTags() });` at the top of the component.

In the table `<thead>`, add `'Default Tag'` to the header array before the last empty cell:

```typescript
{['Name', 'Category', 'Unit', 'Default Tag', 'Active', ''].map(...)}
```

In `<tbody>`, add a cell between UOM and Active:

```tsx
<td className="px-4 py-2">
  {mat.defaultTagId ? (
    (() => {
      const t = (tags as any[]).find((x: any) => x._id === mat.defaultTagId);
      return t ? (
        <span className="text-[11px] px-2 py-0.5 rounded-full font-jakarta font-medium text-white" style={{ background: t.color }}>
          {t.name}
        </span>
      ) : <span className="text-[#B0B8B3] text-xs">—</span>;
    })()
  ) : <span className="text-[#B0B8B3] text-xs">—</span>}
</td>
```

- [ ] **Step 5: Verify**

Go to Materials page. Add form now has a UOM selector. Create "Test Spice" with UOM `g`. It should appear in the table with `g` in the Unit column. Default Tag shows `—` until set.

---

### Task 7: Inline Quick-Add Material from Combobox

**Files:**
- Modify: `frontend/src/app/fms/purchase/new/page.tsx`

**Context:** The `MaterialCombobox` has a `+ Add "Kokum"` button whose `onMouseDown` handler is an empty comment. Wire it up to open a minimal dialog, POST to `/purchase/materials`, then select the new material.

- [ ] **Step 1: Add dialog state**

In `FmsNewPurchaseRequestPage`, add:

```typescript
const [quickAddName, setQuickAddName]   = useState('');
const [quickAddIdx,  setQuickAddIdx]    = useState<number>(-1);
const [quickAddOpen, setQuickAddOpen]   = useState(false);
const [quickAddUom,  setQuickAddUom]    = useState('kg');
const queryClient = useQueryClient(); // add this if not already imported
```

- [ ] **Step 2: Add quick-add mutation**

```typescript
const quickAddMut = useMutation({
  mutationFn: (data: { name: string; uom: string }) => api.createPurchaseMaterial(data),
  onSuccess: (mat: any) => {
    queryClient.invalidateQueries({ queryKey: ['purchase-materials'] });
    setMaterialFromCombobox(quickAddIdx, mat._id ?? mat.data?._id, quickAddName, quickAddUom);
    setQuickAddOpen(false);
    toast({ title: `"${quickAddName}" added` });
  },
  onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
});
```

- [ ] **Step 3: Update MaterialCombobox onMouseDown**

Change `MaterialCombobox` to accept `onQuickAdd: (name: string) => void` prop:

```typescript
function MaterialCombobox({ value, materials, canAdd, onChange, onQuickAdd }: {
  value: string;
  materials: any[];
  canAdd: boolean;
  onChange: (id: string, name: string, uom: string) => void;
  onQuickAdd: (name: string) => void;
}) {
```

In the `+ Add "..."` button:

```typescript
onMouseDown={() => { onQuickAdd(q.trim()); }}
```

In `FmsNewPurchaseRequestPage`, pass `onQuickAdd` to each row's `MaterialCombobox`:

```tsx
<MaterialCombobox
  value={item.materialId}
  materials={materials as any[]}
  canAdd={canAddMaterial}
  onChange={(id, name, uom) => setMaterialFromCombobox(i, id, name, uom)}
  onQuickAdd={(name) => { setQuickAddName(name); setQuickAddIdx(i); setQuickAddUom('kg'); setQuickAddOpen(true); }}
/>
```

- [ ] **Step 4: Add quick-add dialog JSX**

At the bottom of the returned JSX (before the closing `</form>`), add:

```tsx
{quickAddOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-6 w-80 shadow-xl">
      <h3 className="font-fraunces text-[18px] font-semibold text-[#18211C] mb-1">Add material</h3>
      <p className="text-xs text-[#66706A] font-jakarta mb-4">Creates a new material in the master list.</p>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Name</label>
          <Input value={quickAddName} onChange={e => setQuickAddName(e.target.value)} className="h-9 text-sm font-jakarta" />
        </div>
        <div>
          <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">UOM</label>
          <select className="w-full h-9 rounded-[10px] border border-[#ECE9E1] bg-white px-3 text-sm font-jetbrains" value={quickAddUom} onChange={e => setQuickAddUom(e.target.value)}>
            {['kg','g','L','ml','pcs','box','packet','roll'].map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <Button variant="outline" className="flex-1 h-9 text-xs font-jakarta" onClick={() => setQuickAddOpen(false)}>Cancel</Button>
        <Button className="flex-1 h-9 text-xs text-white font-jakarta" style={{ background: '#1E5E3F' }}
          disabled={!quickAddName.trim() || quickAddMut.isPending}
          onClick={() => quickAddMut.mutate({ name: quickAddName.trim(), uom: quickAddUom })}>
          {quickAddMut.isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify**

Open new request form. Type "Kokum" in a material combobox. Click `+ Add "Kokum"`. Dialog opens. Select UOM `kg`. Click Add. Material is created, automatically selected in the row.

---

### Task 8: "Remember tag for this material" Checkbox

**Files:**
- Modify: `frontend/src/app/fms/purchase/new/page.tsx`

**Context:** When the user selects a tag for a material row, show a checkbox "Remember for [Material Name]". On check, immediately PATCH `/purchase/materials/:id` with `defaultTagId`. Only shown when a material is selected (not for blank rows).

- [ ] **Step 1: Add rememberTag state**

```typescript
const [rememberTag, setRememberTag] = useState<Record<number, boolean>>({});
```

- [ ] **Step 2: Add rememberMut mutation**

```typescript
const rememberMut = useMutation({
  mutationFn: ({ id, defaultTagId }: { id: string; defaultTagId: string }) =>
    api.updatePurchaseMaterial(id, { defaultTagId }),
  onError: (err) => toast({ title: 'Could not save tag', description: getApiError(err), variant: 'destructive' }),
});
```

Ensure `api.updatePurchaseMaterial` includes `defaultTagId` in its type:

```typescript
async updatePurchaseMaterial(id: string, data: { name?: string; category?: string; isActive?: boolean; uom?: string; defaultTagId?: string }): Promise<any> {
  const response = await this.client.patch(`/purchase/materials/${id}`, data);
  return response.data.data ?? response.data;
}
```

- [ ] **Step 3: Auto-fill defaultTag when material selected**

In `setMaterialFromCombobox`, after setting the row, also auto-select the material's default tag if it has one:

```typescript
const setMaterialFromCombobox = (i: number, id: string, name: string, uom: string) => {
  const mat = (materials as any[]).find(m => m._id === id);
  const defaultTag = mat?.defaultTagId ? (tags as any[]).find((t: any) => t._id === mat.defaultTagId) : null;
  setItems(prev => prev.map((it, idx) => idx !== i ? it : {
    ...it, materialId: id, materialName: name, uom,
    tagId: defaultTag?._id || it.tagId,
    tagName: defaultTag?.name || it.tagName,
    tagColor: defaultTag?.color || it.tagColor,
  }));
};
```

- [ ] **Step 4: Add checkbox in tag selector**

After the tag chip row (in the `{(tags as any[]).length > 0 && (...)}` block), when a tag IS selected and a materialId IS set, show the checkbox:

```tsx
{item.tagId && item.materialId && (
  <label className="flex items-center gap-1.5 text-[11px] text-[#66706A] font-jakarta cursor-pointer ml-0.5">
    <input
      type="checkbox"
      checked={!!rememberTag[i]}
      onChange={e => {
        setRememberTag(r => ({ ...r, [i]: e.target.checked }));
        if (e.target.checked) {
          rememberMut.mutate({ id: item.materialId, defaultTagId: item.tagId });
        }
      }}
      className="h-3 w-3 rounded accent-[#1E5E3F]"
    />
    Remember for {item.materialName || 'this material'}
  </label>
)}
```

- [ ] **Step 5: Clear rememberTag on material change**

In `setMaterialFromCombobox`, after setting items, also clear the remember state for that row:

```typescript
setRememberTag(r => { const n = { ...r }; delete n[i]; return n; });
```

- [ ] **Step 6: Verify**

New request form: select "Groundnut" → tag "Oils". Check "Remember for Groundnut". Materials page should show "Oils" in the Default Tag column for Groundnut. On next new request, selecting Groundnut should auto-apply the "Oils" tag.

---

### Task 9: Tags Management Page

**Files:**
- Create: `frontend/src/app/fms/purchase/tags/page.tsx`
- Modify: `frontend/src/app/fms/layout.tsx` (add Tags nav link)

**Context:** Full CRUD for tags. Backend already has `GET /purchase/tags?all=true`, `POST /purchase/tags`, `PATCH /purchase/tags/:id`. The `PurchaseTag` schema has `name`, `color`, `description`, `isActive`.

- [ ] **Step 1: Create tags/page.tsx**

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Plus, Pencil, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/fms/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';

const PRESET_COLORS = ['#1E5E3F','#2F6FB5','#C77700','#4B3FAC','#A3241A','#4A6FA5','#66706A','#C05621'];

export default function FmsPurchaseTagsPage() {
  const canManage = usePermission('tags.manage');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName]   = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [desc, setDesc]   = useState('');
  const [editing, setEditing] = useState<Record<string, { name: string; color: string; desc: string }>>({});

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['purchase-tags-all'],
    queryFn: () => api.getPurchaseTags(true),
  });

  const createMut = useMutation({
    mutationFn: () => api.createPurchaseTag({ name: name.trim(), color, description: desc }),
    onSuccess: () => {
      toast({ title: 'Tag created' });
      setName(''); setDesc('');
      queryClient.invalidateQueries({ queryKey: ['purchase-tags-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-tags'] });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updatePurchaseTag(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-tags-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-tags'] });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  if (!canManage) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: '#F7F6F2' }}>
        <p className="text-sm text-[#66706A] font-jakarta">Needs tags.manage permission.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full" style={{ background: '#F7F6F2' }}>
      <div className="bg-white border-b border-[#ECE9E1] px-6 py-4">
        <div className="flex items-center gap-2 text-xs text-[#8A9490] mb-1 font-jakarta">
          <Tag className="h-3.5 w-3.5" /><span>Tags</span>
        </div>
        <h1 className="font-fraunces text-[22px] font-semibold text-[#18211C]">Purchase Tags</h1>
        <p className="text-xs text-[#8A9490] font-jakarta mt-0.5">Categorise materials for dashboard filtering</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Create form */}
        <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-5">
          <h2 className="text-sm font-semibold text-[#18211C] font-jakarta mb-4">New Tag</h2>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Oils" className="h-9 text-sm font-jakarta" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Colour</label>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button"
                    onClick={() => setColor(c)}
                    className="h-7 w-7 rounded-full ring-offset-2 transition-all"
                    style={{ background: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                ))}
              </div>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Description (optional)</label>
              <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short description" className="h-9 text-sm font-jakarta" />
            </div>
            <Button size="sm" className="h-9 text-sm text-white font-jakarta rounded-[10px]" style={{ background: '#1E5E3F' }}
              disabled={!name.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>

        {/* Tags table */}
        <div className="bg-white rounded-[18px] border border-[#ECE9E1] overflow-hidden">
          <div className="border-b border-[#ECE9E1] px-5 py-3">
            <p className="text-sm font-semibold text-[#18211C] font-jakarta">Tags ({(tags as any[]).length})</p>
          </div>
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="h-6 w-6 border-2 border-[#1E5E3F] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead style={{ background: '#FAF9F5' }} className="border-b border-[#ECE9E1]">
                <tr>
                  {['Tag', 'Description', 'Active', ''].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[#8A9490] font-jakarta">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(tags as any[]).map((tag: any) => {
                  const ed = editing[tag._id];
                  return (
                    <tr key={tag._id} className="border-b last:border-0 hover:bg-[#FAF9F5]">
                      <td className="px-5 py-3">
                        {ed ? (
                          <div className="flex items-center gap-2">
                            <Input value={ed.name} onChange={e => setEditing(p => ({ ...p, [tag._id]: { ...p[tag._id], name: e.target.value } }))}
                              className="h-7 text-xs w-36 font-jakarta" />
                            <div className="flex gap-1">
                              {PRESET_COLORS.map(c => (
                                <button key={c} type="button" onClick={() => setEditing(p => ({ ...p, [tag._id]: { ...p[tag._id], color: c } }))}
                                  className="h-5 w-5 rounded-full"
                                  style={{ background: c, outline: ed.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-jakarta font-medium text-white" style={{ background: tag.color }}>
                            {tag.name}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[#66706A] text-xs font-jakarta">
                        {ed ? (
                          <Input value={ed.desc} onChange={e => setEditing(p => ({ ...p, [tag._id]: { ...p[tag._id], desc: e.target.value } }))}
                            className="h-7 text-xs font-jakarta" />
                        ) : (tag.description || '—')}
                      </td>
                      <td className="px-5 py-3">
                        <Switch checked={tag.isActive} onCheckedChange={checked => updateMut.mutate({ id: tag._id, data: { isActive: checked } })} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {ed ? (
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600"
                              onClick={() => { updateMut.mutate({ id: tag._id, data: { name: ed.name, color: ed.color, description: ed.desc } }); setEditing(p => { const n = { ...p }; delete n[tag._id]; return n; }); }}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-[#66706A]"
                              onClick={() => setEditing(p => { const n = { ...p }; delete n[tag._id]; return n; })}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-[#66706A]"
                            onClick={() => setEditing(p => ({ ...p, [tag._id]: { name: tag.name, color: tag.color, desc: tag.description || '' } }))}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
```

Also verify `api.getPurchaseTags`, `api.createPurchaseTag`, `api.updatePurchaseTag` exist in `api.ts`. If `getPurchaseTags` only accepts active ones, ensure it can accept `all=true`:

```typescript
async getPurchaseTags(all?: boolean): Promise<any[]> {
  const response = await this.client.get('/purchase/tags', { params: all ? { all: 'true' } : {} });
  return response.data.data ?? response.data;
}
```

- [ ] **Step 2: Add Tags nav link in layout**

In `frontend/src/app/fms/layout.tsx`, in `NAV_LINKS`, add after Materials:

```typescript
{
  href: '/fms/purchase/tags',
  label: 'Tags',
  Icon: Tag,
  active: pathname.startsWith('/fms/purchase/tags'),
},
```

Import `Tag` from `lucide-react` (add to existing import).

- [ ] **Step 3: Verify**

Sidebar shows "Tags" link. Click it. Tags page loads showing all tags with colour chips. Create a new tag "Processing" in orange. It should appear in the list and in the dashboard tag filter.

---

### Task 10: Parent Request Detail — Split PO View Blocks

**Files:**
- Modify: `frontend/src/app/fms/purchase/[id]/page.tsx`

**Context:** When `req.status === 'SPLIT'`, the items table currently just shows a purple "Split into N vendor POs" block. Blueprint §5.3–5.4 requires two named blocks: "Pending PO (N items)" showing `lineStatus === 'NEEDS_PO'` items, and "Raised POs (N)" showing children grouped by PO.

- [ ] **Step 1: Replace the split block in the Items card**

Locate the block at approximately `req.status === 'SPLIT' && req.children?.length > 0` (lines 635–650 of `[id]/page.tsx`). Keep the existing per-child link list but add the pending items block above it.

Replace the entire block with:

```tsx
{req.status === 'SPLIT' && (
  <>
    {/* Pending PO items */}
    {(() => {
      const pending = (req.items || []).filter((i: any) => i.lineStatus === 'NEEDS_PO');
      if (!pending.length) return null;
      return (
        <div className="px-5 py-3 border-t border-[#ECE9E1]" style={{ background: '#FDF3E3' }}>
          <p className="text-xs font-semibold mb-2 font-jakarta" style={{ color: '#8A4B06' }}>
            Pending PO ({pending.length} {pending.length === 1 ? 'item' : 'items'})
          </p>
          <div className="space-y-1">
            {pending.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between text-xs font-jakarta">
                <span style={{ color: '#8A4B06' }}>{item.materialName}</span>
                <span className="font-jetbrains" style={{ color: '#C05621' }}>{item.qtyKg} {item.uom || 'kg'}</span>
              </div>
            ))}
          </div>
          {canRaisePO && (
            <Link href={`/fms/purchase/${req._id}/raise-po`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium font-jakarta hover:underline" style={{ color: '#8A4B06' }}>
              Raise PO for remaining <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      );
    })()}
    {/* Raised child POs */}
    {req.children?.length > 0 && (
      <div className="px-5 py-3 border-t border-[#ECE9E1]" style={{ background: '#F5F3FF' }}>
        <p className="text-xs font-semibold mb-2 font-jakarta" style={{ color: '#4B3FAC' }}>
          Raised POs ({req.children.length})
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
              <span className="text-xs font-bold font-jetbrains text-[#1E5E3F]">
                ₹{child.po?.totalAmount?.toLocaleString('en-IN')}
              </span>
            </div>
          </Link>
        ))}
      </div>
    )}
  </>
)}
```

- [ ] **Step 2: Verify**

Open a SPLIT parent request. Should see an orange "Pending PO (2 items)" block and a purple "Raised POs (1)" block with the child link.

---

### Task 11: Dashboard Split Stage Chip

**Files:**
- Modify: `frontend/src/components/fms/purchase/chips.tsx`
- Modify: `frontend/src/components/fms/purchase/request-table.tsx`

**Context:** When a request is SPLIT (partial PO), the `StageBadge` currently shows based on `getStage(req)` which derives a single stage. For SPLIT requests, show both buckets: "Needs PO · N | Awaiting · M".

- [ ] **Step 1: Extend StageBadge in chips.tsx**

Read `chips.tsx` first. Then add a `SplitStageBadge` component or extend `StageBadge` to detect SPLIT:

```tsx
export function StageBadge({ req }: { req: any }) {
  if (req.status === 'SPLIT') {
    const needsPO   = (req.items || []).filter((i: any) => i.lineStatus === 'NEEDS_PO').length;
    const raisedPOs = (req.children || []).length;
    return (
      <div className="inline-flex items-center gap-1 text-[10px] font-medium font-jakarta rounded-full px-2 py-0.5 border"
        style={{ background: '#F5F3FF', borderColor: '#D0C9FF', color: '#4B3FAC' }}>
        <span>Needs PO · {needsPO}</span>
        {raisedPOs > 0 && (
          <>
            <span className="opacity-30">|</span>
            <span>Awaiting · {raisedPOs}</span>
          </>
        )}
      </div>
    );
  }
  // ... existing logic unchanged
```

If `StageBadge` has complex logic, add the SPLIT check at the top as a short-circuit, before the existing code.

- [ ] **Step 2: Verify**

Dashboard table: a SPLIT request should show a purple "Needs PO · 2 | Awaiting · 1" chip instead of a single stage.

---

### Task 12: Department + Required By Mandatory on New Request

**Files:**
- Modify: `frontend/src/app/fms/purchase/new/page.tsx`

- [ ] **Step 1: Add validation to handleSubmit**

Locate `handleSubmit` in `FmsNewPurchaseRequestPage`. Before the `createMut.mutate(...)` call, add:

```typescript
if (!department) {
  toast({ title: 'Select a department', variant: 'destructive' }); return;
}
if (!requiredBy) {
  toast({ title: 'Set a required-by date', variant: 'destructive' }); return;
}
```

- [ ] **Step 2: Add visual required indicator**

In the Department label:

```tsx
<label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Department <span className="text-red-500">*</span></label>
```

In the Required By label:

```tsx
<label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Required By <span className="text-red-500">*</span></label>
```

- [ ] **Step 3: Verify**

New request form: click "Send Request" without selecting Department → toast "Select a department". Fill in Department but not Required By → toast "Set a required-by date". Both filled → form submits normally.

---

### Task 13: Parent Stepper Roll-up from Child PO Progress

**Files:**
- Modify: `frontend/src/app/fms/purchase/[id]/page.tsx`

**Context:** When `req.status === 'SPLIT'`, the `PipelineTracker` shows a 5-step timeline based on the parent's own status transitions. Blueprint §10 says the stepper should roll up child PO progress. The parent never reaches `PO_CREATED` directly — it goes to `SPLIT`. Show a compact roll-up strip below the stepper for SPLIT requests.

- [ ] **Step 1: Add ChildRollup component**

After `PipelineTracker`, add in the JSX:

```tsx
{req.status === 'SPLIT' && req.children?.length > 0 && (
  <ChildRollup children={req.children} />
)}
```

Add the component above `PipelineTracker`:

```tsx
function ChildRollup({ children }: { children: any[] }) {
  const counts = children.reduce((acc: Record<string, number>, c: any) => {
    const s = getStage(c);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const ORDER = ['NEEDS_PO','AWAITING_APPROVAL','AWAITING_DELIVERY','PARTLY_RECEIVED','READY_TO_CLOSE','CLOSED','CANCELLED'];
  const entries = ORDER.filter(s => counts[s]).map(s => ({ s, n: counts[s] }));

  return (
    <div className="bg-white rounded-[18px] border border-[#D0C9FF] px-5 py-3 shadow-[0_1px_2px_rgba(75,63,172,.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#4B3FAC] font-jakarta mb-2">
        Child PO progress ({children.length} POs)
      </p>
      <div className="flex flex-wrap gap-2">
        {entries.map(({ s, n }) => (
          <span key={s} className="text-[11px] px-2.5 py-1 rounded-full font-jakarta font-medium"
            style={{ background: '#EEF', color: '#4B3FAC', border: '1px solid #D0C9FF' }}>
            {s.replace(/_/g, ' ')} · {n}
          </span>
        ))}
      </div>
    </div>
  );
}
```

Note: Import `getStage` is already in scope for this file.

- [ ] **Step 2: Verify**

Open a SPLIT parent. Below the 5-step pipeline stepper, a purple roll-up block shows "AWAITING APPROVAL · 1" (or whatever stages the children are in).

---

### Task 14: Migration Script

**Files:**
- Create: `scripts/migrate-fms-v2.ts`

**Context:** Backfill `lineStatus` on items of existing PurchaseRequests that were created before the `lineStatus` field was added. Items in SPLIT requests with a child PO should have `lineStatus: 'PO_RAISED'`; others should have `lineStatus: 'NEEDS_PO'`.

- [ ] **Step 1: Create the script**

```typescript
// scripts/migrate-fms-v2.ts
// Idempotent backfill: sets lineStatus on PurchaseRequest items that lack it.
// Usage: npx ts-node -r tsconfig-paths/register scripts/migrate-fms-v2.ts [--dry-run]
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const DRY = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected. DRY_RUN =', DRY);

  const db = mongoose.connection.db!;
  const col = db.collection('purchaserequests');

  // Only touch docs that have at least one item missing lineStatus
  const cursor = col.find({ 'items.lineStatus': { $exists: false } });
  let patched = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    const items = doc.items as any[];
    if (!items?.length) { skipped++; continue; }

    // Gather childPoIds that exist
    const children: any[] = doc.children ?? [];
    const raisedMaterialIds = new Set<string>(
      children.flatMap((c: any) => (c.items ?? []).map((i: any) => String(i.materialId)))
    );

    const updatedItems = items.map((item: any) => {
      if (item.lineStatus) return item; // already set, skip
      return {
        ...item,
        lineStatus: raisedMaterialIds.has(String(item.materialId)) ? 'PO_RAISED' : 'NEEDS_PO',
      };
    });

    const hasChange = updatedItems.some((u: any, i: number) => u.lineStatus !== items[i]?.lineStatus);
    if (!hasChange) { skipped++; continue; }

    if (!DRY) {
      await col.updateOne({ _id: doc._id }, { $set: { items: updatedItems } });
    }
    patched++;
    console.log(`${DRY ? '[DRY] ' : ''}Patched ${doc.reqNo} (${updatedItems.filter((i: any) => i.lineStatus === 'PO_RAISED').length} PO_RAISED, ${updatedItems.filter((i: any) => i.lineStatus === 'NEEDS_PO').length} NEEDS_PO)`);
  }

  console.log(`Done. patched=${patched} skipped=${skipped}`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run dry-run**

```bash
npx ts-node -r tsconfig-paths/register scripts/migrate-fms-v2.ts --dry-run
```

Expected: lists requests that would be patched, with counts. No DB writes.

- [ ] **Step 3: Verify idempotency**

Run the script twice (without `--dry-run`). Second run should report `patched=0` since all docs were already patched on first run.

---

## Self-Review

**Spec coverage:**
- §3.5 mustChangePassword gate → Task 2 ✓
- §3.5 rate limiting → Already done in auth.service.ts ✓ (skip)
- §3.6 photo upload → Task 3 ✓
- §3.9 action button locks → Task 4 ✓
- §3.9 last action by column → Task 5 ✓
- §4.3 materials UOM field → Task 6 ✓
- §4.3 default tag chip → Task 6 ✓
- §4.3 inline quick-add → Task 7 ✓
- §4.3 remember tag → Task 8 ✓
- §6.2 tags management page → Task 9 ✓
- §5.3–5.4 split view blocks → Task 10 ✓
- §5.4 split stage chip → Task 11 ✓
- §10 mandatory dept+reqBy → Task 12 ✓
- §10 parent stepper roll-up → Task 13 ✓
- §10 multi-child "Review & Approve" → **GAP**: The `approve/page.tsx` for SPLIT requests (showing child PO list with inline approve/reject) is not covered. The current approve page only handles single PO. Adding this requires reading approve/page.tsx and rewriting it for the SPLIT case. Adding as **Task 15** below.
- §7 migration script → Task 14 ✓

**Task 1 (login enrichment) is a prerequisite for Task 4 (lock buttons) since permissions need to be populated.**

---

### Task 15: Multi-child Approve Page (SPLIT requests)

**Files:**
- Modify: `frontend/src/app/fms/purchase/[id]/approve/page.tsx`

- [ ] **Step 1: Read current approve/page.tsx**

Read `frontend/src/app/fms/purchase/[id]/approve/page.tsx` to understand its current structure. It likely handles a single `req.po` case. The SPLIT case needs to show `req.children` as separate approve/reject cards.

- [ ] **Step 2: Add SPLIT branch**

After loading `req`, detect SPLIT:

```typescript
const isSplit = req.status === 'SPLIT' || (req.children?.length > 1);
```

If `isSplit`, render a child-list view. Each child has its own status and PO. For children in `AWAITING_APPROVAL`, show Approve/Reject buttons. For others, show their current status.

```tsx
{isSplit && (
  <div className="space-y-4">
    <p className="text-sm font-semibold text-[#4B3FAC] font-jakarta">
      Split request — {req.children.length} vendor POs
    </p>
    {req.children.map((child: any) => (
      <ChildApproveCard key={child._id} child={child} onSuccess={refetch} />
    ))}
  </div>
)}
```

Add `ChildApproveCard` component:

```tsx
function ChildApproveCard({ child, onSuccess }: { child: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [rejReason, setRejReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const decisionMut = useMutation({
    mutationFn: (data: any) => api.makePurchaseDecision(child._id, data),
    onSuccess: () => { toast({ title: 'Decision recorded' }); onSuccess(); },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const childStage = getStage(child);
  const canAct = childStage === 'AWAITING_APPROVAL';

  return (
    <div className="bg-white rounded-[18px] border border-[#D0C9FF] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold font-jetbrains text-[#4B3FAC]">{child.reqNo}</p>
          <p className="text-sm font-medium text-[#18211C] font-jakarta">{child.po?.vendorName}</p>
          {child.po?.vendorPhone && <p className="text-xs text-[#66706A] font-jakarta">{child.po.vendorPhone}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-[#1E5E3F] font-jetbrains">₹{child.po?.totalAmount?.toLocaleString('en-IN')}</p>
          <StageBadge req={child} />
        </div>
      </div>
      {child.po?.items?.map((i: any, idx: number) => (
        <div key={idx} className="flex justify-between text-xs text-[#3E4A43] font-jakarta">
          <span>{i.materialName} {i.qtyKg} {i.uom || 'kg'} × ₹{i.ratePerKg}/kg</span>
          <span className="font-medium font-jetbrains">₹{i.amount?.toLocaleString('en-IN')}</span>
        </div>
      ))}
      {canAct && !showReject && (
        <div className="flex gap-2 pt-1">
          <Button onClick={() => decisionMut.mutate({ action: 'APPROVED' })} disabled={decisionMut.isPending}
            className="flex-1 h-8 text-xs text-white font-jakarta rounded-[10px]" style={{ background: '#1E5E3F' }}>
            Approve
          </Button>
          <Button variant="outline" onClick={() => setShowReject(true)}
            className="text-red-600 border-red-200 flex-1 h-8 text-xs font-jakarta rounded-[10px]">
            Reject
          </Button>
        </div>
      )}
      {canAct && showReject && (
        <div className="space-y-2">
          <Input placeholder="Rejection reason" value={rejReason} onChange={e => setRejReason(e.target.value)} className="h-8 text-xs" />
          <div className="flex gap-2">
            <Button variant="destructive" className="flex-1 h-8 text-xs font-jakarta rounded-[10px]"
              onClick={() => decisionMut.mutate({ action: 'REJECTED', reason: rejReason })}
              disabled={!rejReason.trim() || decisionMut.isPending}>Confirm Reject</Button>
            <Button variant="outline" className="h-8 text-xs font-jakarta rounded-[10px]" onClick={() => setShowReject(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Note: `getStage`, `StageBadge`, `api.makePurchaseDecision` are already in scope in `approve/page.tsx` — verify when reading the file.

- [ ] **Step 3: Verify**

Open a SPLIT parent request → click "Review & Approve" from the header. Should see multiple child PO cards, each showing vendor name, items, total, and Approve/Reject buttons (when AWAITING_APPROVAL). Approving one child updates just that child's status.
