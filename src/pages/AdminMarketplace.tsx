import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useAuth } from '@/hooks/useAuth';
import { useMarketplace } from '@/hooks/useMarketplace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, ArrowLeft, Download, RefreshCw, Star, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDateTime,
  formatBoolean,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';

interface MarketplaceRow {
  id: string;
  title: string;
  business_name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  business_type: string | null;
  price: number | null;
  price_type: string | null;
  currency: string | null;
  location: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  featured: boolean;
  shipping_available: boolean;
  views_count: number | null;
  created_at: string;
}

const categories = [
  'food_beverage',
  'retail',
  'services',
  'health_wellness',
  'entertainment',
  'technology',
  'fashion',
  'home_garden',
  'other',
];

const businessTypes = [
  'restaurant',
  'retail_store',
  'service_provider',
  'online_business',
  'consultant',
  'freelancer',
  'startup',
  'established_business',
  'other',
];

const formatCategory = (c: string) => c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

const columnHelper = createColumnHelper<MarketplaceRow>();

export default function AdminMarketplace() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { createListing } = useMarketplace();
  const { toast } = useToast();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAwinImportOpen, setIsAwinImportOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importParams, setImportParams] = useState({
    csvUrl: '',
    maxProducts: 1000,
    skipRows: 0,
    batchSize: 100,
  });
  const [formData, setFormData] = useState({
    title: '',
    business_name: '',
    description: '',
    category: '',
    subcategory: '',
    business_type: '',
    price: '',
    price_type: 'fixed',
    currency: 'USD',
    location: '',
    website: '',
    contact_phone: '',
    contact_email: '',
    shipping_available: false,
    shipping_info: '',
    featured: false,
    tags: [] as string[],
  });

  const resetForm = () => {
    setFormData({
      title: '',
      business_name: '',
      description: '',
      category: '',
      subcategory: '',
      business_type: '',
      price: '',
      price_type: 'fixed',
      currency: 'USD',
      location: '',
      website: '',
      contact_phone: '',
      contact_email: '',
      shipping_available: false,
      shipping_info: '',
      featured: false,
      tags: [],
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await createListing({
        ...formData,
        price: formData.price ? parseFloat(formData.price) : null,
        created_by: user?.id,
      });
      if (error) throw new Error(error);
      toast({ title: 'Success', description: 'Listing created' });
      resetForm();
      setIsCreateDialogOpen(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to create listing', variant: 'destructive' });
    }
  };

  const handleAwinImport = async () => {
    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-awin-products', {
        body: importParams,
      });
      if (error) throw error;
      toast({ title: 'Import Successful', description: `Imported ${data.imported} products` });
      setIsAwinImportOpen(false);
    } catch (err: unknown) {
      toast({
        title: 'Import Failed',
        description: err instanceof Error ? err.message : 'Failed to import',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Title',
        cell: (info) => (
          <Box>
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {info.row.original.business_name}
            </Typography>
          </Box>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: (info) => <Badge variant="outline">{formatCategory(info.getValue())}</Badge>,
        meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('price', {
        header: 'Price',
        cell: (info) => {
          const price = info.getValue();
          const row = info.row.original;
          if (!price) return '-';
          const formatted = `${row.currency || 'USD'} ${price.toFixed(2)}`;
          return row.price_type && row.price_type !== 'fixed'
            ? `${formatted} (${row.price_type})`
            : formatted;
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('location', {
        header: 'Location',
        cell: (info) => {
          const val = info.getValue();
          return val ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <MapPin style={{ height: 12, width: 12 }} />
              {val}
            </Box>
          ) : (
            '-'
          );
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('featured', {
        header: 'Featured',
        cell: (info) =>
          info.getValue() ? (
            <Badge style={{ backgroundColor: '#f3e8ff', color: '#6b21a8' }}>
              <Star style={{ height: 12, width: 12, marginRight: 4 }} />
              Featured
            </Badge>
          ) : null,
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('business_type', {
        header: 'Business Type',
        cell: (info) => (info.getValue() ? formatCategory(info.getValue()!) : '-'),
        meta: {
          serverSortable: true,
          groupable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('views_count', {
        header: 'Views',
        cell: (info) => info.getValue() ?? 0,
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

  const tableConfig: AdminTableConfig<MarketplaceRow> = useMemo(
    () => ({
      tableName: 'marketplace_listings',
      select:
        'id,title,business_name,description,category,subcategory,business_type,price,price_type,currency,location,website,contact_email,contact_phone,featured,shipping_available,views_count,created_at',
      columns,
      defaultSort: { column: 'created_at', direction: 'desc' as const },
      defaultPageSize: 25,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['title', 'business_name', 'description'],
      entityFilters: [
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          column: 'category',
          options: categories.map((c) => ({ value: c, label: formatCategory(c) })),
        },
        { key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' },
        {
          key: 'business_type',
          label: 'Business Type',
          type: 'select',
          column: 'business_type',
          options: businessTypes.map((t) => ({ value: t, label: formatCategory(t) })),
        },
      ],
      bulkEditFields: [
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          column: 'category',
          options: categories.map((c) => ({ value: c, label: formatCategory(c) })),
        },
        { key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' },
      ],
      rowActions: [
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          variant: 'destructive' as const,
          onClick: async (row) => {
            if (!confirm(`Delete "${row.title}"?`)) return;
            try {
              const { error } = await supabase
                .from('marketplace_listings')
                .delete()
                .eq('id', row.id);
              if (error) throw error;
              toast({ title: 'Success', description: 'Listing deleted' });
            } catch {
              toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
            }
          },
        },
      ],
      toolbarActions: (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <ExportExcelButton
            onExport={async () => {
              const cols: ExportColumnDef<Record<string, unknown>>[] = [
                { header: 'Title', accessor: (r) => r.title },
                { header: 'Business Name', accessor: (r) => r.business_name },
                { header: 'Category', accessor: (r) => r.category },
                { header: 'Business Type', accessor: (r) => r.business_type },
                { header: 'Price', accessor: (r) => r.price },
                { header: 'Currency', accessor: (r) => r.currency },
                { header: 'Location', accessor: (r) => r.location },
                { header: 'Featured', accessor: (r) => formatBoolean(r.featured) },
                { header: 'Views', accessor: (r) => r.views_count },
                { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
              ];
              const allData = await fetchAllRows('marketplace_listings', '*', {
                column: 'title',
                ascending: true,
              });
              await exportToExcel(allData, cols, generateFilename('marketplace'));
            }}
          />
          <Button variant="outline" onClick={() => setIsAwinImportOpen(true)}>
            <Download style={{ height: 14, width: 14, marginRight: 4 }} /> Import from Awin
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus style={{ height: 14, width: 14, marginRight: 4 }} /> Create Listing
          </Button>
        </Box>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable in practice, adding would defeat memoization
    [columns],
  );

  if (rolesLoading) {
    return <Box sx={{ maxWidth: 'lg', mx: 'auto', p: 3, textAlign: 'center' }}>Loading...</Box>;
  }
  if (!canManageContent()) {
    return (
      <Box sx={{ maxWidth: 'lg', mx: 'auto', p: 3, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Access Denied
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{ maxWidth: 'lg', mx: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeft style={{ height: 16, width: 16 }} /> Back to Admin
        </Button>
        <div>
          <Typography variant="h4" component="h1" sx={{ fontSize: '1.875rem', fontWeight: 700 }}>
            Marketplace
          </Typography>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Manage marketplace listings and products
          </p>
        </div>
      </Box>

      <AdminDataTable config={tableConfig} />

      {/* Create Listing Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent style={{ maxWidth: 896, maxHeight: '90vh', overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle>Create New Listing</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <div>
                <Label>Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Business Name</Label>
                <Input
                  value={formData.business_name}
                  onChange={(e) => setFormData((p) => ({ ...p, business_name: e.target.value }))}
                  required
                />
              </div>
            </Box>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <div>
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData((p) => ({ ...p, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {formatCategory(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subcategory</Label>
                <Input
                  value={formData.subcategory}
                  onChange={(e) => setFormData((p) => ({ ...p, subcategory: e.target.value }))}
                />
              </div>
              <div>
                <Label>Business Type</Label>
                <Select
                  value={formData.business_type}
                  onValueChange={(v) => setFormData((p) => ({ ...p, business_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {businessTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {formatCategory(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <div>
                <Label>Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                />
              </div>
              <div>
                <Label>Price Type</Label>
                <Select
                  value={formData.price_type}
                  onValueChange={(v) => setFormData((p) => ({ ...p, price_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="negotiable">Negotiable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) => setFormData((p) => ({ ...p, currency: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <div>
                <Label>Phone</Label>
                <Input
                  value={formData.contact_phone}
                  onChange={(e) => setFormData((p) => ({ ...p, contact_phone: e.target.value }))}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData((p) => ({ ...p, contact_email: e.target.value }))}
                />
              </div>
              <div>
                <Label>Website</Label>
                <Input
                  value={formData.website}
                  onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
                  placeholder="City, State"
                />
              </div>
            </Box>
            <Box sx={{ display: 'flex', gap: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Checkbox
                  checked={formData.shipping_available}
                  onCheckedChange={(c) =>
                    setFormData((p) => ({ ...p, shipping_available: c as boolean }))
                  }
                />
                <Label>Shipping Available</Label>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Checkbox
                  checked={formData.featured}
                  onCheckedChange={(c) => setFormData((p) => ({ ...p, featured: c as boolean }))}
                />
                <Label>Featured</Label>
              </Box>
            </Box>
            <Button type="submit" style={{ width: '100%' }}>
              Create Listing
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Awin Import Dialog */}
      <Dialog open={isAwinImportOpen} onOpenChange={setIsAwinImportOpen}>
        <DialogContent style={{ maxWidth: 672 }}>
          <DialogHeader>
            <DialogTitle>Import from Awin CSV Feed</DialogTitle>
          </DialogHeader>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>
              <Label>Custom CSV Feed URL (Optional)</Label>
              <Input
                placeholder="https://productdata.awin.com/datafeed/download/..."
                value={importParams.csvUrl}
                onChange={(e) => setImportParams((p) => ({ ...p, csvUrl: e.target.value }))}
              />
            </div>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <div>
                <Label>Max Products</Label>
                <Input
                  type="number"
                  value={importParams.maxProducts}
                  onChange={(e) =>
                    setImportParams((p) => ({
                      ...p,
                      maxProducts: parseInt(e.target.value) || 1000,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Skip Rows</Label>
                <Input
                  type="number"
                  value={importParams.skipRows}
                  onChange={(e) =>
                    setImportParams((p) => ({ ...p, skipRows: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
              <div>
                <Label>Batch Size</Label>
                <Input
                  type="number"
                  value={importParams.batchSize}
                  onChange={(e) =>
                    setImportParams((p) => ({ ...p, batchSize: parseInt(e.target.value) || 100 }))
                  }
                />
              </div>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2 }}>
              <Button
                variant="outline"
                onClick={() => setIsAwinImportOpen(false)}
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button onClick={handleAwinImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <RefreshCw
                      style={{
                        height: 14,
                        width: 14,
                        marginRight: 4,
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download style={{ height: 14, width: 14, marginRight: 4 }} />
                    Import
                  </>
                )}
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
