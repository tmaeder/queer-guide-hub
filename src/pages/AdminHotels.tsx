import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useHotels } from '@/hooks/useHotels';
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
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, Star, Plus } from 'lucide-react';
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
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
    if ((formData as Record<string, unknown>).city_id) payload.city_id = (formData as Record<string, unknown>).city_id;
    if ((formData as Record<string, unknown>).country_id) payload.country_id = (formData as Record<string, unknown>).country_id;

    try {
      if (editingHotel) {
        await updateHotel(editingHotel.id, payload as Record<string, unknown>);
        toast.success('Hotel updated');
      } else {
        payload.created_by = user?.id;
        await createHotel(payload as Record<string, unknown>);
        toast.success('Hotel created');
      }
      resetForm();
      setIsDialogOpen(false);
      invalidateTable();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleExportExcel = async () => {
    const columns: ExportColumnDef<Record<string, unknown>>[] = [
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
          <div>
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            <p className="text-sm text-muted-foreground">
              {HOTEL_TYPES.find((t) => t.value === info.row.original.hotel_type)?.label ||
                info.row.original.hotel_type}
              {info.row.original.star_rating && ` · ${info.row.original.star_rating}★`}
            </p>
          </div>
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
        <div className="flex gap-1">
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
        </div>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDelete is stable in practice, adding would defeat memoization
    [columns],
  );

  return (
    <AdminEntityTable
      title="Hotels & BnBs"
      subtitle="Manage LGBTQ+ friendly accommodations"
      backHref={null}
      config={tableConfig}
      afterTable={
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent style={{ maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
          <DialogHeader>
            <DialogTitle>{editingHotel ? 'Edit Hotel' : 'Add New Hotel'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="hotel-name">Name *</Label>
              <Input
                id="hotel-name"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hotel-desc">Description</Label>
              <Textarea
                id="hotel-desc"
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Select
                value={formData.hotel_type}
                onValueChange={(v) => setFormData((p) => ({ ...p, hotel_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOTEL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <div className="flex gap-3">
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="hotel-city">City</Label>
                <Input
                  id="hotel-city"
                  value={formData.city}
                  onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="hotel-country">Country</Label>
                <Input
                  id="hotel-country"
                  value={formData.country}
                  onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hotel-website">Website</Label>
              <Input
                id="hotel-website"
                value={formData.website}
                onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hotel-booking">Booking URL</Label>
              <Input
                id="hotel-booking"
                value={formData.booking_url}
                onChange={(e) => setFormData((p) => ({ ...p, booking_url: e.target.value }))}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="hotel-phone">Phone</Label>
                <Input
                  id="hotel-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="hotel-email">Email</Label>
                <Input
                  id="hotel-email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="hotel-stars">Star Rating</Label>
                <Input
                  id="hotel-stars"
                  type="number"
                  min={1}
                  max={5}
                  step={0.5}
                  value={formData.star_rating}
                  onChange={(e) => setFormData((p) => ({ ...p, star_rating: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <Label htmlFor="hotel-price">Price Range (1-4)</Label>
                <Input
                  id="hotel-price"
                  type="number"
                  min={1}
                  max={4}
                  value={formData.price_range}
                  onChange={(e) => setFormData((p) => ({ ...p, price_range: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hotel-safety">Queer Safety Notes</Label>
              <Textarea
                id="hotel-safety"
                value={formData.queer_safety_notes}
                onChange={(e) => setFormData((p) => ({ ...p, queer_safety_notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  id="hotel-lgbtq"
                  checked={formData.lgbtq_friendly}
                  onCheckedChange={(c) => setFormData((p) => ({ ...p, lgbtq_friendly: c }))}
                />
                <Label htmlFor="hotel-lgbtq">LGBTQ+ Friendly</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="hotel-featured"
                  checked={formData.featured}
                  onCheckedChange={(c) => setFormData((p) => ({ ...p, featured: c }))}
                />
                <Label htmlFor="hotel-featured">Featured</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="hotel-verified"
                  checked={formData.verified}
                  onCheckedChange={(c) => setFormData((p) => ({ ...p, verified: c }))}
                />
                <Label htmlFor="hotel-verified">Verified</Label>
              </div>
            </div>
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
          </form>
        </DialogContent>
      </Dialog>
      }
    />
  );
}
