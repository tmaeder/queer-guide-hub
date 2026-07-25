import { useState } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, Loader2, Store } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useMarketplaceMerchants,
  useAffiliatePartnerOptions,
  useOrganizationOptions,
  type MerchantRow,
} from '@/hooks/useMarketplaceMerchants';
import { toast } from 'sonner';

export const PROVIDERS = [
  { value: 'shopify-public', label: 'Shopify (public feed)' },
  { value: 'woocommerce-public', label: 'WooCommerce (public feed)' },
  { value: 'etsy', label: 'Etsy' },
  { value: 'crawl', label: 'Crawl' },
] as const;

const SYNCABLE = new Set(['shopify-public', 'woocommerce-public']);
const NONE = '__none__';

const emptyForm = {
  provider: 'shopify-public',
  slug: '',
  display_name: '',
  shop_domain: '',
  currency: 'USD',
  affiliate_partner_id: NONE,
  organization_id: NONE,
  is_enabled: true,
};

export function MerchantsManager() {
  const { data: merchants, isLoading, error, upsert, remove, sync } = useMarketplaceMerchants();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const { data: partners } = useAffiliatePartnerOptions();
  const { data: orgs } = useOrganizationOptions();

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (m: MerchantRow) => {
    setEditId(m.id);
    setForm({
      provider: m.provider,
      slug: m.slug,
      display_name: m.display_name,
      shop_domain: m.shop_domain ?? '',
      currency: String(m.config?.currency ?? 'USD'),
      affiliate_partner_id: m.affiliate_partner_id ?? NONE,
      organization_id: m.organization_id ?? NONE,
      is_enabled: m.is_enabled,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.display_name.trim()) return toast.error('Display name is required');
    if (!editId && !/^[a-z0-9-]+$/.test(form.slug))
      return toast.error('Slug must be lowercase letters, digits, dashes');
    try {
      await upsert.mutateAsync({
        ...(editId ? { id: editId } : { provider: form.provider, slug: form.slug.trim() }),
        display_name: form.display_name.trim(),
        shop_domain: form.shop_domain.trim() || null,
        config: { currency: form.currency.trim().toUpperCase() || 'USD' },
        is_enabled: form.is_enabled,
        affiliate_partner_id: form.affiliate_partner_id === NONE ? null : form.affiliate_partner_id,
        organization_id: form.organization_id === NONE ? null : form.organization_id,
      });
      toast.success(editId ? 'Merchant updated' : 'Merchant created');
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleDelete = async (m: MerchantRow) => {
    if (!confirm(`Delete merchant "${m.display_name}"? Committed listings stay; only the sync-registry row is removed.`))
      return;
    try {
      await remove.mutateAsync(m.id);
      toast.success('Merchant deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleSync = async (m: MerchantRow) => {
    setSyncingId(m.id);
    try {
      const r = await sync.mutateAsync({ id: m.id });
      if (r.status === 'ok') toast.success(`Synced ${m.display_name}: ${r.items ?? 0} items (first page)`);
      else if (r.status === 'skipped') toast.info(`Skipped: ${r.reason}`);
      else toast.error(`Sync failed: ${r.error}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncingId(null);
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-medium">
          <Store size={24} />
          Merchants
          <span className="text-13 font-normal text-muted-foreground">
            {merchants?.length ?? 0} registered
          </span>
        </h2>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add Merchant
        </Button>
      </div>

      {(merchants ?? []).length === 0 ? (
        <div className="rounded-element border bg-card p-8 text-center">
          <p className="text-muted-foreground">No merchants yet.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merchant</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Last sync</TableHead>
              <TableHead>Partner / Org</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(merchants ?? []).map((m) => {
              const syncError = m.last_sync_status?.startsWith('error');
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.display_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {m.provider}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.shop_domain ?? '—'}</TableCell>
                  <TableCell>
                    {m.last_sync_at ? (
                      <span className={syncError ? 'text-destructive' : ''}>
                        {formatDistanceToNow(new Date(m.last_sync_at), { addSuffix: true })}
                        {syncError
                          ? ` · ${m.last_sync_status}`
                          : m.last_sync_items != null
                            ? ` · ${m.last_sync_items} items`
                            : ''}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">never</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {[m.affiliate_partners?.partner_name, m.organizations?.name]
                      .filter(Boolean)
                      .join(' / ') || '—'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.is_enabled}
                      aria-label={`${m.display_name} enabled`}
                      onCheckedChange={async (v) => {
                        try {
                          await upsert.mutateAsync({ id: m.id, is_enabled: v });
                          toast.success(v ? 'Enabled' : 'Disabled');
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Update failed');
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {SYNCABLE.has(m.provider) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={syncingId === m.id}
                          onClick={() => handleSync(m)}
                          title="Sync now (first page)"
                        >
                          {syncingId === m.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(m)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Merchant' : 'Add Merchant'}</DialogTitle>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-4">
            {!editId && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="provider">Provider *</Label>
                  <Select
                    value={form.provider}
                    onValueChange={(v) => setForm((f) => ({ ...f, provider: v }))}
                  >
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="slug">Slug *</Label>
                  <Input
                    id="slug"
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    placeholder="rainbow-depot"
                  />
                  <p className="text-xs text-muted-foreground">
                    Stable registry key (lowercase, dashes). Immutable after create.
                  </p>
                </div>
              </>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="display_name">Display Name *</Label>
              <Input
                id="display_name"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="shop_domain">Shop Domain</Label>
              <Input
                id="shop_domain"
                value={form.shop_domain}
                onChange={(e) => setForm((f) => ({ ...f, shop_domain: e.target.value }))}
                placeholder="shop.example.com"
              />
              <p className="text-xs text-muted-foreground">
                Public storefront domain the feed is fetched from (no protocol).
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                placeholder="USD"
                className="w-24"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="partner">Affiliate Partner</Label>
              <Select
                value={form.affiliate_partner_id}
                onValueChange={(v) => setForm((f) => ({ ...f, affiliate_partner_id: v }))}
              >
                <SelectTrigger id="partner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {(partners ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.partner_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="org">Organization</Label>
              <Select
                value={form.organization_id}
                onValueChange={(v) => setForm((f) => ({ ...f, organization_id: v }))}
              >
                <SelectTrigger id="org">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {(orgs ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Linking adds the seller role to the organization.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_enabled"
                checked={form.is_enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_enabled: v }))}
              />
              <Label htmlFor="is_enabled">Enabled (picked up by the hourly sync)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : editId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
