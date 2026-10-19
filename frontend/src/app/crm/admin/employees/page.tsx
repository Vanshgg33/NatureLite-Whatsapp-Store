'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Plus, KeyRound, LogOut, Power, X, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { formatIST } from '@/lib/time';
import { useToast } from '@/components/ui/use-toast';

const DEPT_OPTIONS = [
  { value: 'crm_manager', label: 'Manager' },
  { value: 'crm_senior',  label: 'Senior Agent' },
  { value: 'crm_viewer',  label: 'Viewer (read-only)' },
];

const DEPT_LABEL: Record<string, string> = {
  crm_head:    'CRM Head',
  crm_manager: 'Manager',
  crm_senior:  'Senior Agent',
  crm_viewer:  'Viewer',
};

function Badge({ dept, isActive }: { dept: string; isActive: boolean }) {
  const label = DEPT_LABEL[dept] ?? dept;
  const color = dept === 'crm_head' ? 'var(--crm-gold)'
    : dept === 'crm_manager' ? 'var(--crm-blue)'
    : dept === 'crm_senior'  ? 'var(--crm-success)'
    : 'var(--crm-muted)';
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
        {label}
      </span>
      {!isActive && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: 'var(--crm-danger-bg)', color: 'var(--crm-danger)' }}>
          disabled
        </span>
      )}
    </div>
  );
}

type Employee = {
  _id: string; name: string; email: string; loginId?: string;
  departmentType: string; isActive: boolean; lastLoginAt?: string;
};

function TempPasswordModal({ password, onClose }: { password: string; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl p-6 w-80 space-y-4" style={{ background: 'var(--crm-paper)' }}>
        <h3 className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>Temp Password — copy now</h3>
        <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>
          This is shown once. The employee must change it on first login.
        </p>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--crm-sand)', border: '1px solid var(--crm-line)' }}>
          <span className="flex-1 font-mono text-[13px]" style={{ color: 'var(--crm-ink)', letterSpacing: visible ? 'normal' : '0.25em' }}>
            {visible ? password : '••••••••••'}
          </span>
          <button onClick={() => setVisible(v => !v)} style={{ color: 'var(--crm-muted)' }}>
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full py-2 rounded-xl text-[13px] font-semibold"
          style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (pw: string) => void }) {
  const [form, setForm] = useState({ name: '', email: '', loginId: '', departmentType: 'crm_senior' });
  const { toast } = useToast();

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.createCrmEmployee({ ...form, loginId: form.loginId || undefined }),
    onSuccess: (data) => {
      onCreated(data.tempPassword);
    },
    onError: () => toast({ title: 'Create failed', variant: 'destructive' }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl p-6 w-96 space-y-4" style={{ background: 'var(--crm-paper)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>Add Team Member</h3>
          <button onClick={onClose}><X className="h-4 w-4" style={{ color: 'var(--crm-muted)' }} /></button>
        </div>
        {(['name', 'email', 'loginId'] as const).map(f => (
          <div key={f}>
            <label className="text-[12px] font-medium block mb-1" style={{ color: 'var(--crm-muted)' }}>
              {f === 'loginId' ? 'Login ID (optional)' : f.charAt(0).toUpperCase() + f.slice(1)}
            </label>
            <input
              value={form[f]}
              onChange={e => setForm(s => ({ ...s, [f]: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none"
              style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)', background: 'var(--crm-sand)' }}
            />
          </div>
        ))}
        <div>
          <label className="text-[12px] font-medium block mb-1" style={{ color: 'var(--crm-muted)' }}>Role</label>
          <select
            value={form.departmentType}
            onChange={e => setForm(s => ({ ...s, departmentType: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none"
            style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)', background: 'var(--crm-sand)' }}
          >
            {DEPT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button
          onClick={() => mutate()}
          disabled={isPending || !form.name || !form.email}
          className="w-full py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40"
          style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
        >
          {isPending ? 'Creating…' : 'Create & Get Password'}
        </button>
      </div>
    </div>
  );
}

function EditModal({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dept, setDept] = useState(emp.departmentType);
  const [tempPw, setTempPw] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (data: { departmentType?: string; isActive?: boolean }) => api.updateCrmEmployee(emp._id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-employees'] }); toast({ title: 'Updated' }); },
    onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
  });

  const resetPw = useMutation({
    mutationFn: () => api.resetCrmEmployeePassword(emp._id),
    onSuccess: (data) => setTempPw(data.tempPassword),
    onError: () => toast({ title: 'Reset failed', variant: 'destructive' }),
  });

  const forceLogout = useMutation({
    mutationFn: () => api.forceCrmEmployeeLogout(emp._id),
    onSuccess: () => { toast({ title: 'Force-logged out' }); onClose(); },
    onError: () => toast({ title: 'Failed', variant: 'destructive' }),
  });

  if (tempPw) return <TempPasswordModal password={tempPw} onClose={() => { setTempPw(null); onClose(); }} />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl p-6 w-96 space-y-4" style={{ background: 'var(--crm-paper)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>{emp.name}</h3>
            <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>{emp.email}</p>
          </div>
          <button onClick={onClose}><X className="h-4 w-4" style={{ color: 'var(--crm-muted)' }} /></button>
        </div>

        {emp.departmentType !== 'crm_head' && (
          <div>
            <label className="text-[12px] font-medium block mb-1" style={{ color: 'var(--crm-muted)' }}>Role</label>
            <div className="flex gap-2">
              <select
                value={dept}
                onChange={e => setDept(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-[13px] focus:outline-none"
                style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)', background: 'var(--crm-sand)' }}
              >
                {DEPT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button
                onClick={() => update.mutate({ departmentType: dept })}
                disabled={dept === emp.departmentType || update.isPending}
                className="px-3 py-2 rounded-lg text-[12px] font-semibold disabled:opacity-40"
                style={{ background: 'var(--crm-blue-bg)', color: 'var(--crm-blue)' }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => update.mutate({ isActive: !emp.isActive })}
            disabled={update.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold disabled:opacity-40"
            style={{
              background: emp.isActive ? 'var(--crm-danger-bg)' : 'var(--crm-success-bg)',
              color: emp.isActive ? 'var(--crm-danger)' : 'var(--crm-success)',
            }}
          >
            <Power className="h-3.5 w-3.5" />
            {emp.isActive ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={() => resetPw.mutate()}
            disabled={resetPw.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold disabled:opacity-40"
            style={{ background: 'var(--crm-amber-bg, color-mix(in srgb, var(--crm-amber) 12%, transparent))', color: 'var(--crm-amber)' }}
          >
            <KeyRound className="h-3.5 w-3.5" />
            {resetPw.isPending ? '…' : 'Reset Pwd'}
          </button>
          <button
            onClick={() => forceLogout.mutate()}
            disabled={forceLogout.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold disabled:opacity-40"
            style={{ background: 'color-mix(in srgb, var(--crm-muted) 10%, transparent)', color: 'var(--crm-muted)' }}
          >
            <LogOut className="h-3.5 w-3.5" />
            {forceLogout.isPending ? '…' : 'Kick'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CrmEmployeesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [newTempPw, setNewTempPw] = useState<string | null>(null);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['crm-employees'],
    queryFn: () => api.getCrmEmployees(),
  });

  return (
    <div className="min-h-full" style={{ background: 'var(--crm-sand)' }}>
      <div style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}>
        <div className="px-7 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5" style={{ color: 'var(--crm-gold)' }} />
            <h1 className="text-[20px] font-semibold" style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-sans, DM Sans, system-ui)' }}>
              CRM Team
            </h1>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold"
            style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
          >
            <Plus className="h-4 w-4" />
            Add Member
          </button>
        </div>
      </div>

      <div className="p-7 max-w-2xl">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <div className="crm-card-v2 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--crm-line)' }}>
                  {['Name', 'Role', 'Last Login', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--crm-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(employees as Employee[]).map(emp => (
                  <tr
                    key={emp._id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--crm-line)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--crm-sand)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium" style={{ color: 'var(--crm-ink)' }}>{emp.name}</p>
                      <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>{emp.loginId ?? emp.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge dept={emp.departmentType} isActive={emp.isActive} />
                    </td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: 'var(--crm-muted)' }}>
                      {emp.lastLoginAt ? formatIST(emp.lastLoginAt, true) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(emp)}
                        className="text-[12px] px-3 py-1 rounded-lg"
                        style={{ color: 'var(--crm-blue)', background: 'var(--crm-blue-bg)' }}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
                {!employees.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--crm-muted)' }}>
                      No team members yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={(pw) => { setCreating(false); setNewTempPw(pw); qc.invalidateQueries({ queryKey: ['crm-employees'] }); }}
        />
      )}
      {newTempPw && <TempPasswordModal password={newTempPw} onClose={() => setNewTempPw(null)} />}
      {editing && <EditModal emp={editing} onClose={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['crm-employees'] }); }} />}
    </div>
  );
}
