import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useQueerVillages } from '@/hooks/useQueerVillages';
import { fetchAllCitiesAndCountries } from '@/hooks/usePageFetchers';
import { AdminEntityTable } from '@/components/admin/data-table';
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
  cities: { name: string; population: number | null } | null;
  countries: {
    name: string;
    lgbt_legal_status: string | null;
    population: number | null;
  } | null;
  venues: { count: number }[];
  events: { count: number }[];
}

const columnHelper = createColumnHelper<VillageRow>();

const fmtNum = (n: number | null | undefined) =>
  n != null ? new Intl.NumberFormat().format(n) : '-';

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

interface IdNameComboboxProps {
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  required?: boolean;
}

function IdNameCombobox({ options, value, onChange, placeholder, required }: IdNameComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value) || null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{selected ? selected.name : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.name}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === o.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {o.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
    fetchAllCitiesAndCountries().then(({ cities: c, countries: ctry }) => {
      setCities(c as CityOption[]);
      setCountries(ctry as CountryOption[]);
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
      const payload: Record<string, unknown> = {
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save village');
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete village');
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
            <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-accent">
              {v.image_url ? (
                <img
                  src={v.image_url}
                  alt={v.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Landmark style={{ width: 16, height: 16, opacity: 0.3 }} />
                </div>
              )}
            </div>
          );
        },
        meta: { hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <div>
            <div className="flex items-center gap-1">
              <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
              {info.row.original.featured && (
                <Badge style={{ fontSize: '0.6rem', padding: '1px 5px' }}>Featured</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {[info.row.original.cities?.name, info.row.original.countries?.name]
                .filter(Boolean)
                .join(', ')}
            </p>
            <p className="text-xs text-muted-foreground">
              /villages/{info.row.original.slug}
            </p>
          </div>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('featured', {
        header: 'Featured',
        cell: (info) => (info.getValue() ? <Badge>Featured</Badge> : null),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.display({
        id: 'country',
        header: 'Country',
        cell: ({ row }) => {
          const name = row.original.countries?.name;
          return name ? <Badge variant="secondary">{name}</Badge> : '-';
        },
        meta: { hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.display({
        id: 'lgbt_legal_status',
        header: 'LGBT legal status',
        cell: ({ row }) => row.original.countries?.lgbt_legal_status || '-',
        meta: { hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.display({
        id: 'population',
        header: 'Population',
        cell: ({ row }) => {
          const cityPop = row.original.cities?.population;
          const countryPop = row.original.countries?.population;
          const value = cityPop ?? countryPop;
          if (value == null) return '-';
          return (
            <div>
              <span>{fmtNum(value)}</span>
              <span className="ml-1 text-xs text-muted-foreground">
                ({cityPop != null ? 'city' : 'country'})
              </span>
            </div>
          );
        },
        meta: { defaultVisible: false, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.display({
        id: 'venues_count',
        header: 'Venues',
        cell: ({ row }) => fmtNum(row.original.venues?.[0]?.count ?? 0),
        meta: { hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.display({
        id: 'events_count',
        header: 'Events',
        cell: ({ row }) => fmtNum(row.original.events?.[0]?.count ?? 0),
        meta: { hideable: true } satisfies AdminColumnMeta,
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
        'id,name,slug,description,history,image_url,website,latitude,longitude,city_id,country_id,notable_landmarks,tags,featured,created_at,cities(name,population),countries(name,lgbt_legal_status,population),venues(count),events(count)',
      columns,
      defaultSort: { column: 'name', direction: 'asc' },
      defaultPageSize: 25,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name'],
      entityFilters: [
        { key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' },
        {
          key: 'country_id',
          label: 'Country',
          type: 'select',
          column: 'country_id',
          options: 'dynamic',
          dynamicSource: { table: 'countries', column: 'id', labelColumn: 'name' },
        },
        {
          key: 'city_id',
          label: 'City',
          type: 'select',
          column: 'city_id',
          options: 'dynamic',
          dynamicSource: { table: 'cities', column: 'id', labelColumn: 'name' },
        },
      ],
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
    <AdminEntityTable
      title="Queer Villages"
      subtitle="Manage LGBTQ+ neighborhoods and districts"
      backHref={null}
      config={tableConfig}
      afterTable={
        <>
          {/* Create/Edit Dialog */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent style={{ maxWidth: 640, maxHeight: '80vh', overflow: 'auto' }}>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Village' : 'Create Village'}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-5 pt-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="aqv-name">Name *</Label>
                  <Input
                    id="aqv-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex flex-1 flex-col gap-2">
                    <Label htmlFor="aqv-slug">Slug *</Label>
                    <Input
                      id="aqv-slug"
                      value={form.slug}
                      onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">URL-friendly identifier</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateSlug}
                    style={{ flexShrink: 0, height: 40 }}
                  >
                    Generate
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>City *</Label>
                  <IdNameCombobox
                    options={cities}
                    value={form.city_id}
                    onChange={(id) => setForm((f) => ({ ...f, city_id: id }))}
                    placeholder="Select a city..."
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Country *</Label>
                  <IdNameCombobox
                    options={countries}
                    value={form.country_id}
                    onChange={(id) => setForm((f) => ({ ...f, country_id: id }))}
                    placeholder="Select a country..."
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="aqv-description">Description</Label>
                  <Textarea
                    id="aqv-description"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="aqv-history">History</Label>
                  <Textarea
                    id="aqv-history"
                    rows={3}
                    value={form.history}
                    onChange={(e) => setForm((f) => ({ ...f, history: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="aqv-image">Image URL</Label>
                  <Input
                    id="aqv-image"
                    value={form.image_url}
                    onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="aqv-website">Website</Label>
                  <Input
                    id="aqv-website"
                    value={form.website}
                    onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="aqv-lat">Latitude</Label>
                    <Input
                      id="aqv-lat"
                      value={form.latitude}
                      onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="aqv-lng">Longitude</Label>
                    <Input
                      id="aqv-lng"
                      value={form.longitude}
                      onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="aqv-landmarks">Notable Landmarks</Label>
                  <Input
                    id="aqv-landmarks"
                    value={form.notable_landmarks}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notable_landmarks: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="aqv-tags">Tags</Label>
                  <Input
                    id="aqv-tags"
                    value={form.tags}
                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="aqv-featured"
                    checked={form.featured}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, featured: checked }))
                    }
                  />
                  <Label htmlFor="aqv-featured">Featured</Label>
                </div>
              </div>
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
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This
                action cannot be undone.
              </p>
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
        </>
      }
    />
  );
}
