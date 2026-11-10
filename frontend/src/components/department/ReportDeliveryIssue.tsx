'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

const ISSUES = [
  { id: 'damaged', label: 'Damaged / leaked' },
  { id: 'wrong_item', label: 'Wrong item' },
  { id: 'missing_item', label: 'Missing item' },
  { id: 'refused', label: 'Customer refused' },
];

/** Lets the delivery person raise a complaint ticket from the door; the CRM team picks it up. */
export function ReportDeliveryIssue({ orderId }: { orderId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState('damaged');
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const r = await api.uploadImage(file, 'complaints');
      setPhotoUrl(r.secureUrl || r.url);
    } catch {
      toast({ title: 'Photo upload failed', description: 'Check your connection and try again.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const submit = useMutation({
    mutationFn: () => api.reportDeliveryIssue({ orderId, issue, note, photoUrl }),
    onSuccess: (r) => {
      toast({ title: `Reported (${r.ticketNo})`, description: 'The CRM team has been notified.' });
      setOpen(false); setNote(''); setPhotoUrl(undefined);
    },
    onError: (e) => toast({ title: 'Could not report', description: getApiError(e), variant: 'destructive' }),
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-red-200 bg-red-50 text-sm font-semibold text-red-700">
        <AlertTriangle className="h-4 w-4" /> Problem at the door? Report it
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-red-200 p-4 shadow-sm space-y-3">
      <p className="text-sm font-semibold text-gray-800">What is the problem?</p>
      <div className="flex flex-wrap gap-2">
        {ISSUES.map(i => (
          <button key={i.id} type="button" onClick={() => setIssue(i.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${issue === i.id ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-200'}`}>
            {i.label}
          </button>
        ))}
      </div>
      <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="What happened? (optional)" />
      <input type="file" accept="image/*" capture="environment" disabled={uploading}
        onChange={e => e.target.files?.[0] && upload(e.target.files[0])} className="text-xs" />
      {uploading && <p className="text-xs text-gray-500">Uploading photo…</p>}
      {photoUrl && <p className="text-xs text-green-700">Photo attached ✓</p>}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
        <Button className="flex-1 bg-red-600 hover:bg-red-700" disabled={uploading || submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending ? 'Sending…' : 'Report'}
        </Button>
      </div>
    </div>
  );
}
