'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Megaphone, Phone, Send, Users } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

const parseList = (value: string) =>
  value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const parsePhones = (value: string) => {
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalid = 0;

  for (const raw of parseList(value)) {
    const phone = raw.replace(/[^\d]/g, '');
    if (phone.length < 10) {
      invalid += 1;
      continue;
    }
    if (!seen.has(phone)) {
      seen.add(phone);
      valid.push(phone);
    }
  }

  return { valid, invalid };
};

export default function CampaignsPage() {
  const [templateName, setTemplateName] = useState('');
  const [languageCode, setLanguageCode] = useState('en');
  const [headerParams, setHeaderParams] = useState('');
  const [bodyParams, setBodyParams] = useState('');
  const [buttonParams, setButtonParams] = useState('');
  const [phones, setPhones] = useState('');
  const [history, setHistory] = useState<BroadcastResult[]>([]);
  const { toast } = useToast();

  const recipients = useMemo(() => parsePhones(phones), [phones]);
  const bodyParamList = useMemo(() => parseList(bodyParams), [bodyParams]);

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const template = templateName.trim();
      if (!template) throw new Error('Template name is required');
      if (recipients.valid.length === 0) throw new Error('Add at least one valid phone number');

      return api.sendBroadcast(recipients.valid, template, bodyParamList, {
        languageCode: languageCode.trim() || 'en',
        headerParams: parseList(headerParams),
        bodyParams: bodyParamList,
        buttonParams: parseList(buttonParams),
      });
    },
    onSuccess: (data) => {
      setHistory((prev) => [
        {
          ...data,
          sentAt: new Date().toISOString(),
          templateName: templateName.trim(),
          targetCount: recipients.valid.length,
        },
        ...prev,
      ]);
      toast({
        title: 'Broadcast processed',
        description: `${data.queued} queued, ${data.skipped} skipped`,
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
      <Header title="Campaigns" description="Send approved WhatsApp template broadcasts" />

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              New Campaign
            </CardTitle>
            <CardDescription>
              Use an approved WhatsApp template and send it to selected customers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[1fr_140px]">
              <div className="space-y-2">
                <label className="text-sm font-medium">Template name</label>
                <Input
                  placeholder="promo_offer"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Must exactly match the approved template name in WhatsApp Manager.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Language</label>
                <Input
                  placeholder="en"
                  value={languageCode}
                  onChange={(e) => setLanguageCode(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Example: en, en_US, hi</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Header values</label>
                <Textarea
                  placeholder="One value per line"
                  value={headerParams}
                  onChange={(e) => setHeaderParams(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Body values</label>
                <Textarea
                  placeholder={"Customer name\nOffer amount\nExpiry date"}
                  value={bodyParams}
                  onChange={(e) => setBodyParams(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Button values</label>
                <Textarea
                  placeholder="Dynamic URL or coupon values"
                  value={buttonParams}
                  onChange={(e) => setButtonParams(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Recipients
              </label>
              <Textarea
                className="min-h-[150px]"
                placeholder={"One phone number per line or comma-separated\n919876543210\n919876543211"}
                value={phones}
                onChange={(e) => setPhones(e.target.value)}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Include country code. Duplicate numbers are sent only once.
                </p>
                <div className="flex gap-2">
                  {recipients.invalid > 0 && (
                    <Badge variant="secondary">{recipients.invalid} invalid</Badge>
                  )}
                  <Badge variant="outline">
                    <Users className="mr-1 h-3 w-3" />
                    {recipients.valid.length} recipients
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => broadcastMutation.mutate()}
                disabled={broadcastMutation.isPending || !templateName.trim() || recipients.valid.length === 0}
              >
                <Send className="mr-2 h-4 w-4" />
                {broadcastMutation.isPending ? 'Sending...' : 'Send Campaign'}
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                Uses WhatsApp template messaging
              </div>
            </div>
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign History (This Session)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">{entry.templateName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.sentAt).toLocaleString()} - {entry.targetCount} targets
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="default">{entry.queued} queued</Badge>
                      {entry.skipped > 0 && <Badge variant="secondary">{entry.skipped} skipped</Badge>}
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
