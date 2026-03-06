import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MuiSelect from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
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
import { useAuth } from '@/hooks/useAuth';
import { useHotels, type Hotel } from '@/hooks/useHotels';
import { useAddressResolver } from '@/hooks/useAddressResolver';
import { LocationAutocomplete } from '@/components/ui/location-autocomplete';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDateTime,
  formatBoolean,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, Star, Hotel as HotelIcon, Plus } from 'lucide-react';
import { toast } from 'sonner';

const HOTEL_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'bnb', label: 'B&B' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'guesthouse', label: 'Guesthouse' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'resort', label: 'Resort' },
  { value: 'other', label: 'Other' },
];

interface HotelRow {
  id: string;
  name: string;
  description: string | null;
  hotel_type: string;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  booking_url: string | null;
  price_range: number | null;
  star_rating: number | null;
  queer_safety_notes: string | null;
  lgbtq_friendly: boolean;
  featured: boolean;
  verified: boolean;
  created_at: string;
}

const columnHelper = createColumnHelper<HotelRow>();

const emptyForm = {
  name: '',
  description: '',
  hotel_type: 'hotel' as string,
  address: '',
  city: '',
  country: '',
  latitude: '',
  longitude: '',
  website: '',
  phone: '',
  email: '',
  booking_url: '',
  price_range: '',
  star_rating: '',
  queer_safety_notes: '',
  lgbtq_friendly: true,
  featured: false,
  verified: false,
};

export default function AdminHotels() {
  const { user } = useAuth();
  const { createHotel, updateHotel, deleteHotel } = useHotels();
  const { resolveAddress } = useAddressResolver();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHotel, setEditingHotel] = useState<HotelRow | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const invalidateTable = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'hotels'] });

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingHotel(null);
  };

  const handleEdit = (hotel: HotelRow) => {
    setEditingHotel(hotel);
    setFormData({
      name: hotel.name || '',
      description: hotel.description || '',
      hotel_type: hotel.hotel_type || 'hotel',
      address: hotel.address || '',
      city: hotel.city || '',
      country: hotel.country || '',
      latitude: hotel.latitude != null ? String(hotel.latitude) : '',
      longitude: hotel.longitude != null ? String(hotel.longitude) : '',
      website: hotel.website || '',
      phone: hotel.phone || '',
      email: hotel.email || '',
      booking_url: hotel.booking_url || '',
      price_range: hotel.price_range != null ? String(hotel.price_range) : '',
      star_rating: hotel.star_rating != null ? String(hotel.star_rating) : '',
      queer_safety_notes: hotel.queer_safety_notes || '',
      lgbtq_friendly: hotel.lgbtq_friendly ?? true,
      featured: hotel.featured ?? false,
      verified: hotel.verified ?? false,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (hotel: HotelRow) => {
    if (!confirm(`Delete "${hotel.name}"?`)) return;
    try {
      await deleteHotel(hotel.id);
      toast.success('Hotel deleted');
      invalidateTable();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }

    const payload: Record<string, unknown> = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      hotel_type: formData.hotel_type,
      address: formData.address.trim() || null,
      city: formData.city.trim() || null,
      country: formData.country.trim() || null,
      latitude: formData.latitude ? Number(formData.latitude) : null,
      longitude: formData.longitude ? Number(formData.longitude) : null,
      website: formData.website.trim() || null,
      phone: formData.phone.trim() || null,
      email: formData.email.trim() || null,
      booking_url: formData.booking_url.trim() || null,
      price_range: formData.price_range ? Number(formData.price_range) : null,
      star_rating: formData.star_rating ? Number(formData.star_rating) : null,
      queer_safety_notes: formData.queer_safety_notes.trim() || null,
      lgbtq_friendly: formData.lgbtq_friendly,
      featured: formData.featured,
      verified: formData.verified,
    };
    if ((formData as any).city_id) payload.city_id = (formData as any).city_id;
    if ((formData as any).country_id) payload.country_id = (formData as any).country_id;

    try {
      if (editingHotel) {
        await updateHotel(editingHotel.id, payload as any);
        toast.success('Hotel updated');
      } else {
        payload.created_by = user?.id;
        await createHotel(payload as any);
        toast.success('Hotel created');
      }
      resetForm();
      setIsDialogOpen(false);
      invalidateTable();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    }
  };

  const handleExportExcel = async () => {
    const columns: ExportColumnDef<any>[] = [
      { header: 'Name', accessor: (r) => r.name },
      { header: 'Hotel Type', accessor: (r) => r.hotel_type },
      { header: 'City', accessor: (r) => r.city },
      { header: 'Country', accessor: (r) => r.country },
      { header: 'Star Rating', accessor: (r) => r.star_rating },
      { header: 'LGBTQ Friendly', accessor: (r) => formatBoolean(r.lgbtq_friendly) },
      { header: 'Featured', accessor: (r) => formatBoolean(r.featured) },
      { header: 'Verified', accessor: (r) => formatBoolean(r.verified) },
      { header: 'Website', accessor: (r) => r.website },
      { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
    ];
    const allData = await fetchAllRows('hotels', '*', { column: 'name', ascending: true });
    await exportToExcel(allData, columns, generateFilename('hotels'));
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <Box>
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            <Typography variant="body2" color="text.secondary">
              {HOTEL_TYPES.find((t) => t.value === info.row.original.hotel_type)?.label ||
                info.row.original.hotel_type}
              {info.row.original.star_rating && ` · ${info.row.original.star_rating}★`}
            </Typography>
          </Box>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('city', {
        header: 'City',
        cell: (info) => {
          const h = info.row.original;
          return [h.city, h.country].filter(Boolean).join(', ') || '-';
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('hotel_type', {
        header: 'Type',
        cell: (info) => (
          <Badge variant="outline">
            {HOTEL_TYPES.find((t) => t.value === info.getValue())?.label || info.getValue()}
          </Badge>
        ),
        meta: {
          serverSortable: true,
          serverFilterable: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('lgbtq_friendly', {
        header: 'LGBTQ+',
        cell: (info) =>
          info.getValue() ? (
            <Badge style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>LGBTQ+</Badge>
          ) : null,
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
      columnHelper.accessor('verified', {
        header: 'Verified',
        cell: (info) => (info.getValue() ? <Badge variant="outline">Verified</Badge> : null),
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

  const tableConfig: AdminTableConfig<HotelRow> = useMemo(
    () => ({
      tableName: 'hotels',
      select:
        'id,name,description,hotel_type,address,city,country,latitude,longitude,website,phone,email,booking_url,price_range,star_rating,queer_safety_notes,lgbtq_friendly,featured,verified,created_at',
      columns,
      defaultSort: { column: 'name', direction: 'asc' },
      defaultPageSize: 50,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name', 'city', 'country'],
      entityFilters: [
        {
          key: 'hotel_type',
          label: 'Type',
          type: 'select',
          column: 'hotel_type',
          options: HOTEL_TYPES,
        },
        { key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' },
        { key: 'verified', label: 'Verified', type: 'boolean', column: 'verified' },
        { key: 'lgbtq_friendly', label: 'LGBTQ+', type: 'boolean', column: 'lgbtq_friendly' },
      ],
      bulkEditFields: [
        {
          key: 'hotel_type',
          label: 'Hotel Type',
          type: 'select',
          column: 'hotel_type',
          options: HOTEL_TYPES,
        },
        { key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' },
        { key: 'verified', label: 'Verified', type: 'boolean', column: 'verified' },
        {
          key: 'lgbtq_friendly',
          label: 'LGBTQ+ Friendly',
          type: 'boolean',
          column: 'lgbtq_friendly',
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
      toolbarActions: (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <ExportExcelButton onExport={handleExportExcel} />
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setIsDialogOpen(true);
            }}
          >
            <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
            Add Hotel
          </Button>
        </Box>
      ),
    }),
    [columns],
  );

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Hotels & BnBs
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage LGBTQ+ friendly accommodations
        </Typography>
      </Box>

      <AdminDataTable config={tableConfig} />

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent style={{ maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
          <DialogHeader>
            <DialogTitle>{editingHotel ? 'Edit Hotel' : 'Add New Hotel'}</DialogTitle>
          </DialogHeader>
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}
          >
            <TextField
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              required
              fullWidth
              size="small"
            />
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              multiline
              rows={3}
              fullWidth
              size="small"
            />
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <MuiSelect
                value={formData.hotel_type}
                label="Type"
                onChange={(e) => setFormData((p) => ({ ...p, hotel_type: e.target.value }))}
              >
                {HOTEL_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </MuiSelect>
            </FormControl>
            <LocationAutocomplete
              value={formData.address}
              onChange={async (address, coordinates, components) => {
                setFormData((p) => ({
                  ...p,
                  address,
                  latitude: coordinates ? String(coordinates.lat) : p.latitude,
                  longitude: coordinates ? String(coordinates.lng) : p.longitude,
                  ...(components?.city ? { city: components.city } : {}),
                  ...(components?.country ? { country: components.country } : {}),
                }));
                if (components?.country) {
                  const resolved = await resolveAddress(
                    components.city,
                    components.country,
                    coordinates?.lat,
                    coordinates?.lng,
                  );
                  if (resolved) {
                    setFormData((p) => ({
                      ...p,
                      ...(resolved.city_name ? { city: resolved.city_name } : {}),
                      ...(resolved.country_name ? { country: resolved.country_name } : {}),
                      city_id: resolved.city_id || '',
                      country_id: resolved.country_id || '',
                    }));
                  }
                }
              }}
              placeholder="Search for hotel address..."
              label="Address"
            />
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                label="City"
                value={formData.city}
                onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
                fullWidth
                size="small"
              />
              <TextField
                label="Country"
                value={formData.country}
                onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
                fullWidth
                size="small"
              />
            </Box>
            <TextField
              label="Website"
              value={formData.website}
              onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              label="Booking URL"
              value={formData.booking_url}
              onChange={(e) => setFormData((p) => ({ ...p, booking_url: e.target.value }))}
              fullWidth
              size="small"
            />
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                label="Phone"
                value={formData.phone}
                onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                fullWidth
                size="small"
              />
              <TextField
                label="Email"
                value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                fullWidth
                size="small"
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                label="Star Rating"
                value={formData.star_rating}
                onChange={(e) => setFormData((p) => ({ ...p, star_rating: e.target.value }))}
                type="number"
                fullWidth
                size="small"
                inputProps={{ min: 1, max: 5, step: 0.5 }}
              />
              <TextField
                label="Price Range (1-4)"
                value={formData.price_range}
                onChange={(e) => setFormData((p) => ({ ...p, price_range: e.target.value }))}
                type="number"
                fullWidth
                size="small"
                inputProps={{ min: 1, max: 4 }}
              />
            </Box>
            <TextField
              label="Queer Safety Notes"
              value={formData.queer_safety_notes}
              onChange={(e) => setFormData((p) => ({ ...p, queer_safety_notes: e.target.value }))}
              multiline
              rows={2}
              fullWidth
              size="small"
            />
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.lgbtq_friendly}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, lgbtq_friendly: e.target.checked }))
                    }
                    size="small"
                  />
                }
                label="LGBTQ+ Friendly"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.featured}
                    onChange={(e) => setFormData((p) => ({ ...p, featured: e.target.checked }))}
                    size="small"
                  />
                }
                label="Featured"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.verified}
                    onChange={(e) => setFormData((p) => ({ ...p, verified: e.target.checked }))}
                    size="small"
                  />
                }
                label="Verified"
              />
            </Box>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  resetForm();
                  setIsDialogOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit">{editingHotel ? 'Update Hotel' : 'Add Hotel'}</Button>
            </DialogFooter>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
