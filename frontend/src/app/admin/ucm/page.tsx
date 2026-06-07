'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Database,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Link2,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { CatalogSettings, RemoteCatalog, UcmDashboardSnapshot, UcmSyncSummary } from '@/types';
import { useToast } from '@/components/ui/use-toast';

export default function UcmPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [config, setConfig] = useState<CatalogSettings>({
    syncMode: 'dry_run',
    autoSyncEnabled: true,
    selectedCatalogId: '',
    selectedCatalogName: '',
    lastSyncAt: '',
    lastSyncStatus: 'idle',
    lastSyncMessage: '',
  });
  const [lastSyncResult, setLastSyncResult] = useState<UcmSyncSummary | null>(null);

  const { data: dashboard, isLoading, isFetching } = useQuery<UcmDashboardSnapshot>({
    queryKey: ['ucm-dashboard'],
    queryFn: () => api.getUcmDashboard(),
  });

  useEffect(() => {
    if (dashboard?.config) {
      setConfig(dashboard.config);
    }
  }, [dashboard]);

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<CatalogSettings>) => api.updateUcmConfig(updates),
    onSuccess: (data) => {
      setConfig(data);
      queryClient.invalidateQueries({ queryKey: ['ucm-dashboard'] });
      toast({ title: 'UCM catalog saved', description: 'The master catalog settings were updated.' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Could not save UCM settings.',
        variant: 'destructive',
      });
    },
  });

  const pullMutation = useMutation({
    mutationFn: () => api.pullUcmCatalog(),
    onSuccess: (result) => {
      setLastSyncResult(result);
      queryClient.invalidateQueries({ queryKey: ['ucm-dashboard'] });
      toast({
        title: 'Catalog pulled',
        description: `${result.syncedProducts}/${result.totalProducts} products imported from Commerce Manager.`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Pull failed',
        description: error instanceof Error ? error.message : 'Unable to pull catalog right now.',
        variant: 'destructive',
      });
    },
  });

  const pushMutation = useMutation({
    mutationFn: () => api.pushUcmCatalog(),
    onSuccess: (result) => {
      setLastSyncResult(result);
      queryClient.invalidateQueries({ queryKey: ['ucm-dashboard'] });
      toast({
        title: result.mode === 'dry_run' ? 'Dry run completed' : 'Catalog pushed',
        description: `${result.syncedProducts}/${result.totalProducts} products processed.`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Push failed',
        description: error instanceof Error ? error.message : 'Unable to push catalog right now.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (catalogId: string) => api.deleteUcmCatalog(catalogId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ucm-dashboard'] });
      toast({ title: 'Catalog deleted', description: 'The selected catalog was removed from Commerce Manager.' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unable to delete catalog.',
        variant: 'destructive',
      });
    },
  });

  const statusTone = useMemo(() => {
    switch (config.lastSyncStatus) {
      case 'success':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'failed':
        return 'bg-red-100 text-red-900 border-red-300';
      case 'dry_run':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'syncing':
        return 'bg-sky-100 text-sky-900 border-sky-300';
      default:
        return 'bg-slate-100 text-slate-900 border-slate-300';
    }
  }, [config.lastSyncStatus]);

  const handleSave = () => {
    saveMutation.mutate(config);
  };

  const handleSelectCatalog = (catalog: RemoteCatalog) => {
    const next = {
      ...config,
      selectedCatalogId: catalog.id,
      selectedCatalogName: catalog.name,
    };
    setConfig(next);
    saveMutation.mutate(next);
  };

  const handleDeleteCatalog = (catalog: RemoteCatalog) => {
    if (confirm(`Delete catalog \"${catalog.name}\" (${catalog.id})?`)) {
      deleteMutation.mutate(catalog.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const catalogs = dashboard?.catalogs || [];

  return (
    <div>
      <Header
        title="UCM Module"
        description="Universal Catalog Management for the dashboard, chatbot, and WhatsApp profile catalog"
      />

      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-2xl">
            <CardHeader>
              <CardDescription className="text-white/70">Master source</CardDescription>
              <CardTitle className="text-2xl">Dashboard Products</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-white/80">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-emerald-300" />
                One local product catalog in MongoDB drives WhatsApp and chatbot sync.
              </div>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-sky-300" />
                {dashboard?.productCount ?? 0} products in the master catalog.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Current sync mode</CardDescription>
              <CardTitle className="flex items-center gap-2">
                <Badge className={statusTone}>{config.syncMode === 'dry_run' ? 'Dry run' : 'Meta sync'}</Badge>
                <span className="text-base font-normal text-muted-foreground">{config.autoSyncEnabled ? 'Auto sync on' : 'Auto sync off'}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Selected catalog: <span className="font-medium text-foreground">{config.selectedCatalogName || 'None selected'}</span></p>
              <p>Catalog ID: <span className="font-mono text-xs">{config.selectedCatalogId || '—'}</span></p>
              <p>Last sync: <span className="font-medium text-foreground">{config.lastSyncAt ? new Date(config.lastSyncAt).toLocaleString() : 'Never'}</span></p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Sync status</CardDescription>
              <CardTitle className="flex items-center gap-2">
                {config.lastSyncStatus === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : config.lastSyncStatus === 'failed' ? (
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                ) : (
                  <Sparkles className="h-5 w-5 text-slate-500" />
                )}
                <span className="capitalize">{config.lastSyncStatus.replace('_', ' ')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{config.lastSyncMessage || 'No sync has been run yet.'}</p>
              {lastSyncResult && (
                <p>
                  Latest run: {lastSyncResult.syncedProducts}/{lastSyncResult.totalProducts} processed in {lastSyncResult.mode} mode.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Master catalog settings</CardTitle>
            <CardDescription>
              Choose one catalog, keep the others deleted or disconnected, and sync from the dashboard to WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sync-mode">Sync mode</Label>
              <select
                id="sync-mode"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={config.syncMode}
                onChange={(e) => setConfig({ ...config, syncMode: e.target.value as CatalogSettings['syncMode'] })}
              >
                <option value="dry_run">Dry run</option>
                <option value="meta">Meta sync</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Dry run keeps tests safe in sandbox. Meta sync pushes to the selected live catalog.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalog-id">Selected catalog ID</Label>
              <Input
                id="catalog-id"
                value={config.selectedCatalogId}
                onChange={(e) => setConfig({ ...config, selectedCatalogId: e.target.value })}
                placeholder="Select one catalog"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="catalog-name">Selected catalog name</Label>
              <Input
                id="catalog-name"
                value={config.selectedCatalogName}
                onChange={(e) => setConfig({ ...config, selectedCatalogName: e.target.value })}
                placeholder="Commerce Manager catalog name"
              />
            </div>

            <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
              <input
                type="checkbox"
                checked={config.autoSyncEnabled}
                onChange={(e) => setConfig({ ...config, autoSyncEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              Enable automatic sync after product edits and stock changes
            </label>

            <div className="flex flex-wrap gap-3 md:col-span-2">
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {saveMutation.isPending ? 'Saving...' : 'Save UCM settings'}
              </Button>
              <Button variant="outline" onClick={() => pullMutation.mutate()} disabled={pullMutation.isPending || isFetching}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {pullMutation.isPending ? 'Pulling...' : 'Pull catalog'}
              </Button>
              <Button variant="outline" onClick={() => pushMutation.mutate()} disabled={pushMutation.isPending || isFetching}>
                <Sparkles className="mr-2 h-4 w-4" />
                {pushMutation.isPending ? 'Pushing...' : 'Push catalog'}
              </Button>
              <Button
                variant="outline"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['ucm-dashboard'] })}
                disabled={isFetching}
              >
                Refresh status
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Discovered catalogs</CardTitle>
              <CardDescription>
                The backend reads the business-owned catalogs from Meta. Select one and delete the extras.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {catalogs.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No remote catalogs were found. In sandbox this is expected until a live Meta catalog is connected.
                </div>
              ) : (
                catalogs.map((catalog) => {
                  const isSelected = catalog.id === config.selectedCatalogId;
                  return (
                    <div key={catalog.id} className={cn('rounded-xl border p-4', isSelected && 'border-emerald-400 bg-emerald-50')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{catalog.name}</h3>
                            {isSelected && <Badge className="bg-emerald-600 text-white">Selected</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">ID: {catalog.id}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Products: {catalog.product_count ?? 0}</p>
                          {catalog.vertical && <p className="mt-1 text-xs text-muted-foreground">Vertical: {catalog.vertical}</p>}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleSelectCatalog(catalog)}>
                            <Link2 className="mr-2 h-4 w-4" />
                            Use this catalog
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleDeleteCatalog(catalog)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Testing notes</CardTitle>
              <CardDescription>
                How to verify the sync safely before touching production.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-foreground">Sandbox behavior</p>
                <p className="mt-2">
                  The 360Dialog sandbox number has no active catalog on the profile, so the backend runs in dry-run mode unless a real Meta catalog access token and catalog ID are supplied.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-foreground">What gets synced</p>
                <p className="mt-2">
                  Product data stays in the dashboard database. UCM mirrors the chosen catalog out to Meta and the chatbot continues to read from the same master data.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-foreground">Required live inputs</p>
                <p className="mt-2">
                  To enable real catalog writes, the backend still needs a Meta catalog access token and the one catalog ID that should remain connected.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}