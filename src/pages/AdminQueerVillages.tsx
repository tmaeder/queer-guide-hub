import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Landmark, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useQueerVillages, type QueerVillageWithRelations } from '@/hooks/useQueerVillages';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Autocomplete from '@mui/material/Autocomplete';

type CityOption = { id: string; name: string };
type CountryOption = { id: string; name: string };

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  history: '',
  image_url: '',
  website: '',
  latitude: '',
  longitude: '',
  city_id: '',
  country_id: '',
  notable_landmarks: '',
  tags: '',
  featured: false,
};

export default function AdminQueerVillages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isModerator, loading: rolesLoading } = useAdminRoles();
  const { villages, loading, fetchVillages, createVillage, updateVillage, deleteVillage } = useQueerVillages();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QueerVillageWithRelations | null>(null);

  const [cities, setCities] = useState<CityOption[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    if (!rolesLoading && !isAdmin && !isModerator) navigate('/admin');
  }, [rolesLoading, isAdmin, isModerator]);

  useEffect(() => {
    // load cities and countries for autocompletes
    supabase.from('cities').select('id, name').order('name').then(({ data }) => {
      if (data) setCities(data);
    });
    supabase.from('countries').select('id, name').order('name').then(({ data }) => {
      if (data) setCountries(data);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search) return villages;
    const q = search.toLowerCase();
    return villages.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.cities?.name?.toLowerCase().includes(q) ||
      v.countries?.name?.toLowerCase().includes(q)
    );
  }, [villages, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (v: QueerVillageWithRelations) => {
    setEditingId(v.id);
    setForm({
      name: v.name || '',
      slug: v.slug || '',
      description: v.description || '',
      history: v.history || '',
      image_url: v.image_url || '',
      website: v.website || '',
      latitude: v.latitude != null ? String(v.latitude) : '',
      longitude: v.longitude != null ? String(v.longitude) : '',
      city_id: v.city_id || '',
      country_id: v.country_id || '',
      notable_landmarks: v.notable_landmarks?.join(', ') || '',
      tags: v.tags?.join(', ') || '',
      featured: v.featured || false,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.slug.trim()) { toast.error('Slug is required'); return; }
    if (!form.city_id) { toast.error('City is required'); return; }
    if (!form.country_id) { toast.error('Country is required'); return; }

    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        history: form.history.trim() || null,
        image_url: form.image_url.trim() || null,
        website: form.website.trim() || null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        city_id: form.city_id,
        country_id: form.country_id,
        notable_landmarks: form.notable_landmarks ? form.notable_landmarks.split(',').map(s => s.trim()).filter(Boolean) : [],
        tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        featured: form.featured,
      };

      if (editingId) {
        await updateVillage(editingId, payload);
        toast.success('Village updated');
      } else {
        payload.created_by = user?.id;
        await createVillage(payload);
        toast.success('Village created');
      }
      setDialogOpen(false);
      fetchVillages();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save village');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteVillage(deleteTarget.id);
      toast.success('Village deleted');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      fetchVillages();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete village');
    }
  };

  const generateSlug = () => {
    if (!form.name) return;
    const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setForm(f => ({ ...f, slug }));
  };

  if (rolesLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Queer Villages</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage LGBTQ+ neighborhoods and districts
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip label={`${villages.length} total`} size="small" />
          <Chip label={`${villages.filter(v => v.featured).length} featured`} size="small" color="primary" variant="outlined" />
          <Button variant="default" size="sm" onClick={openCreate}>
            <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
            Add Village
          </Button>
        </Box>
      </Box>

      {/* Search */}
      <Box sx={{ position: 'relative', maxWidth: 360, mb: 3 }}>
        <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, opacity: 0.5 }} />
        <Input
          placeholder="Search villages, cities..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft: 36 }}
        />
      </Box>

      {/* List */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Landmark style={{ width: 48, height: 48, opacity: 0.3, margin: '0 auto 16px' }} />
          <Typography variant="h6" color="text.secondary">No villages found</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filtered.map(v => (
            <Paper key={v.id} elevation={1} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, borderRadius: 2 }}>
              {/* Image thumbnail */}
              <Box sx={{ width: 56, height: 56, borderRadius: 1.5, overflow: 'hidden', bgcolor: 'action.hover', flexShrink: 0 }}>
                {v.image_url ? (
                  <img src={v.image_url} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Landmark style={{ width: 20, height: 20, opacity: 0.3 }} />
                  </Box>
                )}
              </Box>

              {/* Info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>{v.name}</Typography>
                  {v.featured && <Badge style={{ fontSize: '0.6rem', padding: '1px 5px' }}>Featured</Badge>}
                </Box>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {[v.cities?.name, v.countries?.name].filter(Boolean).join(', ')}
                </Typography>
                <Typography variant="caption" color="text.secondary">/villages/{v.slug}</Typography>
              </Box>

              {/* Actions */}
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                <Button variant="ghost" size="sm" onClick={() => window.open(`/villages/${v.slug}`, '_blank')}>
                  <ExternalLink style={{ width: 14, height: 14 }} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                  <Edit2 style={{ width: 14, height: 14 }} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setDeleteTarget(v); setDeleteDialogOpen(true); }}>
                  <Trash2 style={{ width: 14, height: 14, color: '#ef4444' }} />
                </Button>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ maxWidth: 640, maxHeight: '80vh', overflow: 'auto' }}>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Village' : 'Create Village'}</DialogTitle>
          </DialogHeader>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <TextField label="Name" required fullWidth size="small" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
              <TextField label="Slug" required fullWidth size="small" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} helperText="URL-friendly identifier" />
              <Button variant="outline" size="sm" onClick={generateSlug} style={{ flexShrink: 0, height: 40 }}>
                Generate
              </Button>
            </Box>

            <Autocomplete
              options={cities}
              getOptionLabel={o => o.name}
              value={cities.find(c => c.id === form.city_id) || null}
              onChange={(_, val) => setForm(f => ({ ...f, city_id: val?.id || '' }))}
              renderInput={params => <TextField {...params} label="City *" size="small" />}
            />

            <Autocomplete
              options={countries}
              getOptionLabel={o => o.name}
              value={countries.find(c => c.id === form.country_id) || null}
              onChange={(_, val) => setForm(f => ({ ...f, country_id: val?.id || '' }))}
              renderInput={params => <TextField {...params} label="Country *" size="small" />}
            />

            <TextField label="Description" multiline rows={3} fullWidth size="small" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <TextField label="History" multiline rows={3} fullWidth size="small" value={form.history} onChange={e => setForm(f => ({ ...f, history: e.target.value }))} />
            <TextField label="Image URL" fullWidth size="small" value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} />
            <TextField label="Website" fullWidth size="small" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label="Latitude" size="small" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} />
              <TextField label="Longitude" size="small" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} />
            </Box>

            <TextField label="Notable Landmarks" fullWidth size="small" value={form.notable_landmarks} onChange={e => setForm(f => ({ ...f, notable_landmarks: e.target.value }))} helperText="Comma-separated" />
            <TextField label="Tags" fullWidth size="small" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} helperText="Comma-separated" />

            <FormControlLabel
              control={<Switch checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} />}
              label="Featured"
            />
          </Box>

          <DialogFooter style={{ marginTop: 16 }}>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent style={{ maxWidth: 420 }}>
          <DialogHeader>
            <DialogTitle>Delete Village</DialogTitle>
          </DialogHeader>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
          </Typography>
          <DialogFooter style={{ marginTop: 16 }}>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
