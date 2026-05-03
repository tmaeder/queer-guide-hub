import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { deleteCountry, updateCountry } from '@/hooks/usePageFetchers';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logAdminGeoEdit } from '@/lib/admin-audit';

interface CountryRow {
  id: string;
  name: string;
  code: string | null;
  capital: string | null;
  population: number | null;
  area_km2: number | null;
  gdp_usd: number | null;
  currency: string | null;
  lgbt_legal_status: string | null;
  lgbt_rights_status: string | null;
  equality_score: number | null;
  flag_emoji: string | null;
  languages: string[] | null;
  driving_side: string | null;
  continent_id: string | null;
  region_id: string | null;
  created_at: string;
  continents: { name: string } | null;
  regions: { name: string } | null;
  venues: { count: number }[] | null;
  events: { count: number }[] | null;
}

const columnHelper = createColumnHelper<CountryRow>();

const fmtNum = (n: number | null) => (n ? new Intl.NumberFormat().format(n) : '-');
const fmtCurrency = (n: number | null) =>
  n
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(n)
    : '-';

export default function AdminCountries() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState<CountryRow | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    capital: '',
    population: '',
    area_km2: '',
    gdp_usd: '',
    currency: '',
    flag_emoji: '',
    lgbt_legal_status: '',
    lgbt_rights_status: '',
    equality_score: '',
  });

  const invalidateTable = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'countries'] });

  const handleEdit = (country: CountryRow) => {
    setEditingCountry(country);
    setFormData({
      name: country.name || '',
      code: country.code || '',
      capital: country.capital || '',
      population: country.population?.toString() || '',
      area_km2: country.area_km2?.toString() || '',
      gdp_usd: country.gdp_usd?.toString() || '',
      currency: country.currency || '',
      flag_emoji: country.flag_emoji || '',
      lgbt_legal_status: country.lgbt_legal_status || '',
      lgbt_rights_status: country.lgbt_rights_status || '',
      equality_score: country.equality_score?.toString() || '',
    });
    setEditDialogOpen(true);
  };

  const handleDelete = async (country: CountryRow) => {
    if (!confirm(`Delete "${country.name}"? This will affect related data.`)) return;
    try {
      const { error } = await deleteCountry(country.id);
      if (error) throw error;
      void logAdminGeoEdit('countries', 'delete', country.id, country as unknown as Record<string, unknown>, null);
      toast({ title: 'Success', description: `${country.name} deleted` });
      invalidateTable();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete country', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!editingCountry) return;
    try {
      const update = {
        name: formData.name,
        code: formData.code,
        capital: formData.capital,
        population: formData.population ? parseInt(formData.population) : null,
        area_km2: formData.area_km2 ? parseFloat(formData.area_km2) : null,
        gdp_usd: formData.gdp_usd ? parseFloat(formData.gdp_usd) : null,
        currency: formData.currency,
        flag_emoji: formData.flag_emoji || null,
        lgbt_legal_status: formData.lgbt_legal_status || null,
        lgbt_rights_status: formData.lgbt_rights_status || null,
        equality_score: formData.equality_score ? parseFloat(formData.equality_score) : null,
      };
      const { error } = await updateCountry(editingCountry.id, update);
      if (error) throw error;
      void logAdminGeoEdit('countries', 'update', editingCountry.id, editingCountry as unknown as Record<string, unknown>, update);
      toast({ title: 'Success', description: `${formData.name} updated` });
      setEditDialogOpen(false);
      setEditingCountry(null);
      invalidateTable();
    } catch {
      toast({ title: 'Error', description: 'Failed to update country', variant: 'destructive' });
    }
  };

  const handleExportExcel = async () => {
    const cols: ExportColumnDef<Record<string, unknown>>[] = [
      { header: 'Flag', accessor: (r) => r.flag_emoji },
      { header: 'Name', accessor: (r) => r.name },
      { header: 'Code', accessor: (r) => r.code },
      { header: 'Continent', accessor: (r) => (r.continents as { name?: string } | null)?.name },
      { header: 'Region', accessor: (r) => (r.regions as { name?: string } | null)?.name },
      { header: 'Capital', accessor: (r) => r.capital },
      { header: 'Population', accessor: (r) => r.population },
      { header: 'Area (km2)', accessor: (r) => r.area_km2 },
      { header: 'GDP (USD)', accessor: (r) => r.gdp_usd },
      { header: 'Currency', accessor: (r) => r.currency },
      { header: 'Languages', accessor: (r) => (r.languages as string[] | null)?.join(', ') },
      { header: 'Driving side', accessor: (r) => r.driving_side },
      { header: 'LGBT legal status', accessor: (r) => r.lgbt_legal_status },
      { header: 'LGBT rights status', accessor: (r) => r.lgbt_rights_status },
      { header: 'Equality score', accessor: (r) => r.equality_score },
      { header: 'Venues', accessor: (r) => (r.venues as { count: number }[] | null)?.[0]?.count ?? 0 },
      { header: 'Events', accessor: (r) => (r.events as { count: number }[] | null)?.[0]?.count ?? 0 },
    ];
    const allData = await fetchAllRows(
      'countries',
      '*, continents(name), regions(name), venues(count), events(count)',
      { column: 'name', ascending: true },
    );
    await exportToExcel(allData, cols, generateFilename('countries'));
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Country',
        cell: (info) => (
          <div className="flex items-center gap-2">
            {info.row.original.flag_emoji && (
              <span style={{ fontSize: 18, lineHeight: 1 }}>{info.row.original.flag_emoji}</span>
            )}
            <div>
              <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
              {info.row.original.code && (
                <p className="text-sm text-muted-foreground">{info.row.original.code}</p>
              )}
            </div>
          </div>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.display({
        id: 'continent',
        header: 'Continent',
        cell: ({ row }) => {
          const name = row.original.continents?.name;
          return name ? <Badge variant="secondary">{name}</Badge> : '-';
        },
        meta: { hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.display({
        id: 'region',
        header: 'Region',
        cell: ({ row }) => row.original.regions?.name || '-',
        meta: { defaultVisible: false, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('capital', {
        header: 'Capital',
        cell: (info) => info.getValue() || '-',
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('lgbt_legal_status', {
        header: 'LGBT legal status',
        cell: (info) => {
          const v = info.getValue();
          if (!v) return <span className="text-muted-foreground">-</span>;
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
      columnHelper.accessor('lgbt_rights_status', {
        header: 'LGBT rights status',
        cell: (info) => info.getValue() || '-',
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('equality_score', {
        header: 'Equality score',
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
      columnHelper.accessor('population', {
        header: 'Population',
        cell: (info) => fmtNum(info.getValue()),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
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
      columnHelper.accessor('area_km2', {
        header: 'Area (km2)',
        cell: (info) => fmtNum(info.getValue()),
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('gdp_usd', {
        header: 'GDP',
        cell: (info) => fmtCurrency(info.getValue()),
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('currency', {
        header: 'Currency',
        cell: (info) => info.getValue() || '-',
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.display({
        id: 'languages',
        header: 'Languages',
        cell: ({ row }) => row.original.languages?.join(', ') || '-',
        meta: { defaultVisible: false, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('driving_side', {
        header: 'Driving side',
        cell: (info) => info.getValue() || '-',
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );

  const tableConfig: AdminTableConfig<CountryRow> = useMemo(
    () => ({
      tableName: 'countries',
      select:
        'id,name,code,capital,population,area_km2,gdp_usd,currency,lgbt_legal_status,lgbt_rights_status,equality_score,flag_emoji,languages,driving_side,continent_id,region_id,created_at,continents(name),regions(name),venues(count),events(count)',
      columns,
      defaultSort: { column: 'name', direction: 'asc' },
      defaultPageSize: 50,
      enableSelection: false,
      enableSearch: true,
      searchColumns: ['name', 'code', 'capital'],
      entityFilters: [
        {
          key: 'continent_id',
          label: 'Continent',
          type: 'select',
          column: 'continent_id',
          options: 'dynamic',
          dynamicSource: { table: 'continents', column: 'id', labelColumn: 'name' },
        },
        {
          key: 'region_id',
          label: 'Region',
          type: 'select',
          column: 'region_id',
          options: 'dynamic',
          dynamicSource: { table: 'regions', column: 'id', labelColumn: 'name' },
        },
        {
          key: 'lgbt_legal_status',
          label: 'LGBT legal status',
          type: 'select',
          column: 'lgbt_legal_status',
          options: 'dynamic',
          dynamicSource: {
            table: 'countries',
            column: 'lgbt_legal_status',
            labelColumn: 'lgbt_legal_status',
          },
        },
        {
          key: 'lgbt_rights_status',
          label: 'LGBT rights status',
          type: 'select',
          column: 'lgbt_rights_status',
          options: 'dynamic',
          dynamicSource: {
            table: 'countries',
            column: 'lgbt_rights_status',
            labelColumn: 'lgbt_rights_status',
          },
        },
        {
          key: 'currency',
          label: 'Currency',
          type: 'select',
          column: 'currency',
          options: 'dynamic',
          dynamicSource: { table: 'countries', column: 'currency', labelColumn: 'currency' },
        },
        {
          key: 'driving_side',
          label: 'Driving side',
          type: 'select',
          column: 'driving_side',
          options: [
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ],
        },
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
      toolbarActions: <ExportExcelButton onExport={handleExportExcel} />,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDelete is stable in practice, adding would defeat memoization
    [columns],
  );

  return (
    <AdminEntityTable
      title="Countries Management"
      subtitle="Manage countries, their information, and geographical data"
      backHref={null}
      config={tableConfig}
      afterTable={
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Country</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div>
              <Label>Country Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Country Code</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                maxLength={3}
              />
            </div>
            <div>
              <Label>Capital City</Label>
              <Input
                value={formData.capital}
                onChange={(e) => setFormData((p) => ({ ...p, capital: e.target.value }))}
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Input
                value={formData.currency}
                onChange={(e) => setFormData((p) => ({ ...p, currency: e.target.value }))}
              />
            </div>
            <div>
              <Label>Population</Label>
              <Input
                type="number"
                value={formData.population}
                onChange={(e) => setFormData((p) => ({ ...p, population: e.target.value }))}
              />
            </div>
            <div>
              <Label>Area (km2)</Label>
              <Input
                type="number"
                value={formData.area_km2}
                onChange={(e) => setFormData((p) => ({ ...p, area_km2: e.target.value }))}
              />
            </div>
            <div>
              <Label>GDP (USD)</Label>
              <Input
                type="number"
                value={formData.gdp_usd}
                onChange={(e) => setFormData((p) => ({ ...p, gdp_usd: e.target.value }))}
              />
            </div>
            <div>
              <Label>Flag emoji</Label>
              <Input
                value={formData.flag_emoji}
                onChange={(e) => setFormData((p) => ({ ...p, flag_emoji: e.target.value }))}
                maxLength={8}
              />
            </div>
            <div>
              <Label>LGBT legal status</Label>
              <Input
                value={formData.lgbt_legal_status}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, lgbt_legal_status: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>LGBT rights status</Label>
              <Input
                value={formData.lgbt_rights_status}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, lgbt_rights_status: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Equality score</Label>
              <Input
                type="number"
                value={formData.equality_score}
                onChange={(e) => setFormData((p) => ({ ...p, equality_score: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      }
    />
  );
}
