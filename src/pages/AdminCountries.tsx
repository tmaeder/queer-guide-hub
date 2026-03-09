import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
import { api } from '@/integrations/api/client';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CountryRow {
  id: string;
  name: string;
  code: string | null;
  capital: string | null;
  population: number | null;
  area_km2: number | null;
  gdp_usd: number | null;
  currency: string | null;
  continent_id: string | null;
  created_at: string;
  continents: { name: string } | null;
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
    });
    setEditDialogOpen(true);
  };

  const handleDelete = async (country: CountryRow) => {
    if (!confirm(`Delete "${country.name}"? This will affect related data.`)) return;
    try {
      const { error } = await api.from('countries').delete().eq('id', country.id);
      if (error) throw error;
      toast({ title: 'Success', description: `${country.name} deleted` });
      invalidateTable();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete country', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!editingCountry) return;
    try {
      const { error } = await api
        .from('countries')
        .update({
          name: formData.name,
          code: formData.code,
          capital: formData.capital,
          population: formData.population ? parseInt(formData.population) : null,
          area_km2: formData.area_km2 ? parseFloat(formData.area_km2) : null,
          gdp_usd: formData.gdp_usd ? parseFloat(formData.gdp_usd) : null,
          currency: formData.currency,
        })
        .eq('id', editingCountry.id);
      if (error) throw error;
      toast({ title: 'Success', description: `${formData.name} updated` });
      setEditDialogOpen(false);
      setEditingCountry(null);
      invalidateTable();
    } catch {
      toast({ title: 'Error', description: 'Failed to update country', variant: 'destructive' });
    }
  };

  const handleExportExcel = async () => {
    const cols: ExportColumnDef<any>[] = [
      { header: 'Name', accessor: (r) => r.name },
      { header: 'Code', accessor: (r) => r.code },
      { header: 'Continent', accessor: (r) => r.continents?.name },
      { header: 'Capital', accessor: (r) => r.capital },
      { header: 'Population', accessor: (r) => r.population },
      { header: 'Area (km2)', accessor: (r) => r.area_km2 },
      { header: 'GDP (USD)', accessor: (r) => r.gdp_usd },
      { header: 'Currency', accessor: (r) => r.currency },
    ];
    const allData = await fetchAllRows('countries', '*, continents(name)', {
      column: 'name',
      ascending: true,
    });
    await exportToExcel(allData, cols, generateFilename('countries'));
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Country',
        cell: (info) => (
          <Box>
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            {info.row.original.code && (
              <Typography variant="body2" color="text.secondary">
                {info.row.original.code}
              </Typography>
            )}
          </Box>
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
      columnHelper.accessor('capital', {
        header: 'Capital',
        cell: (info) => info.getValue() || '-',
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('population', {
        header: 'Population',
        cell: (info) => fmtNum(info.getValue()),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
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
    ],
    [],
  );

  const tableConfig: AdminTableConfig<CountryRow> = useMemo(
    () => ({
      tableName: 'countries',
      select:
        'id,name,code,capital,population,area_km2,gdp_usd,currency,continent_id,created_at,continents(name)',
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
    [columns],
  );

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Countries Management
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage countries, their information, and geographical data
        </Typography>
      </Box>

      <AdminDataTable config={tableConfig} />

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent style={{ maxWidth: 672 }}>
          <DialogHeader>
            <DialogTitle>Edit Country</DialogTitle>
          </DialogHeader>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, py: 2 }}>
            <Box>
              <Label>Country Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              />
            </Box>
            <Box>
              <Label>Country Code</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                maxLength={3}
              />
            </Box>
            <Box>
              <Label>Capital City</Label>
              <Input
                value={formData.capital}
                onChange={(e) => setFormData((p) => ({ ...p, capital: e.target.value }))}
              />
            </Box>
            <Box>
              <Label>Currency</Label>
              <Input
                value={formData.currency}
                onChange={(e) => setFormData((p) => ({ ...p, currency: e.target.value }))}
              />
            </Box>
            <Box>
              <Label>Population</Label>
              <Input
                type="number"
                value={formData.population}
                onChange={(e) => setFormData((p) => ({ ...p, population: e.target.value }))}
              />
            </Box>
            <Box>
              <Label>Area (km2)</Label>
              <Input
                type="number"
                value={formData.area_km2}
                onChange={(e) => setFormData((p) => ({ ...p, area_km2: e.target.value }))}
              />
            </Box>
            <Box sx={{ gridColumn: 'span 2' }}>
              <Label>GDP (USD)</Label>
              <Input
                type="number"
                value={formData.gdp_usd}
                onChange={(e) => setFormData((p) => ({ ...p, gdp_usd: e.target.value }))}
              />
            </Box>
          </Box>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
