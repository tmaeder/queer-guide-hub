import { useState } from 'react';
import { Plus, Edit2, Trash2, Handshake, Globe, AlertCircle, RefreshCw } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
      notes: (p as Record<string, unknown>).notes as string ?? '',
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
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  if (fetchError) {
    return (
      <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <AlertCircle style={{ width: 32, height: 32, color: '#ef4444', margin: '0 auto 12px' }} />
          <Typography variant="h6" sx={{ mb: 1 }}>Failed to load affiliate partners</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>{fetchError}</Typography>
          <Button onClick={fetchPartners} variant="outline">
            <RefreshCw style={{ width: 16, height: 16, marginRight: 8 }} />
            Retry
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Handshake style={{ width: 24, height: 24 }} />
          Affiliate Partners
        </Typography>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Add Partner</Button>
      </Box>

      {partners.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No affiliate partners configured yet.</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {partners.map(p => (
            <Paper key={p.id} sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle1" fontWeight={600}>{p.partner_name}</Typography>
                  <Chip
                    size="small"
                    label={p.enabled ? 'Active' : 'Disabled'}
                    color={p.enabled ? 'success' : 'default'}
                    variant="outlined"
                  />
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
                  {p.domains.map(d => (
                    <Chip key={d} size="small" icon={<Globe style={{ width: 12, height: 12 }} />} label={d} variant="outlined" />
                  ))}
                </Box>
                {Object.keys(p.parameters).length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Params: {Object.entries(p.parameters).map(([k, v]) => `${k}=${v}`).join(', ')}
                  </Typography>
                )}
              </Box>
              <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Edit2 className="w-4 h-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id, p.partner_name)}>
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </Paper>
          ))}
        </Box>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Partner' : 'Add Affiliate Partner'}</DialogTitle>
          </DialogHeader>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Partner Name"
              value={form.partner_name}
              onChange={e => setForm(f => ({ ...f, partner_name: e.target.value }))}
              size="small"
              required
            />
            <TextField
              label="Domains (comma-separated)"
              value={form.domains}
              onChange={e => setForm(f => ({ ...f, domains: e.target.value }))}
              size="small"
              placeholder="aviasales.com, search.aviasales.com"
              helperText="Domains to match (without www)"
            />
            <TextField
              label="URL Patterns (comma-separated, optional)"
              value={form.url_patterns}
              onChange={e => setForm(f => ({ ...f, url_patterns: e.target.value }))}
              size="small"
              placeholder="/flights/*, /hotels/*"
            />
            <TextField
              label="Parameters (JSON)"
              value={form.parameters}
              onChange={e => setForm(f => ({ ...f, parameters: e.target.value }))}
              size="small"
              multiline
              rows={3}
              placeholder='{"marker": "452012"}'
              helperText="Key-value pairs appended to matching URLs"
            />
            <TextField
              label="Redirect Template (optional)"
              value={form.redirect_template}
              onChange={e => setForm(f => ({ ...f, redirect_template: e.target.value }))}
              size="small"
              placeholder="https://tp.media/r?..."
            />
            <TextField
              label="Notes"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              size="small"
              multiline
              rows={2}
            />
            <FormControlLabel
              control={<Switch checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />}
              label="Enabled"
            />
          </Box>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

export default AffiliatePartnersManager;
