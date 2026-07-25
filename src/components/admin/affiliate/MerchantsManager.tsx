/**
 * Merchants tab — every marketplace vendor with its sync state, listing
 * stats, link health, clicks/commission and affiliate configuration in one
 * table (admin_merchant_overview RPC). Writes go through the vendor-hub
 * RPC path (useMarketplaceMerchants — admin_upsert/delete RPCs, the table
 * itself stays write-locked); "Sync now" targets one merchant by id.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { useAffiliateLinks } from '@/hooks/useAffiliateLinks';
import { useMarketplaceMerchants } from '@/hooks/useMarketplaceMerchants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Stat } from './Stat';
import { MerchantDrawer } from './MerchantDrawer';
import type { MerchantOverviewRow } from './merchantTypes';

// Whitelist enforced by admin_upsert_marketplace_merchant.
const PROVIDERS = ['shopify-public', 'woocommerce-public', 'etsy', 'crawl'];
const NO_PARTNER = 'none';

const emptyForm = {
  provider: 'shopify-public',
  slug: '',
  display_name: '',
  shop_domain: '',
  api_key_env: '',
  awin_advertiser_id: '',
  affiliate_partner_id: NO_PARTNER,
  config: '{}',
  is_enabled: true,
};

export function MerchantsManager({ days }: { days: string }) {
  const queryClient = useQueryClient();
  const { partners } = useAffiliateLinks();
  const { upsert, remove, sync } = useMarketplaceMerchants();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [drawerMerchant, setDrawerMerchant] = useState<MerchantOverviewRow | null>(null);

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['merchant-overview', days],
    queryFn: async (): Promise<MerchantOverviewRow[]> => {
      const { data, error } = await untypedSupabase.rpc('admin_merchant_overview', { p_days: Number(days) });
      if (error) throw error;
      return (data ?? []) as MerchantOverviewRow[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['merchant-overview'] });

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (m: MerchantOverviewRow) => {
    setEditId(m.merchant_id);
    void untypedSupabase
      .from('marketplace_merchants')
      .select('api_key_env, config')
      .eq('id', m.merchant_id)
      .single()
      .then(({ data }: { data: { api_key_env: string | null; config: unknown } | null }) => {
        setForm({
          provider: m.provider,
          slug: m.slug,
          display_name: m.display_name,
          shop_domain: m.shop_domain ?? '',
          api_key_env: data?.api_key_env ?? '',
          awin_advertiser_id: m.awin_advertiser_id ?? '',
          affiliate_partner_id: m.affiliate_partner_id ?? NO_PARTNER,
          config: JSON.stringify(data?.config ?? {}, null, 2),
          is_enabled: m.is_enabled,
        });
        setDialogOpen(true);
      });
  };

  const handleSave = async () => {
    if (!form.slug.trim() || !form.display_name.trim()) {
      toast.error('Slug and display name are required');
      return;
    }
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(form.config || '{}');
    } catch {
      toast.error('Config must be valid JSON');
      return;
    }
    setSaving(true);
    try {
      await upsert.mutateAsync({
        ...(editId ? { id: editId } : { provider: form.provider, slug: form.slug.trim() }),
        display_name: form.display_name.trim(),
        shop_domain: form.shop_domain.trim() || null,
        api_key_env: form.api_key_env.trim() || null,
        awin_advertiser_id: form.awin_advertiser_id.trim() || null,
        affiliate_partner_id: form.affiliate_partner_id === NO_PARTNER ? null : form.affiliate_partner_id,
        config,
        is_enabled: form.is_enabled,
      });
      toast.success(editId ? 'Merchant updated' : 'Merchant created');
      setDialogOpen(false);
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (m: MerchantOverviewRow, enabled: boolean) => {
    try {
      await upsert.mutateAsync({ id: m.merchant_id, is_enabled: enabled });
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleDelete = async (m: MerchantOverviewRow) => {
    if (m.listings_total > 0) {
      toast.error('Merchant has listings — disable it instead of deleting.');
      return;
    }
    if (!confirm(`Delete merchant "${m.display_name}"?`)) return;
    try {
      await remove.mutateAsync(m.merchant_id);
      toast.success('Merchant deleted');
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleSync = async (m: MerchantOverviewRow) => {
    setSyncing(m.merchant_id);
    try {
      const result = await sync.mutateAsync({ id: m.merchant_id });
      if (result.status === 'ok') toast.success(`Synced ${m.display_name}: ${result.items ?? 0} items`);
      else if (result.status === 'skipped') toast.info(`${m.display_name}: no public feed to sync`);
      else toast.error(`Sync failed: ${result.error ?? 'unknown'}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(null);
      invalidate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }
  if (error) {
    return <p className="text-13 text-destructive">Failed to load merchants: {(error as Error).message}</p>;
  }

  const merchants = rows ?? [];
  const totals = merchants.reduce(
    (acc, m) => ({
      merchants: acc.merchants + 1,
      enabled: acc.enabled + (m.is_enabled ? 1 : 0),
      listings: acc.listings + Number(m.listings_active),
      clicks: acc.clicks + Number(m.clicks),
      commission: acc.commission + Number(m.commission_usd),
    }),
    { merchants: 0, enabled: 0, listings: 0, clicks: 0, commission: 0 },
  );

  return (
    <div>
      <div className="mb-8 grid grid-cols-4 gap-4">
        <Stat label="Merchants" value={`${totals.enabled}/${totals.merchants}`} hint="enabled / total" />
        <Stat label="Active listings" value={totals.listings.toLocaleString()} />
        <Stat label="Clicks" value={totals.clicks.toLocaleString()} hint={`last ${days} days`} />
        <Stat label="Commission" value={`$${totals.commission.toFixed(2)}`} hint={`last ${days} days`} />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-15 font-semibold">All vendors</h2>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Add merchant
        </Button>
      </div>

      {merchants.length === 0 ? (
        <p className="text-13 text-muted-foreground">No merchants registered yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merchant</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead className="text-right">Listings</TableHead>
              <TableHead className="text-right">Broken links</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead>Last sync</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {merchants.map((m) => (
              <TableRow
                key={m.merchant_id}
                className="cursor-pointer"
                onClick={() => setDrawerMerchant(m)}
              >
                <TableCell>
                  <span className="font-medium">{m.display_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{m.shop_domain ?? m.slug}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">{m.provider}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(m.listings_active).toLocaleString()}
                  <span className="text-muted-foreground">/{Number(m.listings_total).toLocaleString()}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(m.link_broken) + Number(m.link_timeout) > 0 ? (
                    <Badge variant="outline">{Number(m.link_broken) + Number(m.link_timeout)}</Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{Number(m.clicks).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(m.commission_usd) > 0 ? `$${Number(m.commission_usd).toFixed(2)}` : '—'}
                </TableCell>
                <TableCell>
                  {m.last_sync_at ? (
                    <span className="text-xs">
                      <Badge variant="outline" className={m.last_sync_status === 'ok' ? '' : 'text-destructive'}>
                        {m.last_sync_status === 'ok' ? `ok · ${m.last_sync_items ?? 0}` : 'error'}
                      </Badge>{' '}
                      <span className="text-muted-foreground">
                        {new Date(m.last_sync_at).toLocaleDateString()}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">never</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {m.partner_name ?? (m.awin_advertiser_id ? `awin:${m.awin_advertiser_id}` : '—')}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <Switch
                      checked={m.is_enabled}
                      onCheckedChange={(v) => handleToggle(m, v)}
                      aria-label={`${m.display_name} enabled`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSync(m)}
                      disabled={syncing === m.merchant_id}
                      aria-label="Sync now"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncing === m.merchant_id ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(m)} aria-label="Edit">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(m)}
                      disabled={m.listings_total > 0}
                      aria-label="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <MerchantDrawer merchant={drawerMerchant} days={days} onClose={() => setDrawerMerchant(null)} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit merchant' : 'Add merchant'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="m-provider">Provider</Label>
                <Select value={form.provider} onValueChange={(v) => setForm((f) => ({ ...f, provider: v }))} disabled={!!editId}>
                  <SelectTrigger id="m-provider"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="m-slug">Slug *</Label>
                <Input
                  id="m-slug"
                  value={form.slug}
                  disabled={!!editId}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="ohmyfantasy"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-name">Display name *</Label>
              <Input
                id="m-name"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-domain">Shop domain</Label>
              <Input
                id="m-domain"
                value={form.shop_domain}
                onChange={(e) => setForm((f) => ({ ...f, shop_domain: e.target.value }))}
                placeholder="shop.example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="m-awin">Awin advertiser ID</Label>
                <Input
                  id="m-awin"
                  value={form.awin_advertiser_id}
                  onChange={(e) => setForm((f) => ({ ...f, awin_advertiser_id: e.target.value }))}
                  placeholder="12345"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="m-keyenv">API key env name</Label>
                <Input
                  id="m-keyenv"
                  value={form.api_key_env}
                  onChange={(e) => setForm((f) => ({ ...f, api_key_env: e.target.value }))}
                  placeholder="ETSY_API_KEY"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-partner">Affiliate partner</Label>
              <Select
                value={form.affiliate_partner_id}
                onValueChange={(v) => setForm((f) => ({ ...f, affiliate_partner_id: v }))}
              >
                <SelectTrigger id="m-partner"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARTNER}>None</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.partner_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-config">Config (JSON)</Label>
              <Textarea
                id="m-config"
                value={form.config}
                onChange={(e) => setForm((f) => ({ ...f, config: e.target.value }))}
                rows={4}
                placeholder='{"currency": "EUR"}'
              />
              <p className="text-xs text-muted-foreground">
                Passed to the source function. Secrets stay in env — reference the env var name above, never a key.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="m-enabled"
                checked={form.is_enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_enabled: v }))}
              />
              <Label htmlFor="m-enabled">Enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
