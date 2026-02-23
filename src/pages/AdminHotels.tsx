import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, Edit2, Trash2, Star, Hotel as HotelIcon } from 'lucide-react';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import { exportToExcel, fetchAllRows, formatDateTime, formatBoolean, generateFilename, type ExportColumnDef } from '@/utils/excelExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useHotels, type Hotel } from '@/hooks/useHotels';
import { LocationAutocomplete, type AddressComponents } from '@/components/ui/location-autocomplete';
import { useAddressResolver } from '@/hooks/useAddressResolver';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import MuiSelect from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';

const HOTEL_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'bnb', label: 'B&B' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'guesthouse', label: 'Guesthouse' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'resort', label: 'Resort' },
  { value: 'other', label: 'Other' },
];

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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { hotels, loading, createHotel, updateHotel, deleteHotel, refetch } = useHotels();
  const { resolveAddress } = useAddressResolver();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    if (!user) navigate('/auth');
    if (!rolesLoading && !canManageContent()) navigate('/');
  }, [user, rolesLoading, canManageContent, navigate]);

  const filteredHotels = useMemo(() => {
    let filtered = hotels;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(h =>
        h.name.toLowerCase().includes(q) ||
        h.city?.toLowerCase().includes(q) ||
        h.country?.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter(h => h.hotel_type === typeFilter);
    }
    return filtered;
  }, [hotels, searchQuery, typeFilter]);

  const stats = useMemo(() => ({
    total: hotels.length,
    featured: hotels.filter(h => h.featured).length,
    verified: hotels.filter(h => h.verified).length,
    types: HOTEL_TYPES.map(t => ({
      ...t,
      count: hotels.filter(h => h.hotel_type === t.value).length,
    })).filter(t => t.count > 0),
  }), [hotels]);

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingHotel(null);
  };

  const handleEdit = (hotel: Hotel) => {
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

  const handleDelete = async (hotel: Hotel) => {
    if (!confirm(`Delete "${hotel.name}"? This cannot be undone.`)) return;
    try {
      await deleteHotel(hotel.id);
      toast.success('Hotel deleted');
      refetch();
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
    } as Record<string, unknown>;
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
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} style={{ marginBottom: 8 }}>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 6 }} />
            Back to Admin
          </Button>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Hotels & BnBs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage LGBTQ+ friendly accommodations
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <ExportExcelButton onExport={async () => {
            const columns: ExportColumnDef<any>[] = [
              { header: 'Name', accessor: r => r.name },
              { header: 'Hotel Type', accessor: r => r.hotel_type },
              { header: 'City', accessor: r => r.city },
              { header: 'Country', accessor: r => r.country },
              { header: 'Star Rating', accessor: r => r.star_rating },
              { header: 'LGBTQ Friendly', accessor: r => formatBoolean(r.lgbtq_friendly) },
              { header: 'Featured', accessor: r => formatBoolean(r.featured) },
              { header: 'Verified', accessor: r => formatBoolean(r.verified) },
              { header: 'Website', accessor: r => r.website },
              { header: 'Created At', accessor: r => formatDateTime(r.created_at) },
            ];
            const allData = await fetchAllRows('hotels', '*', { column: 'name', ascending: true });
            await exportToExcel(allData, columns, generateFilename('hotels'));
          }} />
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
            Add Hotel
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <Chip label={`${stats.total} Total`} size="small" />
        <Chip label={`${stats.featured} Featured`} size="small" color="primary" />
        <Chip label={`${stats.verified} Verified`} size="small" color="success" />
        {stats.types.map(t => (
          <Chip key={t.value} label={`${t.count} ${t.label}`} size="small" variant="outlined" />
        ))}
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, opacity: 0.5 }} />
          <Input placeholder="Search hotels..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: 32 }} />
        </Box>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger style={{ width: 160 }}>
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {HOTEL_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Box>

      {/* Hotels List */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : filteredHotels.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <HotelIcon style={{ width: 48, height: 48, opacity: 0.3, margin: '0 auto 16px' }} />
          <Typography color="text.secondary">No hotels found</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filteredHotels.map(hotel => (
            <Paper key={hotel.id} elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="subtitle2" noWrap>{hotel.name}</Typography>
                  {hotel.featured && <Badge>Featured</Badge>}
                  {hotel.verified && <Badge variant="outline">Verified</Badge>}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {HOTEL_TYPES.find(t => t.value === hotel.hotel_type)?.label || hotel.hotel_type}
                  {hotel.city && ` · ${hotel.city}`}
                  {hotel.country && `, ${hotel.country}`}
                  {hotel.star_rating && ` · ${hotel.star_rating}★`}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                <Button variant="ghost" size="sm" onClick={() => handleEdit(hotel)}>
                  <Edit2 style={{ width: 14, height: 14 }} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(hotel)}>
                  <Trash2 style={{ width: 14, height: 14, color: '#ef4444' }} />
                </Button>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent style={{ maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
          <DialogHeader>
            <DialogTitle>{editingHotel ? 'Edit Hotel' : 'Add New Hotel'}</DialogTitle>
          </DialogHeader>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField label="Name" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} required fullWidth size="small" />
            <TextField label="Description" value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} multiline rows={3} fullWidth size="small" />

            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <MuiSelect value={formData.hotel_type} label="Type" onChange={e => setFormData(p => ({ ...p, hotel_type: e.target.value }))}>
                {HOTEL_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </MuiSelect>
            </FormControl>

            <LocationAutocomplete
              value={formData.address}
              onChange={async (address, coordinates, components) => {
                setFormData(p => ({
                  ...p,
                  address,
                  latitude: coordinates ? String(coordinates.lat) : p.latitude,
                  longitude: coordinates ? String(coordinates.lng) : p.longitude,
                  ...(components?.city ? { city: components.city } : {}),
                  ...(components?.country ? { country: components.country } : {}),
                }));
                if (components?.country) {
                  const resolved = await resolveAddress(components.city, components.country, coordinates?.lat, coordinates?.lng);
                  if (resolved) {
                    setFormData(p => ({
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
              <TextField label="City" value={formData.city} onChange={e => setFormData(p => ({ ...p, city: e.target.value }))} fullWidth size="small" />
              <TextField label="Country" value={formData.country} onChange={e => setFormData(p => ({ ...p, country: e.target.value }))} fullWidth size="small" />
            </Box>

            {(formData.latitude && formData.longitude) && (
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField label="Latitude" value={formData.latitude} fullWidth size="small" InputProps={{ readOnly: true }} sx={{ '& .MuiInputBase-root': { bgcolor: 'action.hover' } }} helperText="Auto-populated from address" />
                <TextField label="Longitude" value={formData.longitude} fullWidth size="small" InputProps={{ readOnly: true }} sx={{ '& .MuiInputBase-root': { bgcolor: 'action.hover' } }} helperText="Auto-populated from address" />
              </Box>
            )}

            <TextField label="Website" value={formData.website} onChange={e => setFormData(p => ({ ...p, website: e.target.value }))} fullWidth size="small" />
            <TextField label="Booking URL" value={formData.booking_url} onChange={e => setFormData(p => ({ ...p, booking_url: e.target.value }))} fullWidth size="small" />

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField label="Phone" value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} fullWidth size="small" />
              <TextField label="Email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} fullWidth size="small" />
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField label="Star Rating" value={formData.star_rating} onChange={e => setFormData(p => ({ ...p, star_rating: e.target.value }))} type="number" fullWidth size="small" inputProps={{ min: 1, max: 5, step: 0.5 }} />
              <TextField label="Price Range (1-4)" value={formData.price_range} onChange={e => setFormData(p => ({ ...p, price_range: e.target.value }))} type="number" fullWidth size="small" inputProps={{ min: 1, max: 4 }} />
            </Box>

            <TextField label="Queer Safety Notes" value={formData.queer_safety_notes} onChange={e => setFormData(p => ({ ...p, queer_safety_notes: e.target.value }))} multiline rows={2} fullWidth size="small" />

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControlLabel control={<Switch checked={formData.lgbtq_friendly} onChange={e => setFormData(p => ({ ...p, lgbtq_friendly: e.target.checked }))} size="small" />} label="LGBTQ+ Friendly" />
              <FormControlLabel control={<Switch checked={formData.featured} onChange={e => setFormData(p => ({ ...p, featured: e.target.checked }))} size="small" />} label="Featured" />
              <FormControlLabel control={<Switch checked={formData.verified} onChange={e => setFormData(p => ({ ...p, verified: e.target.checked }))} size="small" />} label="Verified" />
            </Box>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { resetForm(); setIsDialogOpen(false); }}>
                Cancel
              </Button>
              <Button type="submit">
                {editingHotel ? 'Update Hotel' : 'Add Hotel'}
              </Button>
            </DialogFooter>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
