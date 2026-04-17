import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useAuth } from '@/hooks/useAuth';
import { useVenues } from '@/hooks/useVenues';
import { useToast } from '@/hooks/use-toast';
import { useAddressResolver } from '@/hooks/useAddressResolver';
import { supabase } from '@/integrations/supabase/client';
import {
  LocationAutocomplete,
  type AddressComponents,
} from '@/components/ui/location-autocomplete';
import { VenueImageUpload } from '@/components/venues/VenueImageUpload';
import { VenueEnrichmentPreview } from '@/components/admin/venues/VenueEnrichmentPreview';
import { VenuesCsvImport } from '@/components/venues/VenuesCsvImport';
import { VenueImportDialog } from '@/components/admin/venues/VenueImportDialog';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDateTime,
  formatArray,
  formatBoolean,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import {
  Edit,
  Trash2,
  Plus,
  Star,
  MapPin,
  Search,
  Check,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';

interface VenueRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  featured: boolean;
  verified: boolean;
  price_range: number | null;
  foursquare_rating: number | null;
  latitude: number | null;
  longitude: number | null;
  amenities: string[] | null;
  tags: string[] | null;
  images: string[] | null;
  city_id: string | null;
  country_id: string | null;
  created_at: string;
  created_by: string | null;
}

const columnHelper = createColumnHelper<VenueRow>();

const venueCategories = [
  'restaurant',
  'bar',
  'cafe',
  'hotel',
  'club',
  'theater',
  'museum',
  'gallery',
  'park',
  'gym',
  'spa',
  'shop',
  'other',
];

const commonAmenities = [
  'WiFi',
  'Parking',
  'Wheelchair Accessible',
  'Pet Friendly',
  'Outdoor Seating',
  'Live Music',
  'Air Conditioning',
  'Heating',
  'Private Dining',
  'Takeout',
  'Delivery',
  'Reservations',
];

export default function AdminVenues() {
  const _navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, canManageContent } = useAdminRoles();
  const { createVenue, updateVenue, deleteVenue, refetch } = useVenues(false);
  const { toast } = useToast();
  const { resolveAddress } = useAddressResolver();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<VenueRow | null>(null);
  const [isEnrichingVenue, setIsEnrichingVenue] = useState(false);
  const [enrichmentResults, setEnrichmentResults] = useState<Record<string, unknown>[]>([]);
  const [showEnrichmentPreview, setShowEnrichmentPreview] = useState(false);
  const [enrichmentVenueName, setEnrichmentVenueName] = useState('');
  const [importDialog, setImportDialog] = useState<{
    open: boolean;
    provider: 'foursquare' | 'google-places' | 'tomtom' | 'tripadvisor' | null;
  }>({ open: false, provider: null });
  const [isImporting, setIsImporting] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    address: '',
    city: '',
    state: '',
    country: 'US',
    postal_code: '',
    phone: '',
    email: '',
    website: '',
    instagram: '',
    price_range: '1',
    featured: false,
    verified: false,
    latitude: '',
    longitude: '',
    amenities: [] as string[],
    tags: [] as string[],
    images: [] as string[],
    city_id: undefined as string | undefined,
    country_id: undefined as string | undefined,
  });

  // --- Form handlers ---
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: '',
      address: '',
      city: '',
      state: '',
      country: 'US',
      postal_code: '',
      phone: '',
      email: '',
      website: '',
      instagram: '',
      price_range: '1',
      featured: false,
      verified: false,
      latitude: '',
      longitude: '',
      amenities: [],
      tags: [],
      images: [],
      city_id: undefined,
      country_id: undefined,
    });
    setEditingVenue(null);
  };

  const handleEditVenue = (venue: VenueRow) => {
    setEditingVenue(venue);
    setFormData({
      name: venue.name || '',
      description: venue.description || '',
      category: venue.category || '',
      address: venue.address || '',
      city: venue.city || '',
      state: venue.state || '',
      country: venue.country || 'US',
      postal_code: venue.postal_code || '',
      phone: venue.phone || '',
      email: venue.email || '',
      website: venue.website || '',
      instagram: venue.instagram || '',
      price_range: venue.price_range?.toString() || '1',
      featured: venue.featured || false,
      verified: venue.verified || false,
      latitude: venue.latitude?.toString() || '',
      longitude: venue.longitude?.toString() || '',
      amenities: venue.amenities || [],
      tags: venue.tags || [],
      images: venue.images || [],
      city_id: venue.city_id ?? undefined,
      country_id: venue.country_id ?? undefined,
    });
    setIsCreateDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Venue name is required',
        variant: 'destructive',
      });
      return;
    }
    try {
      const venueData: Record<string, unknown> = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        country: formData.country.trim() || null,
        postal_code: formData.postal_code.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        website: formData.website.trim() || null,
        instagram: formData.instagram.trim() || null,
        category: formData.category || null,
        tags: formData.tags.length > 0 ? formData.tags : [],
        amenities: formData.amenities.length > 0 ? formData.amenities : [],
        price_range: formData.price_range ? parseInt(formData.price_range) : null,
        latitude: formData.latitude?.trim() ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude?.trim() ? parseFloat(formData.longitude) : null,
        images: formData.images.length > 0 ? formData.images : [],
        featured: formData.featured,
        verified: formData.verified,
        created_by: user?.id,
      };
      if (formData.city_id) venueData.city_id = formData.city_id;
      if (formData.country_id) venueData.country_id = formData.country_id;

      const result = editingVenue
        ? await updateVenue(editingVenue.id, venueData)
        : await createVenue(venueData);
      if (result.error) throw new Error(result.error);

      toast({ title: 'Success', description: editingVenue ? 'Venue updated' : 'Venue created' });
      resetForm();
      setIsCreateDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save venue',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteVenue = async (venue: VenueRow) => {
    if (!confirm(`Delete "${venue.name}"?`)) return;
    try {
      const { error } = await deleteVenue(venue.id);
      if (error) throw new Error(error);
      toast({ title: 'Success', description: 'Venue deleted' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete venue', variant: 'destructive' });
    }
  };

  // --- Import handlers ---
  const handleImport = async (provider: string, fnName: string, config?: Record<string, unknown>) => {
    setIsImporting((prev) => ({ ...prev, [provider]: true }));
    try {
      toast({ title: 'Import Started', description: `${provider} import triggered...` });
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: config ?? { trigger: 'manual' },
      });
      if (error) throw error;
      toast({ title: 'Import Completed', description: data.message });
    } catch {
      toast({
        title: 'Import Failed',
        description: `Failed to import from ${provider}`,
        variant: 'destructive',
      });
    } finally {
      setIsImporting((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleImportDialogSubmit = (config: Record<string, unknown>) => {
    const fnMap: Record<string, string> = {
      foursquare: 'import-foursquare-venues',
      tripadvisor: 'import-tripadvisor-venues',
      tomtom: 'import-tomtom-venues',
      'google-places': 'import-google-places-venues',
    };
    if (importDialog.provider) {
      handleImport(importDialog.provider, fnMap[importDialog.provider], config);
    }
    setImportDialog({ open: false, provider: null });
  };

  // --- Address resolution ---
  const handleAddressComponents = async (
    components: AddressComponents | undefined,
    coordinates?: { lat: number; lng: number },
  ) => {
    if (!components) return;
    setFormData((prev) => ({
      ...prev,
      city: components.city || prev.city,
      state: components.state || prev.state,
      country: components.country || prev.country,
      postal_code: components.postcode || prev.postal_code,
    }));
    if (components.country) {
      const resolved = await resolveAddress(
        components.city,
        components.country,
        coordinates?.lat,
        coordinates?.lng,
      );
      if (resolved) {
        setFormData((prev) => ({
          ...prev,
          ...(resolved.city_id ? { city_id: resolved.city_id } : {}),
          ...(resolved.country_id ? { country_id: resolved.country_id } : {}),
          ...(resolved.city_name ? { city: resolved.city_name } : {}),
          ...(resolved.country_name ? { country: resolved.country_name } : {}),
        }));
        if (resolved.created) {
          toast({
            title: 'New City Created',
            description: `"${resolved.city_name}" added to database.`,
          });
        }
      }
    }
  };

  // --- Enrichment ---
  const handleEnrichVenue = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Enter a venue name first', variant: 'destructive' });
      return;
    }
    setIsEnrichingVenue(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-venue', {
        body: { venueName: formData.name, currentData: formData },
      });
      if (error) throw error;
      if (data?.individualResults?.length > 0) {
        setEnrichmentResults(data.individualResults);
        setEnrichmentVenueName(formData.name);
        setShowEnrichmentPreview(true);
      } else {
        toast({
          title: 'No Results',
          description: 'No enrichment data found',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to enrich venue', variant: 'destructive' });
    } finally {
      setIsEnrichingVenue(false);
    }
  };

  const handleSelectEnrichmentResult = (selectedData: Record<string, unknown>) => {
    const updated = { ...formData };
    Object.entries(selectedData).forEach(([key, value]) => {
      if (
        value &&
        (!updated[key as keyof typeof updated] || updated[key as keyof typeof updated] === '')
      ) {
        (updated as Record<string, unknown>)[key] = value;
      }
    });
    setFormData(updated);
    setShowEnrichmentPreview(false);
    toast({ title: 'Success', description: 'Venue data enriched' });
  };

  // --- Export ---
  const handleExportExcel = async () => {
    const cols: ExportColumnDef<Record<string, unknown>>[] = [
      { header: 'Name', accessor: (r) => r.name },
      { header: 'Category', accessor: (r) => r.category },
      { header: 'Address', accessor: (r) => r.address },
      { header: 'City', accessor: (r) => r.city },
      { header: 'State', accessor: (r) => r.state },
      { header: 'Country', accessor: (r) => r.country },
      { header: 'Phone', accessor: (r) => r.phone },
      { header: 'Email', accessor: (r) => r.email },
      { header: 'Website', accessor: (r) => r.website },
      { header: 'Instagram', accessor: (r) => r.instagram },
      { header: 'Featured', accessor: (r) => formatBoolean(r.featured) },
      { header: 'Verified', accessor: (r) => formatBoolean(r.verified) },
      { header: 'Rating', accessor: (r) => r.foursquare_rating },
      { header: 'Price Range', accessor: (r) => r.price_range },
      { header: 'Tags', accessor: (r) => formatArray(r.tags) },
      { header: 'Amenities', accessor: (r) => formatArray(r.amenities) },
      { header: 'Latitude', accessor: (r) => r.latitude },
      { header: 'Longitude', accessor: (r) => r.longitude },
      { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
    ];
    const allData = await fetchAllRows('venues', '*', { column: 'name', ascending: true });
    await exportToExcel(allData, cols, generateFilename('venues'));
  };

  // --- Columns ---
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <Box>
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            {info.row.original.address && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                {info.row.original.address}
              </Typography>
            )}
          </Box>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: (info) => {
          const val = info.getValue();
          return val ? (
            <Badge variant="secondary">{val.charAt(0).toUpperCase() + val.slice(1)}</Badge>
          ) : (
            '-'
          );
        },
        meta: {
          serverSortable: true,
          serverFilterable: true,
          groupable: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('city', {
        header: 'City',
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
        meta: {
          serverSortable: true,
          serverFilterable: true,
          groupable: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('country', {
        header: 'Country',
        cell: (info) => info.getValue() || '-',
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
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
        meta: {
          serverSortable: true,
          serverFilterable: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('verified', {
        header: 'Verified',
        cell: (info) =>
          info.getValue() ? (
            <Badge style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
              <Check style={{ height: 12, width: 12, marginRight: 4 }} />
              Verified
            </Badge>
          ) : null,
        meta: {
          serverSortable: true,
          serverFilterable: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('foursquare_rating', {
        header: 'Rating',
        cell: (info) => {
          const val = info.getValue();
          return val ? `${val.toFixed(1)}/10` : '-';
        },
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('price_range', {
        header: 'Price',
        cell: (info) => {
          const val = info.getValue();
          return val ? '$'.repeat(val) : '-';
        },
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

  // --- Table config ---
  const tableConfig: AdminTableConfig<VenueRow> = useMemo(
    () => ({
      tableName: 'venues',
      select:
        'id,name,description,category,address,city,state,country,postal_code,phone,email,website,instagram,featured,verified,price_range,foursquare_rating,latitude,longitude,amenities,tags,images,city_id,country_id,created_at,created_by',
      columns,
      defaultSort: { column: 'name', direction: 'asc' as const },
      defaultPageSize: 50,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name', 'address', 'city', 'description'],
      entityFilters: [
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          column: 'category',
          options: venueCategories.map((c) => ({
            value: c,
            label: c.charAt(0).toUpperCase() + c.slice(1),
          })),
        },
        {
          key: 'city',
          label: 'City',
          type: 'select',
          column: 'city',
          dynamicOptions: { tableName: 'venues', column: 'city' },
        },
        {
          key: 'featured',
          label: 'Featured',
          type: 'boolean',
          column: 'featured',
        },
        {
          key: 'verified',
          label: 'Verified',
          type: 'boolean',
          column: 'verified',
        },
      ],
      bulkEditFields: [
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          column: 'category',
          options: venueCategories.map((c) => ({
            value: c,
            label: c.charAt(0).toUpperCase() + c.slice(1),
          })),
        },
        { key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' },
        { key: 'verified', label: 'Verified', type: 'boolean', column: 'verified' },
      ],
      rowActions: [
        {
          key: 'edit',
          label: 'Edit',
          icon: Edit,
          onClick: handleEditVenue,
        },
        {
          key: 'website',
          label: 'Visit Website',
          icon: ExternalLink,
          onClick: (v) => window.open(v.website!, '_blank'),
          visible: (v) => !!v.website,
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          variant: 'destructive',
          onClick: handleDeleteVenue,
        },
      ],
      toolbarActions: (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {(['foursquare', 'tripadvisor', 'tomtom', 'google-places'] as const).map((provider) => (
            <Button
              key={provider}
              variant="secondary"
              size="sm"
              disabled={!!isImporting[provider]}
              style={{ fontSize: '0.75rem' }}
              onClick={() => setImportDialog({ open: true, provider })}
            >
              <Search style={{ height: 12, width: 12, marginRight: 4 }} />
              {isImporting[provider]
                ? 'Importing...'
                : provider.charAt(0).toUpperCase() + provider.slice(1).replace('-', ' ')}
            </Button>
          ))}
          <VenuesCsvImport onImportComplete={refetch} />
          <ExportExcelButton onExport={handleExportExcel} />
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus style={{ height: 14, width: 14, marginRight: 4 }} />
            Add Venue
          </Button>
        </Box>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDeleteVenue/refetch are stable, adding would defeat memoization
    [columns, isImporting],
  );

  if (!isAdmin && !canManageContent()) {
    return (
      <Container maxWidth="lg" sx={{ px: 2, py: 4 }}>
        <Box sx={{ textAlign: 'center' }}>
          <AlertCircle
            style={{
              height: 48,
              width: 48,
              margin: '0 auto',
              color: 'var(--destructive)',
              marginBottom: 16,
            }}
          />
          <Typography variant="h6" sx={{ mb: 1 }}>
            Access Denied
          </Typography>
          <Typography color="text.secondary">
            You don't have permission to access this page.
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container
      maxWidth={false}
      sx={{ px: 3, py: 4, display: 'flex', flexDirection: 'column', gap: 3 }}
    >
      <Box>
        <Typography variant="h4">Venues Management</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          Manage venues and locations ({venueCategories.length} categories)
        </Typography>
      </Box>

      <AdminDataTable config={tableConfig} />

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVenue ? 'Edit Venue' : 'Add New Venue'}</DialogTitle>
          </DialogHeader>
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
          >
            {/* Basic Info */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Basic Information
                </Typography>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleEnrichVenue}
                  disabled={isEnrichingVenue || !formData.name.trim()}
                  style={{ fontSize: '0.875rem' }}
                >
                  {isEnrichingVenue ? 'Enriching...' : 'Enrich Venue'}
                </Button>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Label htmlFor="name">Venue Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </Box>
                <Box>
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, category: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {venueCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c.charAt(0).toUpperCase() + c.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Box>
              </Box>
              <Box>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={3}
                />
              </Box>
            </Box>

            {/* Location */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Location
              </Typography>
              <LocationAutocomplete
                value={formData.address}
                onChange={(address, coordinates, components) => {
                  setFormData((prev) => ({
                    ...prev,
                    address,
                    latitude: coordinates ? coordinates.lat.toString() : '',
                    longitude: coordinates ? coordinates.lng.toString() : '',
                  }));
                  if (components) handleAddressComponents(components, coordinates);
                }}
                required
                placeholder="Enter full address"
              />
              {formData.latitude && formData.longitude && (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box>
                    <Label>Latitude</Label>
                    <Input
                      value={formData.latitude}
                      readOnly
                      style={{ backgroundColor: 'var(--muted)' }}
                    />
                  </Box>
                  <Box>
                    <Label>Longitude</Label>
                    <Input
                      value={formData.longitude}
                      readOnly
                      style={{ backgroundColor: 'var(--muted)' }}
                    />
                  </Box>
                </Box>
              )}
              <details>
                <Box
                  component="summary"
                  sx={{ fontSize: '0.875rem', color: 'text.secondary', cursor: 'pointer' }}
                >
                  Manual location override
                </Box>
                <Box
                  sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 2, pt: 1 }}
                >
                  <Box>
                    <Label>City</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                    />
                  </Box>
                  <Box>
                    <Label>State</Label>
                    <Input
                      value={formData.state}
                      onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
                    />
                  </Box>
                  <Box>
                    <Label>Country</Label>
                    <Input
                      value={formData.country}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, country: e.target.value }))
                      }
                    />
                  </Box>
                  <Box>
                    <Label>Postal Code</Label>
                    <Input
                      value={formData.postal_code}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, postal_code: e.target.value }))
                      }
                    />
                  </Box>
                </Box>
              </details>
            </Box>

            {/* Contact */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Contact
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </Box>
                <Box>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </Box>
                <Box>
                  <Label>Website</Label>
                  <Input
                    value={formData.website}
                    onChange={(e) => setFormData((prev) => ({ ...prev, website: e.target.value }))}
                  />
                </Box>
                <Box>
                  <Label>Instagram</Label>
                  <Input
                    value={formData.instagram}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, instagram: e.target.value }))
                    }
                  />
                </Box>
              </Box>
            </Box>

            {/* Settings */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Settings
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                <Box>
                  <Label>Price Range</Label>
                  <Select
                    value={formData.price_range}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, price_range: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">$ - Budget</SelectItem>
                      <SelectItem value="2">$$ - Moderate</SelectItem>
                      <SelectItem value="3">$$$ - Expensive</SelectItem>
                      <SelectItem value="4">$$$$ - Very Expensive</SelectItem>
                    </SelectContent>
                  </Select>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id="featured"
                    checked={formData.featured}
                    onCheckedChange={(c) =>
                      setFormData((prev) => ({ ...prev, featured: c as boolean }))
                    }
                  />
                  <Label htmlFor="featured">Featured</Label>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id="verified"
                    checked={formData.verified}
                    onCheckedChange={(c) =>
                      setFormData((prev) => ({ ...prev, verified: c as boolean }))
                    }
                  />
                  <Label htmlFor="verified">Verified</Label>
                </Box>
              </Box>
            </Box>

            {/* Tags */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Tags &amp; Amenities
              </Typography>
              <Box>
                <Label>Tags</Label>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1, mt: 0.5 }}>
                  {formData.tags.map((tag, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            tags: prev.tags.filter((_, idx) => idx !== i),
                          }))
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          lineHeight: 1,
                        }}
                      >
                        &times;
                      </button>
                    </Badge>
                  ))}
                </Box>
                <Input
                  placeholder="Add tags (Enter)"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = e.currentTarget.value.trim();
                      if (v && !formData.tags.includes(v)) {
                        setFormData((prev) => ({ ...prev, tags: [...prev.tags, v] }));
                        e.currentTarget.value = '';
                      }
                    }
                  }}
                />
              </Box>
              <Box>
                <Label>Amenities</Label>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1, mt: 0.5 }}>
                  {formData.amenities.map((a, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {a}
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            amenities: prev.amenities.filter((_, idx) => idx !== i),
                          }))
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          lineHeight: 1,
                        }}
                      >
                        &times;
                      </button>
                    </Badge>
                  ))}
                </Box>
                <Input
                  placeholder="Add amenities (Enter)"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = e.currentTarget.value.trim();
                      if (v && !formData.amenities.includes(v)) {
                        setFormData((prev) => ({ ...prev, amenities: [...prev.amenities, v] }));
                        e.currentTarget.value = '';
                      }
                    }
                  }}
                />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {commonAmenities.map((a) => (
                    <Button
                      key={a}
                      type="button"
                      variant="outline"
                      size="sm"
                      style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                      disabled={formData.amenities.includes(a)}
                      onClick={() => {
                        if (!formData.amenities.includes(a))
                          setFormData((prev) => ({ ...prev, amenities: [...prev.amenities, a] }));
                      }}
                    >
                      {a}
                    </Button>
                  ))}
                </Box>
              </Box>
            </Box>

            <VenueImageUpload
              images={formData.images}
              onChange={(images) => setFormData((prev) => ({ ...prev, images }))}
              maxImages={8}
            />

            <Button type="submit" style={{ width: '100%' }}>
              {editingVenue ? 'Update Venue' : 'Add Venue'}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      {importDialog.provider && (
        <VenueImportDialog
          open={importDialog.open}
          onOpenChange={(open) => setImportDialog({ open, provider: importDialog.provider })}
          provider={importDialog.provider}
          onImport={handleImportDialogSubmit}
          isImporting={!!isImporting[importDialog.provider]}
        />
      )}

      {/* Enrichment Preview */}
      <VenueEnrichmentPreview
        isOpen={showEnrichmentPreview}
        onClose={() => setShowEnrichmentPreview(false)}
        results={enrichmentResults}
        onSelectResult={handleSelectEnrichmentResult}
        venueName={enrichmentVenueName}
      />
    </Container>
  );
}
