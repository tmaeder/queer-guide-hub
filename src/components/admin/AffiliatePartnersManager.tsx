import { useState } from 'react';
import { Plus, Edit2, Trash2, Handshake, Globe, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAffiliateLinks } from '@/hooks/useAffiliateLinks';
import { toast } from 'sonner';

const emptyForm = {
  partner_name: '',
  domains: '',
  url_patterns: '',
  parameters: '{}',
  redirect_template: '',
  notes: '',
  enabled: true,
};

export function AffiliatePartnersManager() {
  const { partners, loading, error: fetchError, fetchPartners, createPartner, updatePartner, deletePartner } = useAffiliateLinks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (p: typeof partners[0]) => {
    setEditId(p.id);
    setForm({
      partner_name: p.partner_name,
      domains: p.domains.join(', '),
      url_patterns: (p.url_patterns ?? []).join(', '),
      parameters: JSON.stringify(p.parameters, null, 2),
      redirect_template: p.redirect_template ?? '',
      notes: (p as unknown as Record<string, unknown>).notes as string ?? '',
      enabled: p.enabled,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.partner_name.trim()) { toast.error('Name is required'); return; }
    let params: Record<string, string>;
    try {
      params = JSON.parse(form.parameters);
    } catch {
      toast.error('Parameters must be valid JSON');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        partner_name: form.partner_name.trim(),
        domains: form.domains.split(',').map(d => d.trim()).filter(Boolean),
        url_patterns: form.url_patterns ? form.url_patterns.split(',').map(d => d.trim()).filter(Boolean) : [],
        parameters: params,
        redirect_template: form.redirect_template || null,
        notes: form.notes || null,
        enabled: form.enabled,
      };
      if (editId) {
        await updatePartner(editId, payload);
        toast.success('Partner updated');
      } else {
        await createPartner(payload);
        toast.success('Partner created');
      }
      setDialogOpen(false);
      fetchPartners();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message :'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete partner "${name}"?`)) return;
    try {
      await deletePartner(id);
      toast.success('Partner deleted');
      fetchPartners();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message :'Delete failed');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" aria-label="Loading" /></div>;
  }

  if (fetchError) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto">
        <div className="rounded-element border bg-card p-8 text-center">
          <AlertCircle style={{ width: 32, height: 32, color: '#ef4444', margin: '0 auto 12px' }} />
          <h6 className="text-lg font-medium mb-1">Failed to load affiliate partners</h6>
          <p className="text-muted-foreground mb-4">{fetchError}</p>
          <Button onClick={fetchPartners} variant="outline">
            <RefreshCw style={{ width: 16, height: 16, marginRight: 8 }} />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h5 className="text-xl font-medium flex items-center gap-2">
          <Handshake style={{ width: 24, height: 24 }} />
          Affiliate Partners
        </h5>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Add Partner</Button>
      </div>

      {partners.length === 0 ? (
        <div className="rounded-element border bg-card p-8 text-center">
          <p className="text-muted-foreground">No affiliate partners configured yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {partners.map(p => (
            <div key={p.id} className="rounded-element border bg-card p-5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-semibold">{p.partner_name}</span>
                  <Badge variant="outline" className={p.enabled ? 'border-green-500 text-green-600' : ''}>
                    {p.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {p.domains.map(d => (
                    <Badge key={d} variant="outline" className="gap-1">
                      <Globe style={{ width: 12, height: 12 }} />{d}
                    </Badge>
                  ))}
                </div>
                {Object.keys(p.parameters).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Params: {Object.entries(p.parameters).map(([k, v]) => `${k}=${v}`).join(', ')}
                  </p>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Edit2 className="w-4 h-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id, p.partner_name)}>
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Partner' : 'Add Affiliate Partner'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="partner_name">Partner Name *</Label>
              <Input
                id="partner_name"
                value={form.partner_name}
                onChange={e => setForm(f => ({ ...f, partner_name: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="domains">Domains (comma-separated)</Label>
              <Input
                id="domains"
                value={form.domains}
                onChange={e => setForm(f => ({ ...f, domains: e.target.value }))}
                placeholder="aviasales.com, search.aviasales.com"
              />
              <p className="text-xs text-muted-foreground">Domains to match (without www)</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="url_patterns">URL Patterns (comma-separated, optional)</Label>
              <Input
                id="url_patterns"
                value={form.url_patterns}
                onChange={e => setForm(f => ({ ...f, url_patterns: e.target.value }))}
                placeholder="/flights/*, /hotels/*"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="parameters">Parameters (JSON)</Label>
              <Textarea
                id="parameters"
                value={form.parameters}
                onChange={e => setForm(f => ({ ...f, parameters: e.target.value }))}
                rows={3}
                placeholder='{"marker": "452012"}'
              />
              <p className="text-xs text-muted-foreground">Key-value pairs appended to matching URLs</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="redirect_template">Redirect Template (optional)</Label>
              <Input
                id="redirect_template"
                value={form.redirect_template}
                onChange={e => setForm(f => ({ ...f, redirect_template: e.target.value }))}
                placeholder="https://tp.media/r?..."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="enabled" checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
              <Label htmlFor="enabled">Enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AffiliatePartnersManager;
