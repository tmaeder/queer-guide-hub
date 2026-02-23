import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, Edit2, Trash2, Music, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useFestivals, type FestivalWithRelations } from '@/hooks/useFestivals';
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

const FESTIVAL_TYPES = [
  { value: 'pride', label: 'Pride' },
  { value: 'festival', label: 'Festival' },
  { value: 'conference', label: 'Conference' },
  { value: 'series', label: 'Series' },
  { value: 'other', label: 'Other' },
];

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  festival_type: 'festival',
  start_date: '',
  end_date: '',
  timezone: '',
  city: '',
  city_id: null as string | null,
  country: '',
  country_id: null as string | null,
  website: '',
  ticket_url: '',
  tags: '',
  is_recurring: false,
  recurrence_pattern: '',
  featured: false,
};

export default function AdminFestivals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { festivals, loading, fetchFestivals, createFestival, updateFestival, deleteFestival } = useFestivals();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState<Array<{ id: string; name: string }>>([]);
  const [countries, setCountries] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    supabase.from('cities').select('id, name').order('name').then(({ data }) => setCities(data ?? []));
    supabase.from('countries').select('id, name').order('name').then(({ data }) => setCountries(data ?? []));
  }, []);

  useEffect(() => {
    if (!rolesLoading && !canManageContent()) navigate('/');
  }, [rolesLoading, canManageContent, navigate]);

  const filtered = useMemo(() => {
    if (!search) return festivals;
    const q = search.toLowerCase();
    return festivals.filter(f => f.name.toLowerCase().includes(q) || f.cities?.name?.toLowerCase().includes(q));
  }, [festivals, search]);

  const generateSlug = () => {
    const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setForm(f => ({ ...f, slug }));
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (f: FestivalWithRelations) => {
    setEditId(f.id);
    setForm({
      name: f.name,
      slug: f.slug ?? '',
      description: f.description ?? '',
      festival_type: f.festival_type,
      start_date: f.start_date ? f.start_date.slice(0, 16) : '',
      end_date: f.end_date ? f.end_date.slice(0, 16) : '',
      timezone: f.timezone ?? '',
      city: f.city ?? '',
      city_id: f.city_id,
      country: f.country ?? '',
      country_id: f.country_id,
      website: f.website ?? '',
      ticket_url: f.ticket_url ?? '',
      tags: (f.tags ?? []).join(', '),
      is_recurring: f.is_recurring ?? false,
      recurrence_pattern: f.recurrence_pattern ?? '',
      featured: f.featured ?? false,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug || null,
        description: form.description || null,
        festival_type: form.festival_type,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
        timezone: form.timezone || null,
        city: form.city || null,
        city_id: form.city_id,
        country: form.country || null,
        country_id: form.country_id,
        website: form.website || null,
        ticket_url: form.ticket_url || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        is_recurring: form.is_recurring,
        recurrence_pattern: form.recurrence_pattern || null,
        featured: form.featured,
      };
      if (editId) {
        await updateFestival(editId, payload);
        toast.success('Festival updated');
      } else {
        await createFestival({ ...payload, created_by: user?.id });
        toast.success('Festival created');
      }
      setDialogOpen(false);
      fetchFestivals();
    } catch (e: any) {
      toast.error(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This will also unlink all child events.`)) return;
    try {
      await deleteFestival(id);
      toast.success('Festival deleted');
      fetchFestivals();
    } catch (e: any) {
      toast.error(e.message ?? 'Delete failed');
    }
  };

  if (rolesLoading || loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Music style={{ width: 24, height: 24 }} /> Manage Festivals ({festivals.length})
        </Typography>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Add Festival</Button>
      </Box>

      {/* Search */}
      <Box sx={{ mb: 3, position: 'relative', maxWidth: 400 }}>
        <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#9ca3af' }} />
        <Input placeholder="Search festivals..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
      </Box>

      {/* List */}
      {filtered.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No festivals found.</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map(f => (
            <Paper key={f.id} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle2" fontWeight={600}>{f.name}</Typography>
                  <Chip size="small" label={f.festival_type} variant="outlined" />
                  {f.featured && <Badge style={{ backgroundColor: '#333', color: '#fff' }}>Featured</Badge>}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {[f.cities?.name, f.countries?.name].filter(Boolean).join(', ') || 'No location'}
                  {f.start_date && ` | ${new Date(f.start_date).toLocaleDateString()}`}
                  {f.end_date && ` - ${new Date(f.end_date).toLocaleDateString()}`}
                </Typography>
              </Box>
              <Button size="sm" variant="ghost" onClick={() => navigate(`/festivals/${f.id}`)}>
                <Link2 className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEdit(f)}>
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(f.id, f.name)}>
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </Paper>
          ))}
        </Box>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Festival' : 'Add Festival'}</DialogTitle>
          </DialogHeader>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
              <TextField label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} size="small" fullWidth required />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
              <TextField label="Slug" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} size="small" fullWidth />
              <Button size="sm" variant="outline" onClick={generateSlug} type="button">Gen</Button>
            </Box>
            <TextField label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} size="small" multiline rows={3} />
            <Select value={form.festival_type} onValueChange={v => setForm(f => ({ ...f, festival_type: v }))}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                {FESTIVAL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Start Date" type="datetime-local" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} size="small" fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label="End Date" type="datetime-local" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} size="small" fullWidth InputLabelProps={{ shrink: true }} />
            </Box>
            <TextField label="Timezone (IANA)" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} size="small" placeholder="Europe/Zurich" />
            <Autocomplete
              options={cities}
              getOptionLabel={o => o.name}
              value={cities.find(c => c.id === form.city_id) || null}
              onChange={(_, v) => setForm(f => ({ ...f, city_id: v?.id ?? null, city: v?.name ?? '' }))}
              renderInput={params => <TextField {...params} label="City" size="small" />}
              size="small"
            />
            <Autocomplete
              options={countries}
              getOptionLabel={o => o.name}
              value={countries.find(c => c.id === form.country_id) || null}
              onChange={(_, v) => setForm(f => ({ ...f, country_id: v?.id ?? null, country: v?.name ?? '' }))}
              renderInput={params => <TextField {...params} label="Country" size="small" />}
              size="small"
            />
            <TextField label="Website" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} size="small" />
            <TextField label="Ticket URL" value={form.ticket_url} onChange={e => setForm(f => ({ ...f, ticket_url: e.target.value }))} size="small" />
            <TextField label="Tags (comma-separated)" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} size="small" />
            <FormControlLabel control={<Switch checked={form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} />} label="Recurring" />
            {form.is_recurring && (
              <TextField label="Recurrence Pattern" value={form.recurrence_pattern} onChange={e => setForm(f => ({ ...f, recurrence_pattern: e.target.value }))} size="small" placeholder="Annual, every June" />
            )}
            <FormControlLabel control={<Switch checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} />} label="Featured" />
          </Box>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
