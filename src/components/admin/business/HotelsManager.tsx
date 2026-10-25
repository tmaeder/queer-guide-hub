import { DataTableBulkEditDialog } from '@/components/admin/data-table/DataTableBulkEditDialog';
import { ContentListPanel } from '@/components/cms/ContentListPanel';
import { hotelListConfig } from './organisationListConfigs';
import { FieldRenderer } from '@/components/cms/fields/FieldRenderer';
/**
 * Hotels registry in the Organisation workspace. The shared CMS list owns
 * presentation; existing hotel hooks and dialogs own protected mutations.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { createHotel, deleteHotel, regenerateSafetyNote, updateHotel } from '@/hooks/useHotels';
import { useAddressResolver } from '@/hooks/useAddressResolver';
import { LocationAutocomplete } from '@/components/ui/location-autocomplete';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from '@/components/icons';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { usePromoteToOrg } from '@/hooks/useBusinessSpine';

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

export function HotelsManager() {
  const { user } = useAuth();
  const { resolveAddress } = useAddressResolver();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHotel, setEditingHotel] = useState<HotelRow | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [bulkRows, setBulkRows] = useState<Record<string, unknown>[]>([]);
  const [listVersion, setListVersion] = useState(0);
  const [regenBusy, setRegenBusy] = useState(false);
  const navigate = useNavigate();
  const promote = usePromoteToOrg();

  // Promote a hotel to (or open) its business-spine organization.
  const handlePromote = async (hotel: HotelRow) => {
    try {
      const orgId = await promote.mutateAsync({ entityType: 'hotel', entityId: hotel.id });
      toast.success(`${hotel.name} linked to business`);
      navigate(`/admin/content/organizations?edit=${orgId}`);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  };

  // Recompose this hotel's safety note from its amenity signals (deterministic composer).
  const handleRegenerateSafety = async () => {
    if (!editingHotel) return;
    setRegenBusy(true);
    try {
      const note = await regenerateSafetyNote(editingHotel.id);
      setFormData((p) => ({ ...p, queer_safety_notes: note }));
      toast.success('Safety note regenerated from signals');
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setRegenBusy(false);
    }
  };

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
      setListVersion((v) => v + 1);
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
    if ((formData as Record<string, unknown>).city_id)
      payload.city_id = (formData as Record<string, unknown>).city_id;
    if ((formData as Record<string, unknown>).country_id)
      payload.country_id = (formData as Record<string, unknown>).country_id;

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
      setListVersion((v) => v + 1);
      invalidateTable();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  return (
    <>
      <DataTableBulkEditDialog
        open={bulkRows.length > 0}
        onOpenChange={(open) => {
          if (!open) setBulkRows([]);
        }}
        selectedIds={new Set(bulkRows.map((row) => String(row.id)))}
        tableName="hotels"
        onSuccess={() => {
          setBulkRows([]);
          setListVersion((v) => v + 1);
        }}
        fields={[
          {
            key: 'hotel_type',
            label: 'Hotel type',
            type: 'select',
            column: 'hotel_type',
            options: HOTEL_TYPES,
          },
          { key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' },
          { key: 'verified', label: 'Verified', type: 'boolean', column: 'verified' },
          {
            key: 'lgbtq_friendly',
            label: 'LGBTQ+ friendly',
            type: 'boolean',
            column: 'lgbtq_friendly',
          },
        ]}
      />
      <ContentListPanel
        contentTypeId={hotelListConfig.id}
        configOverride={hotelListConfig}
        workspace
        operational
        hideHeader
        refreshKey={listVersion}
        selectionTools={(rows) => (
          <Button variant="outline" size="sm" onClick={() => setBulkRows(rows)}>
            Edit selected hotels
          </Button>
        )}
        onCreate={() => {
          resetForm();
          setIsDialogOpen(true);
        }}
        onEditRow={(row) => handleEdit(row as unknown as HotelRow)}
        rowActions={(row, refresh) => [
          { label: 'Link to Organisation', run: () => handlePromote(row as unknown as HotelRow) },
          {
            label: 'Delete…',
            destructive: true,
            run: async () => {
              await handleDelete(row as unknown as HotelRow);
              refresh();
            },
          },
        ]}
      />
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent style={{ maxWidth: 600, maxHeight: '90vh' }} className="overflow-auto">
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
              <FieldRenderer
                field={{
                  name: 'hotel-desc',
                  label: 'Description',
                  type: 'textarea',
                  group: 'basic',
                }}
                value={formData.description}
                onChange={(next) => setFormData((p) => ({ ...p, description: String(next ?? '') }))}
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
            <div className="flex gap-4">
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
            <div className="flex gap-4">
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
            <div className="flex gap-4">
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
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="hotel-safety">Queer Safety Notes</Label>
                {editingHotel && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={regenBusy}
                    onClick={handleRegenerateSafety}
                  >
                    <RefreshCw size={13} className="mr-1" /> Regenerate from signals
                  </Button>
                )}
              </div>
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
                  setListVersion((v) => v + 1);
                }}
              >
                Cancel
              </Button>
              <Button type="submit">{editingHotel ? 'Update Hotel' : 'Add Hotel'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
