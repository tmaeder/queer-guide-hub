import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { listFrom, insertInto, updateRow, deleteRow } from '@/hooks/usePageFetchers';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatBoolean,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, Plus, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { logAdminGeoEdit } from '@/lib/admin-audit';

interface CityRow {
  id: string;
  name: string;
  country_id: string;
  country_name: string | null;
  continent_id: string | null;
  lgbt_legal_status: string | null;
  lgbt_rights_status: string | null;
  equality_score: number | null;
  region_name: string | null;
  population: number | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  is_capital: boolean;
  is_major_city: boolean;
  major_airport_code: string | null;
  venue_count: number;
  event_count: number;
  created_at: string;
}

const columnHelper = createColumnHelper<CityRow>();

const emptyForm = {
  name: '',
  country_id: '',
  region_name: '',
  population: '',
  latitude: '',
  longitude: '',
  timezone: '',
  is_capital: false,
  is_major_city: false,
};

export default function AdminCities() {
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<CityRow | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);
  const [continents, setContinents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    listFrom<{ id: string; name: string }>('countries', 'id, name', { col: 'name' }).then(setCountries);
    listFrom<{ id: string; name: string }>('continents', 'id, name', { col: 'name' }).then(setContinents);
  }, []);

  const invalidateTable = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'cities'] });

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingCity(null);
  };

  const handleEdit = (city: CityRow) => {
    setEditingCity(city);
    setFormData({
      name: city.name,
      country_id: city.country_id,
      region_name: city.region_name || '',
      population: city.population?.toString() || '',
      latitude: city.latitude?.toString() || '',
      longitude: city.longitude?.toString() || '',
      timezone: city.timezone || '',
      is_capital: city.is_capital || false,
      is_major_city: city.is_major_city || false,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (city: CityRow) => {
    if (!confirm(`Delete "${city.name}"?`)) return;
    try {
      const { error } = await deleteRow('cities', city.id);
      if (error) throw error;
      void logAdminGeoEdit('cities', 'delete', city.id, city as unknown as Record<string, unknown>, null);
      toast.success('Success: City deleted');
      invalidateTable();
    } catch {
      toast.error('Error: Failed to delete city');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.country_id) {
      toast.error('Error: Name and country are required');
      return;
    }

    const cityData = {
      name: formData.name.trim(),
      country_id: formData.country_id,
      region_name: formData.region_name || null,
      population: formData.population ? parseInt(formData.population) : null,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      timezone: formData.timezone || null,
      is_capital: formData.is_capital,
      is_major_city: formData.is_major_city,
    };

    try {
      if (editingCity) {
        const { error } = await updateRow('cities', editingCity.id, cityData);
        if (error) throw error;
        void logAdminGeoEdit('cities', 'update', editingCity.id, editingCity as unknown as Record<string, unknown>, cityData);
        toast.success('Success: City updated');
      } else {
        const { data: inserted, error } = await insertInto('cities', cityData);
        if (error) throw error;
        const insertedId = (inserted as { id?: string } | null)?.id;
        if (insertedId) void logAdminGeoEdit('cities', 'create', insertedId, null, cityData);
        toast.success('Success: City created');
      }
      resetForm();
      setDialogOpen(false);
      invalidateTable();
    } catch {
      toast.error('Error: Failed to save city');
    }
  };

  const handleExportExcel = async () => {
    const cols: ExportColumnDef<Record<string, unknown>>[] = [
      { header: 'Name', accessor: (r) => r.name },
      { header: 'Country', accessor: (r) => r.country_name },
      { header: 'LGBT Legal', accessor: (r) => r.lgbt_legal_status },
      { header: 'LGBT Rights', accessor: (r) => r.lgbt_rights_status },
      { header: 'Equality Score', accessor: (r) => r.equality_score },
      { header: 'Venues', accessor: (r) => r.venue_count },
      { header: 'Events', accessor: (r) => r.event_count },
      { header: 'Region', accessor: (r) => r.region_name },
      { header: 'Population', accessor: (r) => r.population },
      { header: 'Latitude', accessor: (r) => r.latitude },
      { header: 'Longitude', accessor: (r) => r.longitude },
      { header: 'Timezone', accessor: (r) => r.timezone },
      { header: 'Is Capital', accessor: (r) => formatBoolean(r.is_capital) },
      { header: 'Is Major City', accessor: (r) => formatBoolean(r.is_major_city) },
      { header: 'Airport Code', accessor: (r) => r.major_airport_code },
    ];
    const allData = await fetchAllRows('cities_admin', '*', {
      column: 'name',
      ascending: true,
    });
    await exportToExcel(allData, cols, generateFilename('cities'));
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'City',
        cell: (info) => (
          <div>
            <div className="flex items-center gap-1">
              <MapPin style={{ height: 13, width: 13 }} />
              <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            </div>
            {info.row.original.country_name && (
              <p className="text-sm text-muted-foreground">
                {info.row.original.country_name}
              </p>
            )}
          </div>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('country_name', {
        header: 'Country',
        cell: (info) => info.getValue() || '-',
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('lgbt_legal_status', {
        header: 'LGBT Legal',
        cell: (info) => {
          const v = info.getValue();
          if (!v) return <span style={{ color: 'var(--muted-foreground)' }}>-</span>;
          const lower = v.toLowerCase();
          const tone =
            lower.includes('legal') || lower.includes('protected') || lower.includes('marriage')
              ? { backgroundColor: '#dcfce7', color: '#166534' }
              : lower.includes('illegal') || lower.includes('criminal')
                ? { backgroundColor: '#fee2e2', color: '#991b1b' }
                : { backgroundColor: '#fef3c7', color: '#92400e' };
          return <Badge style={tone}>{v}</Badge>;
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('equality_score', {
        header: 'Equality',
        cell: (info) => {
          const v = info.getValue();
          if (v == null) return '-';
          const tone =
            v >= 70
              ? { backgroundColor: '#dcfce7', color: '#166534' }
              : v >= 40
                ? { backgroundColor: '#fef3c7', color: '#92400e' }
                : { backgroundColor: '#fee2e2', color: '#991b1b' };
          return <Badge style={tone}>{v}</Badge>;
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('lgbt_rights_status', {
        header: 'LGBT Rights',
        cell: (info) => info.getValue() || '-',
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('venue_count', {
        header: 'Venues',
        cell: (info) => (info.getValue() ?? 0).toLocaleString(),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('event_count', {
        header: 'Events',
        cell: (info) => (info.getValue() ?? 0).toLocaleString(),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('region_name', {
        header: 'Region',
        cell: (info) => info.getValue() || '-',
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('population', {
        header: 'Population',
        cell: (info) => info.getValue()?.toLocaleString() || '-',
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('is_capital', {
        header: 'Status',
        cell: (info) => {
          const c = info.row.original;
          return (
            <div className="flex gap-1 flex-wrap">
              {c.is_capital && (
                <Badge style={{ backgroundColor: '#fef9c3', color: '#854d0e' }}>Capital</Badge>
              )}
              {c.is_major_city && (
                <Badge style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>Major</Badge>
              )}
              {!c.is_capital && !c.is_major_city && (
                <span style={{ color: 'var(--muted-foreground)' }}>-</span>
              )}
            </div>
          );
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('major_airport_code', {
        header: 'Airport',
        cell: (info) =>
          info.getValue() ? <Badge variant="outline">{info.getValue()}</Badge> : '-',
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('timezone', {
        header: 'Timezone',
        cell: (info) => info.getValue() || '-',
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
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

  const tableConfig: AdminTableConfig<CityRow> = useMemo(
    () => ({
      tableName: 'cities_admin',
      mutationTable: 'cities',
      select:
        'id,name,country_id,country_name,continent_id,lgbt_legal_status,lgbt_rights_status,equality_score,region_name,population,latitude,longitude,timezone,is_capital,is_major_city,major_airport_code,venue_count,event_count,created_at',
      columns,
      defaultSort: { column: 'name', direction: 'asc' },
      defaultPageSize: 50,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name', 'region_name', 'country_name'],
      entityFilters: [
        {
          key: 'country_id',
          label: 'Country',
          type: 'select',
          column: 'country_id',
          options: 'dynamic',
          dynamicSource: { table: 'countries', column: 'id', labelColumn: 'name' },
        },
        {
          key: 'continent_id',
          label: 'Continent',
          type: 'select',
          column: 'continent_id',
          options: continents.map((c) => ({ value: c.id, label: c.name })),
        },
        { key: 'is_capital', label: 'Capital', type: 'boolean', column: 'is_capital' },
        { key: 'is_major_city', label: 'Major City', type: 'boolean', column: 'is_major_city' },
      ],
      bulkEditFields: [
        { key: 'is_capital', label: 'Capital City', type: 'boolean', column: 'is_capital' },
        { key: 'is_major_city', label: 'Major City', type: 'boolean', column: 'is_major_city' },
      ],
      rowActions: [
        { key: 'edit', label: 'Edit', icon: Edit, onClick: handleEdit },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          variant: 'destructive',
          onClick: handleDelete,
        },
      ],
      toolbarActions: (
        <div className="flex gap-1">
          <ExportExcelButton onExport={handleExportExcel} />
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
          >
            <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
            Add City
          </Button>
        </div>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDelete is stable in practice, adding would defeat memoization
    [columns, continents],
  );

  return (
    <AdminEntityTable
      title="Cities Management"
      subtitle="Manage cities in the directory"
      backHref={null}
      config={tableConfig}
      afterTable={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ maxWidth: 672 }}>
          <DialogHeader>
            <DialogTitle>{editingCity ? 'Edit City' : 'Add New City'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>City Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Country</Label>
                <Select
                  value={formData.country_id}
                  onValueChange={(v) => setFormData((p) => ({ ...p, country_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Region/State</Label>
                <Input
                  value={formData.region_name}
                  onChange={(e) => setFormData((p) => ({ ...p, region_name: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label>Population</Label>
                <Input
                  type="number"
                  value={formData.population}
                  onChange={(e) => setFormData((p) => ({ ...p, population: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Latitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => setFormData((p) => ({ ...p, latitude: e.target.value }))}
                />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => setFormData((p) => ({ ...p, longitude: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Timezone</Label>
              <Input
                value={formData.timezone}
                onChange={(e) => setFormData((p) => ({ ...p, timezone: e.target.value }))}
                placeholder="e.g., America/New_York"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_capital"
                  checked={formData.is_capital}
                  onCheckedChange={(c) => setFormData((p) => ({ ...p, is_capital: c as boolean }))}
                />
                <Label htmlFor="is_capital">Capital City</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_major_city"
                  checked={formData.is_major_city}
                  onCheckedChange={(c) =>
                    setFormData((p) => ({ ...p, is_major_city: c as boolean }))
                  }
                />
                <Label htmlFor="is_major_city">Major City</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingCity ? 'Update City' : 'Add City'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      }
    />
  );
}
