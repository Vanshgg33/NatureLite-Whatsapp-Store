'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Megaphone, Send, Users, Phone } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

interface BroadcastResult {
  queued: number;
  skipped: number;
  sentAt: string;
  templateName: string;
  targetCount: number;
}

export default function CampaignsPage() {
  const [templateName, setTemplateName] = useState('');
  const [params, setParams] = useState('');
  const [phones, setPhones] = useState('');
  const [history, setHistory] = useState<BroadcastResult[]>([]);
  const { toast } = useToast();

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const phoneList = phones
        .split(/[\n,]+/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 10);

      if (phoneList.length === 0) throw new Error('No valid phone numbers');
      if (!templateName.trim()) throw new Error('Template name is required');

      const paramList = params
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

      return api.sendBroadcast(phoneList, templateName, paramList);
    },
    onSuccess: (data) => {
      setHistory((prev) => [
        {
          ...data,
          sentAt: new Date().toISOString(),
          templateName,
          targetCount: phones.split(/[\n,]+/).filter((p) => p.trim().length >= 10).length,
        },
        ...prev,
      ]);
      toast({
        title: 'Broadcast sent',
        description: `${data.queued} messages queued, ${data.skipped} skipped`,
      });
      setPhones('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Broadcast failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <div>
      <Header title="Campaigns" description="Send broadcast messages via WhatsApp" />

      <div className="p-6 space-y-6">
        {/* Broadcast Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              New Broadcast
            </CardTitle>
            <CardDescription>
              Send template messages to multiple customers at once
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Template Name</label>
                <Input
                  placeholder="e.g., order_update, promo_offer"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Must match an approved WhatsApp template
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Template Parameters</label>
                <Input
                  placeholder="param1, param2, param3"
                  value={params}
                  onChange={(e) => setParams(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated values for template placeholders
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Target Phone Numbers
              </label>
              <textarea
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={"One phone number per line or comma-separated\n919876543210\n919876543211"}
                value={phones}
                onChange={(e) => setPhones(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Include country code (e.g., 91 for India)
                </p>
                <Badge variant="outline">
                  <Users className="mr-1 h-3 w-3" />
                  {phones.split(/[\n,]+/).filter((p) => p.trim().length >= 10).length} recipients
                </Badge>
              </div>
            </div>

            <Button
              onClick={() => broadcastMutation.mutate()}
              disabled={broadcastMutation.isPending || !templateName.trim() || !phones.trim()}
              className="w-full sm:w-auto"
            >
              <Send className="mr-2 h-4 w-4" />
              {broadcastMutation.isPending ? 'Sending...' : 'Send Broadcast'}
            </Button>
          </CardContent>
        </Card>

        {/* Broadcast History */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Broadcast History (This Session)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium text-sm">{entry.templateName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.sentAt).toLocaleString()} — {entry.targetCount} targets
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="default">{entry.queued} queued</Badge>
                      {entry.skipped > 0 && (
                        <Badge variant="secondary">{entry.skipped} skipped</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
