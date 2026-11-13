'use client';

import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

/** Manual "send this bill on WhatsApp" for list rows. Same endpoint as the invoice page; the server queues it and retries on failure. */
export function WaSendButton({ billId }: { billId: string }) {
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: () => api.retryBillingWhatsapp(billId),
    onSuccess: (r) => toast(r?.status === 'queued'
      ? { title: 'WhatsApp queued', description: 'Open the invoice to see the delivery status.' }
      : { title: 'Not sent', description: r?.status === 'skipped_no_phone' ? 'This customer has no valid WhatsApp number.' : 'Bill not found.', variant: 'destructive' }),
    onError: (e) => toast({ title: 'Could not send', description: getApiError(e), variant: 'destructive' }),
  });
  return (
    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={m.isPending} onClick={e => { e.stopPropagation(); m.mutate(); }}>
      {m.isPending ? 'Sending…' : 'WhatsApp'}
    </Button>
  );
}
