import { useState, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useQueerVillages, type QueerVillageWithRelations } from '@/hooks/useQueerVillages';
import { api } from '@/integrations/api/client';
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, Plus, ExternalLink, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface VillageRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  history: string | null;
  image_url: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  country_id: string | null;
  notable_landmarks: string[] | null;
  tags: string[] | null;
  featured: boolean;
  created_at: string;
  cities: { name: string } | null;
  countries: { name: string } | null;
}

const columnHelper = createColumnHelper<VillageRow>();

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
  const { user } = useAuth();
  const { createVillage, updateVillage, deleteVillage } = useQueerVillages();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VillageRow | null>(null);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    supabase
      .from('cities')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        if (data) setCities(data);
      });
    supabase
      .from('countries')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        if (data) setCountries(data);
      });
  }, []);

  const invalidateTable = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'queer_villages'] });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (v: VillageRow) => {
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
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!form.slug.trim()) {
      toast.error('Slug is required');
      return;
    }
    if (!form.city_id) {
      toast.error('City is required');
      return;
    }
    if (!form.country_id) {
      toast.error('Country is required');
      return;
    }

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
        notable_landmarks: form.notable_landmarks
          ? form.notable_landmarks
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        tags: form.tags
          ? form.tags
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
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
      invalidateTable();
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
      invalidateTable();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete village');
    }
  };

  const generateSlug = () => {
    if (!form.name) return;
    const slug = form.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setForm((f) => ({ ...f, slug }));
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'thumbnail',
        header: '',
        cell: ({ row }) => {
          const v = row.original;
          return (
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1,
                overflow: 'hidden',
                bgcolor: 'action.hover',
                flexShrink: 0,
              }}
            >
              {v.image_url ? (
                <img
                  src={v.image_url}
                  alt={v.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                  }}
                >
                  <Landmark style={{ width: 16, height: 16, opacity: 0.3 }} />
                </Box>
              )}
            </Box>
          );
        },
        meta: { hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
              {info.row.original.featured && (
                <Badge style={{ fontSize: '0.6rem', padding: '1px 5px' }}>Featured</Badge>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {[info.row.original.cities?.name, info.row.original.countries?.name]
                .filter(Boolean)
                .join(', ')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              /villages/{info.row.original.slug}
            </Typography>
          </Box>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('featured', {
        header: 'Featured',
        cell: (info) => (info.getValue() ? <Badge>Featured</Badge> : null),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('created_at', {
        header: 'Created',
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );

  const tableConfig: AdminTableConfig<VillageRow> = useMemo(
    () => ({
      tableName: 'queer_villages',
      select:
        'id,name,slug,description,history,image_url,website,latitude,longitude,city_id,country_id,notable_landmarks,tags,featured,created_at,cities(name),countries(name)',
      columns,
      defaultSort: { column: 'name', direction: 'asc' },
      defaultPageSize: 25,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name'],
      entityFilters: [{ key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' }],
      bulkEditFields: [{ key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' }],
      rowActions: [
        {
          key: 'view',
          label: 'View',
          icon: ExternalLink,
          onClick: (v) => window.open(`/villages/${v.slug}`, '_blank'),
        },
        { key: 'edit', label: 'Edit', icon: Edit, onClick: openEdit },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          variant: 'destructive',
          onClick: (v) => {
            setDeleteTarget(v);
            setDeleteDialogOpen(true);
          },
        },
      ],
      toolbarActions: (
        <Button size="sm" onClick={openCreate}>
          <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
          Add Village
        </Button>
      ),
    }),
    [columns],
  );

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Queer Villages
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage LGBTQ+ neighborhoods and districts
        </Typography>
      </Box>

      <AdminDataTable config={tableConfig} />

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ maxWidth: 640, maxHeight: '80vh', overflow: 'auto' }}>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Village' : 'Create Village'}</DialogTitle>
          </DialogHeader>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <TextField
              label="Name"
              required
              fullWidth
              size="small"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
              <TextField
                label="Slug"
                required
                fullWidth
                size="small"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                helperText="URL-friendly identifier"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={generateSlug}
                style={{ flexShrink: 0, height: 40 }}
              >
                Generate
              </Button>
            </Box>
            <Autocomplete
              options={cities}
              getOptionLabel={(o) => o.name}
              value={cities.find((c) => c.id === form.city_id) || null}
              onChange={(_, val) => setForm((f) => ({ ...f, city_id: val?.id || '' }))}
              renderInput={(params) => <TextField {...params} label="City *" size="small" />}
            />
            <Autocomplete
              options={countries}
              getOptionLabel={(o) => o.name}
              value={countries.find((c) => c.id === form.country_id) || null}
              onChange={(_, val) => setForm((f) => ({ ...f, country_id: val?.id || '' }))}
              renderInput={(params) => <TextField {...params} label="Country *" size="small" />}
            />
            <TextField
              label="Description"
              multiline
              rows={3}
              fullWidth
              size="small"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <TextField
              label="History"
              multiline
              rows={3}
              fullWidth
              size="small"
              value={form.history}
              onChange={(e) => setForm((f) => ({ ...f, history: e.target.value }))}
            />
            <TextField
              label="Image URL"
              fullWidth
              size="small"
              value={form.image_url}
              onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
            />
            <TextField
              label="Website"
              fullWidth
              size="small"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Latitude"
                size="small"
                value={form.latitude}
                onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
              />
              <TextField
                label="Longitude"
                size="small"
                value={form.longitude}
                onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
              />
            </Box>
            <TextField
              label="Notable Landmarks"
              fullWidth
              size="small"
              value={form.notable_landmarks}
              onChange={(e) => setForm((f) => ({ ...f, notable_landmarks: e.target.value }))}
              helperText="Comma-separated"
            />
            <TextField
              label="Tags"
              fullWidth
              size="small"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              helperText="Comma-separated"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.featured}
                  onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
                />
              }
              label="Featured"
            />
          </Box>
          <DialogFooter style={{ marginTop: 16 }}>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
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
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action
            cannot be undone.
          </Typography>
          <DialogFooter style={{ marginTop: 16 }}>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
