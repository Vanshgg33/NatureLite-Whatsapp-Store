'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Lock, RotateCcw, AlertTriangle, FlaskConical, Bot } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

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

  const [mockDataEnabled, setMockDataEnabled] = useState(false);
  const [chatbotEnabled, setChatbotEnabled] = useState(false);

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
      if (settings.mockData) {
        setMockDataEnabled(!!(settings.mockData as { enabled?: boolean }).enabled);
      }
      if (settings.chatbot) {
        setChatbotEnabled((settings.chatbot as { enabled?: boolean }).enabled !== false);
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

  const mockDataMutation = useMutation({
    mutationFn: (enabled: boolean) => api.updateSettings('mockData', { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['revenue-chart'] });
      queryClient.invalidateQueries({ queryKey: ['orders-by-status'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
    },
  });

  const chatbotMutation = useMutation({
    mutationFn: (enabled: boolean) => api.updateSettings('chatbot', { enabled }),
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
        {/* ── Chatbot ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-emerald-500" />
              WhatsApp Chatbot
            </CardTitle>
            <CardDescription>
              Enable or disable the chatbot. When off, incoming WhatsApp messages are silently ignored — the website and admin panel continue working normally.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-xl border px-5 py-4">
              <div>
                <p className="text-sm font-semibold">Chatbot active</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Turn this off to pause all automated WhatsApp replies
                </p>
              </div>
              <button
                role="switch"
                aria-checked={chatbotEnabled}
                disabled={chatbotMutation.isPending}
                onClick={() => {
                  const next = !chatbotEnabled;
                  setChatbotEnabled(next);
                  chatbotMutation.mutate(next);
                }}
                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: chatbotEnabled ? '#10b981' : '#e2e8f0' }}
              >
                <span
                  className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200"
                  style={{ transform: chatbotEnabled ? 'translateX(20px)' : 'translateX(0px)' }}
                />
              </button>
            </div>
            {!chatbotEnabled && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                Chatbot is <strong>OFF</strong> — all incoming WhatsApp messages are being dropped. Turn this back on when you are ready to serve customers again.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Mock Data ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-violet-500" />
              Mock Data
            </CardTitle>
            <CardDescription>
              Show demo analytics data on the dashboard. Useful while setting up the store before real orders come in.
              Orders, products, and customers are never affected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-xl border px-5 py-4">
              <div>
                <p className="text-sm font-semibold">Enable mock analytics</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Dashboard stats and revenue chart will show sample data
                </p>
              </div>
              <button
                role="switch"
                aria-checked={mockDataEnabled}
                disabled={mockDataMutation.isPending}
                onClick={() => {
                  const next = !mockDataEnabled;
                  setMockDataEnabled(next);
                  mockDataMutation.mutate(next);
                }}
                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: mockDataEnabled ? '#7c3aed' : '#e2e8f0' }}
              >
                <span
                  className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200"
                  style={{ transform: mockDataEnabled ? 'translateX(20px)' : 'translateX(0px)' }}
                />
              </button>
            </div>
            {mockDataEnabled && (
              <p className="mt-3 text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded-lg px-4 py-2.5">
                Mock mode is <strong>ON</strong> — dashboard shows sample data. Turn this off when your store goes live.
              </p>
            )}
          </CardContent>
        </Card>

        <ChangePasswordCard />
        <ResetMetricsCard />
      </div>
    </div>
  );
}

function ResetMetricsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmText, setConfirmText] = useState('');
  const [activeReset, setActiveReset] = useState<'dashboard' | 'customers' | null>(null);

  const dashboardMutation = useMutation({
    mutationFn: () => api.resetDashboardMetrics(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast({ title: 'Dashboard metrics reset', description: `Deleted ${data.deletedSnapshots} snapshots.` });
      setActiveReset(null);
      setConfirmText('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast({ title: 'Reset failed', description: msg || 'Check that the backend is running and try again.', variant: 'destructive' });
    },
  });

  const customerMutation = useMutation({
    mutationFn: () => api.resetCustomerMetrics(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast({
        title: 'Customer metrics reset',
        description: `${data.usersReset} customers and ${data.productsReset} products zeroed.`,
      });
      setActiveReset(null);
      setConfirmText('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast({ title: 'Reset failed', description: msg || 'Check that the backend is running and try again.', variant: 'destructive' });
    },
  });

  const CONFIRM_WORD = 'RESET';
  const confirmed = confirmText.trim() === CONFIRM_WORD;
  const isPending = dashboardMutation.isPending || customerMutation.isPending;

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-600">
          <RotateCcw className="h-5 w-5" />
          Reset Metrics
        </CardTitle>
        <CardDescription>
          Zero out analytics data without deleting any customers, orders, or products.
          This is useful when starting fresh after a test period.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Action buttons */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-red-100 bg-red-50/50 p-4 space-y-2">
            <p className="text-sm font-semibold text-red-700">Dashboard Metrics</p>
            <p className="text-xs text-muted-foreground">
              Deletes all analytics snapshots — graphs and daily/weekly/monthly reports go to zero.
              Orders and customers are untouched.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="border-red-300 text-red-600 hover:bg-red-50 w-full"
              onClick={() => { setActiveReset('dashboard'); setConfirmText(''); }}
              disabled={isPending}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Reset Dashboard Metrics
            </Button>
          </div>

          <div className="rounded-lg border border-red-100 bg-red-50/50 p-4 space-y-2">
            <p className="text-sm font-semibold text-red-700">Customer &amp; Product Metrics</p>
            <p className="text-xs text-muted-foreground">
              Sets totalOrders, totalSpent on all customers to 0. Sets totalSold and viewCount
              on all products to 0. Does not delete any customer or product.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="border-red-300 text-red-600 hover:bg-red-50 w-full"
              onClick={() => { setActiveReset('customers'); setConfirmText(''); }}
              disabled={isPending}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Reset Customer Metrics
            </Button>
          </div>
        </div>

        {/* Confirmation area */}
        {activeReset && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 space-y-3">
            <div className="flex items-start gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm font-medium">
                You are about to reset{' '}
                {activeReset === 'dashboard' ? 'all dashboard analytics snapshots' : 'all customer & product metrics'}.
                This cannot be undone. Type <span className="font-bold font-mono">RESET</span> to confirm.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Type RESET to confirm"
                className="font-mono border-red-300 focus-visible:ring-red-400"
              />
              <Button
                variant="destructive"
                disabled={!confirmed || isPending}
                onClick={() => {
                  if (activeReset === 'dashboard') dashboardMutation.mutate();
                  else customerMutation.mutate();
                }}
              >
                {isPending ? 'Resetting…' : 'Confirm'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setActiveReset(null); setConfirmText(''); }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast({ title: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast({
        title: 'Failed to change password',
        description: msg || 'Please check your current password',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    mutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Change Password
        </CardTitle>
        <CardDescription>
          Update your admin account password. Must include uppercase, lowercase, number, and special character.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Current Password</label>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">New Password</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Confirm New Password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={mutation.isPending || !currentPassword || !newPassword || !confirmPassword}
        >
          <Lock className="mr-2 h-4 w-4" />
          {mutation.isPending ? 'Changing...' : 'Change Password'}
        </Button>
      </CardContent>
    </Card>
  );
}
