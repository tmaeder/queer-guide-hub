import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useAuth } from '@/hooks/useAuth';
import { useEvents } from '@/hooks/useEvents';
import { useVenues } from '@/hooks/useVenues';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  ArrowLeft,
  Calendar as CalendarIcon,
  MapPin,
  Clock,
  Users,
} from 'lucide-react';
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
import { EventsCsvImport } from '@/components/events/EventsCsvImport';
import { EventImageUpload } from '@/components/events/EventImageUpload';
import { EventbriteImport } from '@/components/events/EventbriteImport';
import { TicketmasterImport } from '@/components/events/TicketmasterImport';
import {
  LocationAutocomplete,
  type AddressComponents,
} from '@/components/ui/location-autocomplete';
import { VenueCombobox } from '@/components/ui/venue-combobox';
import { useAddressResolver } from '@/hooks/useAddressResolver';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';

export default function AdminEvents() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { events, loading, createEvent, updateEvent, deleteEvent, refetch } = useEvents();
  const { venues, loading: venuesLoading } = useVenues();
  const { toast } = useToast();
  const { resolveAddress } = useAddressResolver();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [filteredEvents, setFilteredEvents] = useState(events);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: '',
    venue_id: '',
    venue_name: '',
    address: '',
    latitude: null as number | null,
    longitude: null as number | null,
    city: '',
    state: '',
    country: 'US',
    start_date: '',
    end_date: '',
    price_min: '',
    price_max: '',
    is_free: false,
    max_attendees: '',
    age_restriction: '',
    website: '',
    ticket_url: '',
    organizer_name: '',
    organizer_contact: '',
    featured: false,
    tags: [] as string[],
    images: [] as string[],
  });

  const eventTypes = [
    'concert',
    'festival',
    'conference',
    'workshop',
    'meetup',
    'party',
    'exhibition',
    'sports',
    'theater',
    'comedy',
    'other',
  ];

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    if (!rolesLoading && !canManageContent()) {
      navigate('/');
      return;
    }
  }, [user, rolesLoading, canManageContent]);

  useEffect(() => {
    filterEvents();
  }, [events, searchQuery, selectedType]);

  const filterEvents = () => {
    let filtered = events;

    if (searchQuery) {
      filtered = filtered.filter(
        (event) =>
          event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          event.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          event.city.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter((event) => event.event_type === selectedType);
    }

    setFilteredEvents(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!startDate) {
      toast({
        title: 'Error',
        description: 'Please select a start date',
        variant: 'destructive',
      });
      return;
    }

    try {
      const eventData = {
        ...formData,
        venue_id: formData.venue_id === 'custom' || !formData.venue_id ? null : formData.venue_id,
        latitude: formData.latitude,
        longitude: formData.longitude,
        age_restriction: formData.age_restriction === 'none' ? null : formData.age_restriction,
        start_date: startDate.toISOString(),
        end_date: endDate?.toISOString() || null,
        price_min: formData.price_min ? parseFloat(formData.price_min) : null,
        price_max: formData.price_max ? parseFloat(formData.price_max) : null,
        max_attendees: formData.max_attendees ? parseInt(formData.max_attendees) : null,
        images: formData.images.length > 0 ? formData.images : null,
        created_by: user?.id,
      };

      if (editingEvent) {
        const { error } = await updateEvent(editingEvent.id, eventData);
        if (error) throw new Error(error);

        toast({
          title: 'Success',
          description: 'Event updated successfully',
        });
      } else {
        const { error } = await createEvent(eventData);
        if (error) throw new Error(error);

        toast({
          title: 'Success',
          description: 'Event created successfully',
        });
      }

      resetForm();
      setIsCreateDialogOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create event',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      event_type: '',
      venue_id: '',
      venue_name: '',
      address: '',
      latitude: null,
      longitude: null,
      city: '',
      state: '',
      country: 'US',
      start_date: '',
      end_date: '',
      price_min: '',
      price_max: '',
      is_free: false,
      max_attendees: '',
      age_restriction: '',
      website: '',
      ticket_url: '',
      organizer_name: '',
      organizer_contact: '',
      featured: false,
      tags: [],
      images: [],
    });
    setStartDate(undefined);
    setEndDate(undefined);
    setEditingEvent(null);
  };

  const handleVenueSelect = (venueId: string) => {
    if (venueId === 'custom') {
      setFormData((prev) => ({
        ...prev,
        venue_id: '',
        venue_name: '',
        address: '',
        latitude: null,
        longitude: null,
        city: '',
        state: '',
        country: 'US',
      }));
    } else {
      setFormData((prev) => ({ ...prev, venue_id: venueId }));

      if (venueId) {
        const selectedVenue = venues.find((v) => v.id === venueId);
        if (selectedVenue) {
          setFormData((prev) => ({
            ...prev,
            venue_name: selectedVenue.name,
            address: selectedVenue.address,
            latitude: selectedVenue.latitude || null,
            longitude: selectedVenue.longitude || null,
            city: selectedVenue.city,
            state: selectedVenue.state || '',
            country: selectedVenue.country,
            city_id: (selectedVenue as any).city_id || '',
            country_id: (selectedVenue as any).country_id || '',
          }));
        }
      }
    }
  };

  const handleAddressChange = async (
    address: string,
    coordinates?: { lat: number; lng: number },
    components?: AddressComponents,
  ) => {
    setFormData((prev) => ({
      ...prev,
      address,
      latitude: coordinates?.lat || null,
      longitude: coordinates?.lng || null,
      ...(components?.city ? { city: components.city } : {}),
      ...(components?.state ? { state: components.state } : {}),
      ...(components?.country ? { country: components.country } : {}),
    }));

    // Resolve to FK IDs
    if (components?.country) {
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
      }
    }
  };

  const handleEditEvent = (event: any) => {
    setFormData({
      title: event.title,
      description: event.description || '',
      event_type: event.event_type,
      venue_id: event.venue_id || '',
      venue_name: event.venue_name || '',
      address: event.address || '',
      latitude: event.latitude || null,
      longitude: event.longitude || null,
      city: event.city,
      state: event.state || '',
      country: event.country,
      start_date: '',
      end_date: '',
      price_min: event.price_min?.toString() || '',
      price_max: event.price_max?.toString() || '',
      is_free: event.is_free,
      max_attendees: event.max_attendees?.toString() || '',
      age_restriction: event.age_restriction || '',
      website: event.website || '',
      ticket_url: event.ticket_url || '',
      organizer_name: event.organizer_name || '',
      organizer_contact: event.organizer_contact || '',
      featured: event.featured,
      tags: event.tags || [],
      images: event.images || [],
    });
    setStartDate(new Date(event.start_date));
    setEndDate(event.end_date ? new Date(event.end_date) : undefined);
    setEditingEvent(event);
    setIsCreateDialogOpen(true);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) {
      return;
    }

    try {
      const { error } = await deleteEvent(eventId);

      if (error) throw new Error(error);

      toast({
        title: 'Success',
        description: 'Event deleted successfully',
      });

      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete event',
        variant: 'destructive',
      });
    }
  };

  if (rolesLoading || loading || venuesLoading) {
    return (
      <Container maxWidth="lg" sx={{ p: 3 }}>
        <Box sx={{ textAlign: 'center' }}>Loading...</Box>
      </Container>
    );
  }

  const handleExportExcel = async () => {
    const columns: ExportColumnDef<any>[] = [
      { header: 'Title', accessor: (r) => r.title },
      { header: 'Event Type', accessor: (r) => r.event_type },
      { header: 'Start Date', accessor: (r) => formatDateTime(r.start_date) },
      { header: 'End Date', accessor: (r) => formatDateTime(r.end_date) },
      { header: 'Venue Name', accessor: (r) => r.venue_name },
      { header: 'City', accessor: (r) => r.city },
      { header: 'Country', accessor: (r) => r.country },
      { header: 'Organizer', accessor: (r) => r.organizer_name },
      { header: 'Is Free', accessor: (r) => formatBoolean(r.is_free) },
      { header: 'Price Min', accessor: (r) => r.price_min },
      { header: 'Price Max', accessor: (r) => r.price_max },
      { header: 'Ticket URL', accessor: (r) => r.ticket_url },
      { header: 'Website', accessor: (r) => r.website },
      { header: 'Featured', accessor: (r) => formatBoolean(r.featured) },
      { header: 'Tags', accessor: (r) => formatArray(r.tags) },
      { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
    ];
    const allData = await fetchAllRows('events', '*', { column: 'title', ascending: true });
    await exportToExcel(allData, columns, generateFilename('events'));
  };

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="outline" onClick={() => navigate('/admin')}>
            <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
            Back to Dashboard
          </Button>
          <Box>
            <Typography variant="h4">Events Management</Typography>
            <Typography color="text.secondary">Create and manage events</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <EventsCsvImport onImportComplete={refetch} />
          <EventbriteImport onImportComplete={refetch} />
          <TicketmasterImport onImportComplete={refetch} />
          <ExportExcelButton onExport={handleExportExcel} />
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
                Create Event
              </Button>
            </DialogTrigger>
            <DialogContent sx={{ maxWidth: 896, maxHeight: '90vh', overflowY: 'auto' }}>
              <DialogHeader>
                <DialogTitle>{editingEvent ? 'Edit Event' : 'Create New Event'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {/* Basic Info */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Event Details
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      <Box>
                        <Label htmlFor="title">Event Title</Label>
                        <Input
                          id="title"
                          value={formData.title}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, title: e.target.value }))
                          }
                          required
                        />
                      </Box>
                      <Box>
                        <Label htmlFor="event_type">Event Type</Label>
                        <Select
                          value={formData.event_type}
                          onValueChange={(value) =>
                            setFormData((prev) => ({ ...prev, event_type: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {eventTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
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

                  {/* Date & Time */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Date & Time
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      <Box>
                        <Label>Start Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              sx={{
                                width: '100%',
                                justifyContent: 'flex-start',
                                textAlign: 'left',
                                fontWeight: 'normal',
                                ...(!startDate && { color: 'text.secondary' }),
                              }}
                            >
                              <CalendarIcon style={{ marginRight: 8, height: 16, width: 16 }} />
                              {startDate ? format(startDate, 'PPP') : 'Pick a date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent sx={{ width: 'auto', p: 0 }}>
                            <Calendar
                              mode="single"
                              selected={startDate}
                              onSelect={setStartDate}
                              initialFocus
                              style={{ pointerEvents: 'auto' }}
                            />
                          </PopoverContent>
                        </Popover>
                      </Box>
                      <Box>
                        <Label>End Date (Optional)</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              sx={{
                                width: '100%',
                                justifyContent: 'flex-start',
                                textAlign: 'left',
                                fontWeight: 'normal',
                                ...(!endDate && { color: 'text.secondary' }),
                              }}
                            >
                              <CalendarIcon style={{ marginRight: 8, height: 16, width: 16 }} />
                              {endDate ? format(endDate, 'PPP') : 'Pick a date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent sx={{ width: 'auto', p: 0 }}>
                            <Calendar
                              mode="single"
                              selected={endDate}
                              onSelect={setEndDate}
                              initialFocus
                              style={{ pointerEvents: 'auto' }}
                            />
                          </PopoverContent>
                        </Popover>
                      </Box>
                    </Box>
                  </Box>

                  {/* Location */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Location
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box>
                        <Label htmlFor="venue_id">Select Venue (Optional)</Label>
                        <VenueCombobox
                          venues={venues}
                          value={formData.venue_id}
                          onValueChange={handleVenueSelect}
                          placeholder="Search and select venue or choose custom location"
                          sx={{ width: '100%' }}
                        />
                      </Box>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        <Box>
                          <Label htmlFor="venue_name">Venue Name</Label>
                          <Input
                            id="venue_name"
                            value={formData.venue_name}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, venue_name: e.target.value }))
                            }
                            disabled={!!formData.venue_id}
                          />
                        </Box>
                        <Box>
                          <LocationAutocomplete
                            value={formData.address}
                            onChange={handleAddressChange}
                            placeholder={
                              formData.venue_id
                                ? 'Address populated from venue'
                                : 'Search for an address...'
                            }
                            disabled={!!formData.venue_id}
                            label="Address"
                            style={{ opacity: formData.venue_id ? 0.5 : 1 }}
                          />
                        </Box>
                      </Box>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                        <Box>
                          <Label htmlFor="city">City</Label>
                          <Input
                            id="city"
                            value={formData.city}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, city: e.target.value }))
                            }
                            required
                            disabled={!!formData.venue_id}
                          />
                        </Box>
                        <Box>
                          <Label htmlFor="state">State</Label>
                          <Input
                            id="state"
                            value={formData.state}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, state: e.target.value }))
                            }
                            disabled={!!formData.venue_id}
                          />
                        </Box>
                        <Box>
                          <Label htmlFor="country">Country</Label>
                          <Input
                            id="country"
                            value={formData.country}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, country: e.target.value }))
                            }
                            disabled={!!formData.venue_id}
                          />
                        </Box>
                      </Box>
                    </Box>
                  </Box>

                  {/* Pricing & Capacity */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Pricing & Capacity
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Checkbox
                        id="is_free"
                        checked={formData.is_free}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, is_free: checked as boolean }))
                        }
                      />
                      <Label htmlFor="is_free">Free Event</Label>
                    </Box>

                    {!formData.is_free && (
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        <Box>
                          <Label htmlFor="price_min">Min Price</Label>
                          <Input
                            id="price_min"
                            type="number"
                            step="0.01"
                            value={formData.price_min}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, price_min: e.target.value }))
                            }
                          />
                        </Box>
                        <Box>
                          <Label htmlFor="price_max">Max Price</Label>
                          <Input
                            id="price_max"
                            type="number"
                            step="0.01"
                            value={formData.price_max}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, price_max: e.target.value }))
                            }
                          />
                        </Box>
                      </Box>
                    )}

                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      <Box>
                        <Label htmlFor="max_attendees">Max Attendees</Label>
                        <Input
                          id="max_attendees"
                          type="number"
                          value={formData.max_attendees}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, max_attendees: e.target.value }))
                          }
                        />
                      </Box>
                      <Box>
                        <Label htmlFor="age_restriction">Age Restriction</Label>
                        <Select
                          value={formData.age_restriction}
                          onValueChange={(value) =>
                            setFormData((prev) => ({ ...prev, age_restriction: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select restriction" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Restriction</SelectItem>
                            <SelectItem value="18+">18+</SelectItem>
                            <SelectItem value="21+">21+</SelectItem>
                            <SelectItem value="all_ages">All Ages</SelectItem>
                          </SelectContent>
                        </Select>
                      </Box>
                    </Box>
                  </Box>

                  {/* Additional Info */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Additional Information
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      <Box>
                        <Label htmlFor="organizer_name">Organizer Name</Label>
                        <Input
                          id="organizer_name"
                          value={formData.organizer_name}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, organizer_name: e.target.value }))
                          }
                        />
                      </Box>
                      <Box>
                        <Label htmlFor="organizer_contact">Organizer Contact</Label>
                        <Input
                          id="organizer_contact"
                          value={formData.organizer_contact}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, organizer_contact: e.target.value }))
                          }
                        />
                      </Box>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      <Box>
                        <Label htmlFor="website">Website</Label>
                        <Input
                          id="website"
                          value={formData.website}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, website: e.target.value }))
                          }
                        />
                      </Box>
                      <Box>
                        <Label htmlFor="ticket_url">Ticket URL</Label>
                        <Input
                          id="ticket_url"
                          value={formData.ticket_url}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, ticket_url: e.target.value }))
                          }
                        />
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Checkbox
                        id="featured"
                        checked={formData.featured}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, featured: checked as boolean }))
                        }
                      />
                      <Label htmlFor="featured">Featured Event</Label>
                    </Box>
                  </Box>

                  {/* Event Images */}
                  <EventImageUpload
                    images={formData.images}
                    onChange={(images) => setFormData((prev) => ({ ...prev, images }))}
                    maxImages={5}
                  />

                  <Button type="submit" sx={{ width: '100%' }}>
                    {editingEvent ? 'Update Event' : 'Create Event'}
                  </Button>
                </Box>
              </form>
            </DialogContent>
          </Dialog>
        </Box>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ position: 'relative' }}>
                <Search
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: 16,
                    width: 16,
                    color: 'var(--muted-foreground)',
                  }}
                />
                <Input
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  sx={{ pl: 5 }}
                />
              </Box>
            </Box>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger sx={{ width: 192 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {eventTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
        </CardContent>
      </Card>

      {/* Stats */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' },
          gap: 3,
          mb: 4,
        }}
      >
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CalendarIcon style={{ height: 20, width: 20, color: 'var(--primary)' }} />
              <Box>
                <Typography variant="h5">{events.length}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Events
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Clock style={{ height: 20, width: 20, color: 'var(--primary)' }} />
              <Box>
                <Typography variant="h5">
                  {events.filter((e) => new Date(e.start_date) > new Date()).length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Upcoming
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Users style={{ height: 20, width: 20, color: 'var(--accent)' }} />
              <Box>
                <Typography variant="h5">{events.filter((e) => e.featured).length}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Featured
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MapPin style={{ height: 20, width: 20, color: 'var(--secondary)' }} />
              <Box>
                <Typography variant="h5">{new Set(events.map((e) => e.city)).size}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Cities
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Events List */}
      <Card>
        <CardHeader>
          <CardTitle>Events ({filteredEvents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredEvents.map((event) => (
              <Box
                key={event.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 2,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Typography sx={{ fontWeight: 600 }}>{event.title}</Typography>
                    <Badge variant="outline">{event.event_type}</Badge>
                    {event.featured && (
                      <Badge
                        sx={{ bgcolor: 'rgba(var(--secondary-rgb), 0.1)', color: 'secondary.main' }}
                      >
                        Featured
                      </Badge>
                    )}
                    {event.is_free && (
                      <Badge
                        sx={{ bgcolor: 'rgba(var(--accent-rgb), 0.1)', color: 'secondary.main' }}
                      >
                        Free
                      </Badge>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      <CalendarIcon style={{ height: 12, width: 12 }} />
                      {format(new Date(event.start_date), 'MMM d, yyyy')}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      <MapPin style={{ height: 12, width: 12 }} />
                      {event.city}, {event.state}
                    </Typography>
                    {event.venue_name && (
                      <Typography variant="body2" color="text.secondary">
                        {event.venue_name}
                      </Typography>
                    )}
                  </Box>

                  {event.description && (
                    <Typography variant="body2" color="text.secondary">
                      {event.description.slice(0, 100)}...
                    </Typography>
                  )}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button variant="outline" size="sm" onClick={() => handleEditEvent(event)}>
                    <Edit style={{ height: 16, width: 16 }} />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteEvent(event.id)}
                  >
                    <Trash2 style={{ height: 16, width: 16 }} />
                  </Button>
                </Box>
              </Box>
            ))}

            {filteredEvents.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">No events found</Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
