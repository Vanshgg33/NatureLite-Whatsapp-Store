'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [storeSettings, setStoreSettings] = useState({
    name: '',
    description: '',
    currency: 'INR',
    minOrderAmount: 0,
    freeShippingThreshold: 500,
    defaultShippingCharge: 50,
  });

  const [whatsappSettings, setWhatsappSettings] = useState({
    welcomeMessage: '',
    abandonedCartReminderEnabled: true,
    abandonedCartReminderDelayMinutes: 60,
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });

  useEffect(() => {
    if (settings) {
      if (settings.store) {
        setStoreSettings(settings.store as typeof storeSettings);
      }
      if (settings.whatsapp) {
        setWhatsappSettings(settings.whatsapp as typeof whatsappSettings);
      }
    }
  }, [settings]);

  const storeMutation = useMutation({
    mutationFn: (data: typeof storeSettings) => api.updateSettings('store', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const whatsappMutation = useMutation({
    mutationFn: (data: typeof whatsappSettings) => api.updateSettings('whatsapp', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Settings" description="Configure your store settings" />

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Store Settings</CardTitle>
            <CardDescription>General store configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Store Name</label>
                <Input
                  value={storeSettings.name}
                  onChange={(e) =>
                    setStoreSettings({ ...storeSettings, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <Input
                  value={storeSettings.currency}
                  onChange={(e) =>
                    setStoreSettings({ ...storeSettings, currency: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Store Description</label>
              <Input
                value={storeSettings.description}
                onChange={(e) =>
                  setStoreSettings({ ...storeSettings, description: e.target.value })
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Min Order Amount</label>
                <Input
                  type="number"
                  value={storeSettings.minOrderAmount}
                  onChange={(e) =>
                    setStoreSettings({
                      ...storeSettings,
                      minOrderAmount: parseInt(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Free Shipping Threshold</label>
                <Input
                  type="number"
                  value={storeSettings.freeShippingThreshold}
                  onChange={(e) =>
                    setStoreSettings({
                      ...storeSettings,
                      freeShippingThreshold: parseInt(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Default Shipping Charge</label>
                <Input
                  type="number"
                  value={storeSettings.defaultShippingCharge}
                  onChange={(e) =>
                    setStoreSettings({
                      ...storeSettings,
                      defaultShippingCharge: parseInt(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <Button
              onClick={() => storeMutation.mutate(storeSettings)}
              disabled={storeMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              {storeMutation.isPending ? 'Saving...' : 'Save Store Settings'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>WhatsApp Settings</CardTitle>
            <CardDescription>Configure WhatsApp bot behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Welcome Message</label>
              <Input
                value={whatsappSettings.welcomeMessage}
                onChange={(e) =>
                  setWhatsappSettings({ ...whatsappSettings, welcomeMessage: e.target.value })
                }
                placeholder="Welcome to our store!"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={whatsappSettings.abandonedCartReminderEnabled}
                    onChange={(e) =>
                      setWhatsappSettings({
                        ...whatsappSettings,
                        abandonedCartReminderEnabled: e.target.checked,
                      })
                    }
                    className="rounded"
                  />
                  Enable Abandoned Cart Reminders
                </label>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Reminder Delay (minutes)</label>
                <Input
                  type="number"
                  value={whatsappSettings.abandonedCartReminderDelayMinutes}
                  onChange={(e) =>
                    setWhatsappSettings({
                      ...whatsappSettings,
                      abandonedCartReminderDelayMinutes: parseInt(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <Button
              onClick={() => whatsappMutation.mutate(whatsappSettings)}
              disabled={whatsappMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              {whatsappMutation.isPending ? 'Saving...' : 'Save WhatsApp Settings'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
