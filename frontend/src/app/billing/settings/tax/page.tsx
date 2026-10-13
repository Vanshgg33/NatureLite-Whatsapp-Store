'use client'
import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageTransition, Skeleton } from '@/components/motion'
import { formatINR } from '@/lib/billing/utils/formatINR'

interface TaxRule {
  _id: string; scope: string; hsnPrefix?: string; gstRate: number; cessRate: number
  taxability: string; effectiveFrom: string; effectiveTo: string | null; status: string; reason: string
}
interface Param { _id: string; key: string; value: number | string | boolean; unit: string; effectiveFrom: string }
interface ChangeLog { _id: string; entity: string; action: string; reason: string; userId: string; at: string }

async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}
async function fetchRules()    { return fetchJSON<TaxRule[]>('/api/settings/tax/rules') }
async function fetchParams()   { return fetchJSON<Param[]>('/api/settings/tax/params') }
async function fetchChangelog(){ return fetchJSON<ChangeLog[]>('/api/settings/tax/changelog') }

const STATUS_COLOR: Record<string, string> = {
  active:    'bg-green-100 text-green-800',
  scheduled: 'bg-blue-100 text-blue-800',
  expired:   'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-800',
}

export default function TaxSettingsPage() {
  const [rules, setRules]   = useState<TaxRule[] | null>(null)
  const [params, setParams] = useState<Param[] | null>(null)
  const [changelog, setLog] = useState<ChangeLog[] | null>(null)

  useEffect(() => {
    fetchRules().then(setRules).catch(() => setRules([]))
    fetchParams().then(setParams).catch(() => setParams([]))
    fetchChangelog().then(setLog).catch(() => setLog([]))
  }, [])

  return (
    <PageTransition>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="font-serif italic text-3xl text-[var(--billing-brand-900)] mb-6">
          Tax &amp; Compliance Settings
        </h1>
        <Tabs defaultValue="rates">
          <TabsList className="mb-4">
            <TabsTrigger value="rates">GST Rates</TabsTrigger>
            <TabsTrigger value="limits">Limits &amp; Thresholds</TabsTrigger>
            <TabsTrigger value="history">Change History</TabsTrigger>
          </TabsList>

          <TabsContent value="rates">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-muted-foreground">All rate rules, effective-dated. Admin only to change.</p>
              <Button size="sm" onClick={() => alert('Rate change drawer — Phase 1 Tax console')}>
                + Schedule rate change
              </Button>
            </div>
            {rules === null ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--billing-brand-50)]">
                    <tr>
                      {['Scope','HSN Prefix','Rate','Cess','Taxability','Effective From','Status'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-[var(--billing-ink)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rules.map(r => (
                      <tr key={r._id} className="hover:bg-[var(--billing-brand-50)]/50">
                        <td className="px-3 py-2 capitalize">{r.scope}</td>
                        <td className="px-3 py-2 font-mono">{r.hsnPrefix ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums">{r.gstRate}%</td>
                        <td className="px-3 py-2 tabular-nums">{r.cessRate}%</td>
                        <td className="px-3 py-2">{r.taxability}</td>
                        <td className="px-3 py-2 tabular-nums">{new Date(r.effectiveFrom).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] ?? ''}`}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="limits">
            {params === null ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--billing-brand-50)]">
                    <tr>
                      {['Parameter','Value','Unit','Effective From'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {params.map(p => (
                      <tr key={p._id} className="hover:bg-[var(--billing-brand-50)]/50">
                        <td className="px-3 py-2 font-mono text-xs">{p.key}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {p.unit === 'paise' ? formatINR(Number(p.value)) : String(p.value)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{p.unit}</td>
                        <td className="px-3 py-2 tabular-nums">{new Date(p.effectiveFrom).toLocaleDateString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            {changelog === null ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <div className="space-y-2">
                {changelog.map(c => (
                  <div key={c._id} className="flex items-start gap-3 p-3 rounded-lg border text-sm">
                    <Badge variant="outline" className="shrink-0">{c.action}</Badge>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{c.entity}</span>
                      <span className="text-muted-foreground ml-2">{c.reason}</span>
                    </div>
                    <span className="text-muted-foreground text-xs shrink-0">
                      {new Date(c.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </span>
                  </div>
                ))}
                {changelog.length === 0 && (
                  <p className="text-muted-foreground text-sm py-8 text-center">No changes logged yet.</p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  )
}
