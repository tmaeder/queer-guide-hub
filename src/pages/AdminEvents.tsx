import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/currency';
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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useEvents } from '@/hooks/useEvents';
import { useVenues } from '@/hooks/useVenues';
import { useAddressResolver } from '@/hooks/useAddressResolver';
import {
  LocationAutocomplete,
  type AddressComponents,
} from '@/components/ui/location-autocomplete';
import { VenueCombobox } from '@/components/ui/venue-combobox';
import { EventImageUpload } from '@/components/events/EventImageUpload';
import { EventsCsvImport } from '@/components/events/EventsCsvImport';
import { EventbriteImport } from '@/components/events/EventbriteImport';
import { TicketmasterImport } from '@/components/events/TicketmasterImport';
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
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, Calendar as CalendarIcon, MapPin, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  venue_id: string | null;
  venue_name: string | null;
  address: string | null;
  city: string;
  state: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  start_date: string;
  end_date: string | null;
  is_free: boolean;
  price_min: number | null;
  price_max: number | null;
  max_attendees: number | null;
  age_restriction: string | null;
  is_featured: boolean;
  status: string | null;
  organizer_id: string | null;
  organizer_name: string | null;
  organizer_contact: string | null;
  website: string | null;
  ticket_url: string | null;
  tags: string[] | null;
  images: string[] | null;
  created_at: string;
}

const eventStatuses = ['active', 'cancelled', 'postponed', 'completed'];

const columnHelper = createColumnHelper<EventRow>();

const eventTypes = [
  'concert',
  'festival',
  'conference',
  'workshop',
  'meetup',
  'party',
  'pride',
  'exhibition',
  'sports',
  'theater',
  'comedy',
  'cruise',
  'other',
];

const PRIDE_SUBTYPES: Array<{ tag: string; label: string }> = [
  { tag: 'pride:parade', label: 'Parade' },
  { tag: 'pride:week', label: 'Pride Week' },
  { tag: 'pride:festival', label: 'Festival' },
  { tag: 'pride:party', label: 'Party' },
  { tag: 'pride:rally', label: 'Rally / Protest' },
  { tag: 'pride:community', label: 'Community' },
];

const emptyForm = {
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
  organizer_id: '',
  organizer_name: '',
  organizer_contact: '',
  is_featured: false,
  tags: [] as string[],
  images: [] as string[],
};

export default function AdminEvents() {
  const { user } = useAuth();
  const { createEvent, updateEvent, deleteEvent } = useEvents();
  const { venues } = useVenues();
  const { toast } = useToast();
  const { resolveAddress } = useAddressResolver();
  const queryClient = useQueryClient();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [formData, setFormData] = useState(emptyForm);

  const invalidateTable = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'events'] });

  const resetForm = () => {
    setFormData(emptyForm);
    setStartDate(undefined);
    setEndDate(undefined);
    setEditingEvent(null);
  };

  const handleVenueSelect = (venueId: string) => {
    if (venueId === 'custom' || !venueId) {
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
      return;
    }
    const v = venues.find((v) => v.id === venueId);
    if (v) {
      setFormData((prev) => ({
        ...prev,
        venue_id: venueId,
        venue_name: v.name,
        address: v.address,
        latitude: v.latitude || null,
        longitude: v.longitude || null,
        city: v.city,
        state: v.state || '',
        country: v.country,
      }));
    }
  };


  const organizers = useMemo(() => venues.filter((v: any) => v.is_organizer), [venues]);

  const handleOrganizerSelect = (organizerId: string) => {
    if (organizerId === 'custom' || !organizerId) {
      setFormData((prev) => ({ ...prev, organizer_id: '', organizer_name: '', organizer_contact: '' }));
      return;
    }
    const org = venues.find((v) => v.id === organizerId);
    if (org) {
      setFormData((prev) => ({
        ...prev,
        organizer_id: organizerId,
        organizer_name: org.name,
        organizer_contact: (org as any).email || (org as any).phone || '',
      }));
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
          ...(resolved.city_name ? { city: resolved.city_name } : {}),
          ...(resolved.country_name ? { country: resolved.country_name } : {}),
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate) {
      toast({ title: 'Error', description: 'Please select a start date', variant: 'destructive' });
      return;
    }

    try {
      const eventData = {
        ...formData,
        venue_id: formData.venue_id || null,
        organizer_id: formData.organizer_id || null,
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
        toast({ title: 'Success', description: 'Event updated' });
      } else {
        const { error } = await createEvent(eventData);
        if (error) throw new Error(error);
        toast({ title: 'Success', description: 'Event created' });
      }
      resetForm();
      setIsCreateDialogOpen(false);
      invalidateTable();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message :'Failed to save event',
        variant: 'destructive',
      });
    }
  };

  const handleEditEvent = (event: EventRow) => {
    setFormData({
      title: event.title,
      description: event.description || '',
      event_type: event.event_type,
      venue_id: event.venue_id || '',
      venue_name: event.venue_name || '',
      address: event.address || '',
      latitude: event.latitude,
      longitude: event.longitude,
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
      organizer_id: event.organizer_id || '',
      organizer_name: event.organizer_name || '',
      organizer_contact: event.organizer_contact || '',
      is_featured: event.is_featured,
      tags: event.tags || [],
      images: event.images || [],
    });
    setStartDate(new Date(event.start_date));
    setEndDate(event.end_date ? new Date(event.end_date) : undefined);
    setEditingEvent(event);
    setIsCreateDialogOpen(true);
  };

  const handleDeleteEvent = async (event: EventRow) => {
    if (!confirm(`Delete "${event.title}"?`)) return;
    try {
      const { error } = await deleteEvent(event.id);
      if (error) throw new Error(error);
      toast({ title: 'Success', description: 'Event deleted' });
      invalidateTable();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message :'Failed to delete',
        variant: 'destructive',
      });
    }
  };

  const handleExportExcel = async () => {
    const columns: ExportColumnDef<Record<string, unknown>>[] = [
      { header: 'Title', accessor: (r) => r.title },
      { header: 'Event Type', accessor: (r) => r.event_type },
      { header: 'Start Date', accessor: (r) => formatDateTime(r.start_date) },
      { header: 'End Date', accessor: (r) => formatDateTime(r.end_date) },
      { header: 'Venue Name', accessor: (r) => r.venue_name },
      { header: 'City', accessor: (r) => r.city },
      { header: 'Country', accessor: (r) => r.country },
      { header: 'Organizer', accessor: (r) => r.organizer_name },
      { header: 'Is Free', accessor: (r) => formatBoolean(r.is_free) },
      { header: 'Featured', accessor: (r) => formatBoolean(r.is_featured) },
      { header: 'Tags', accessor: (r) => formatArray(r.tags) },
      { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
    ];
    const allData = await fetchAllRows('events', '*', { column: 'title', ascending: true });
    await exportToExcel(allData, columns, generateFilename('events'));
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Title',
        cell: (info) => (
          <div>
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            {info.row.original.venue_name && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin style={{ height: 11, width: 11 }} />
                {info.row.original.venue_name}
              </div>
            )}
          </div>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('event_type', {
        header: 'Type',
        cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
        meta: {
          serverSortable: true,
          serverFilterable: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('city', {
        header: 'City',
        cell: (info) => info.getValue() || '-',
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('start_date', {
        header: 'Start Date',
        cell: (info) => {
          const d = info.getValue();
          return d ? (
            <div className="flex items-center gap-1">
              <CalendarIcon style={{ height: 12, width: 12 }} />
              {format(new Date(d), 'MMM d, yyyy HH:mm')}
            </div>
          ) : (
            '-'
          );
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('end_date', {
        header: 'End Date',
        cell: (info) => {
          const d = info.getValue();
          return d ? (
            <div className="flex items-center gap-1">
              <CalendarIcon style={{ height: 12, width: 12 }} />
              {format(new Date(d), 'MMM d, yyyy HH:mm')}
            </div>
          ) : (
            '-'
          );
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const s = info.getValue();
          if (!s) return '-';
          const colors: Record<string, { bg: string; fg: string }> = {
            active: { bg: '#dcfce7', fg: '#166534' },
            cancelled: { bg: '#fee2e2', fg: '#991b1b' },
            postponed: { bg: '#fef3c7', fg: '#92400e' },
            completed: { bg: '#e0e7ff', fg: '#3730a3' },
          };
          const c = colors[s] || { bg: '#f1f5f9', fg: '#475569' };
          return <Badge style={{ backgroundColor: c.bg, color: c.fg }}>{s}</Badge>;
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('is_free', {
        header: 'Free',
        cell: (info) =>
          info.getValue() ? (
            <Badge style={{ backgroundColor: '#dcfce7', color: '#166534' }}>Free</Badge>
          ) : (
            <span style={{ color: 'var(--muted-foreground)' }}>
              {info.row.original.price_min ? formatCurrency(info.row.original.price_min) : '-'}
            </span>
          ),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('is_featured', {
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
      columnHelper.accessor('organizer_name', {
        header: 'Organizer',
        cell: (info) => info.getValue() || '-',
        meta: {
          serverSortable: true,
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

  const tableConfig: AdminTableConfig<EventRow> = useMemo(
    () => ({
      tableName: 'events',
      select:
        'id,title,description,event_type,venue_id,venue_name,address,city,state,country,latitude,longitude,start_date,end_date,is_free,price_min,price_max,max_attendees,age_restriction,is_featured,status,organizer_id,organizer_name,organizer_contact,website,ticket_url,tags,images,created_at',
      columns,
      defaultSort: { column: 'start_date', direction: 'desc' },
      defaultPageSize: 50,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['title', 'description', 'city', 'venue_name'],
      entityFilters: [
        {
          key: 'event_type',
          label: 'Type',
          type: 'multiselect',
          column: 'event_type',
          options: eventTypes.map((t) => ({
            value: t,
            label: t.charAt(0).toUpperCase() + t.slice(1),
          })),
        },
        { key: 'start_date', label: 'Start', type: 'date-range', column: 'start_date' },
        { key: 'end_date', label: 'End', type: 'date-range', column: 'end_date' },
        {
          key: 'organizer_name',
          label: 'Organizer',
          type: 'select',
          column: 'organizer_name',
          options: 'dynamic',
          dynamicSource: { table: 'events', column: 'organizer_name' },
        },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          column: 'status',
          options: eventStatuses.map((s) => ({
            value: s,
            label: s.charAt(0).toUpperCase() + s.slice(1),
          })),
        },
        { key: 'is_featured', label: 'Featured', type: 'boolean', column: 'is_featured' },
        { key: 'is_free', label: 'Free', type: 'boolean', column: 'is_free' },
      ],
      bulkEditFields: [
        {
          key: 'event_type',
          label: 'Event Type',
          type: 'select',
          column: 'event_type',
          options: eventTypes.map((t) => ({
            value: t,
            label: t.charAt(0).toUpperCase() + t.slice(1),
          })),
        },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          column: 'status',
          options: eventStatuses.map((s) => ({
            value: s,
            label: s.charAt(0).toUpperCase() + s.slice(1),
          })),
        },
        { key: 'is_featured', label: 'Featured', type: 'boolean', column: 'is_featured' },
        { key: 'is_free', label: 'Free Event', type: 'boolean', column: 'is_free' },
      ],
      rowActions: [
        { key: 'edit', label: 'Edit', icon: Edit, onClick: handleEditEvent },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          variant: 'destructive',
          onClick: handleDeleteEvent,
        },
      ],
      toolbarActions: (
        <div className="flex gap-1 flex-wrap">
          <EventsCsvImport onImportComplete={invalidateTable} />
          <EventbriteImport onImportComplete={invalidateTable} />
          <TicketmasterImport onImportComplete={invalidateTable} />
          <ExportExcelButton onExport={handleExportExcel} />
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setIsCreateDialogOpen(true);
            }}
          >
            Create Event
          </Button>
        </div>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDeleteEvent/invalidateTable are stable, adding would defeat memoization
    [columns],
  );

  return (
    <AdminEntityTable
      title="Events Management"
      subtitle="Create and manage events"
      backHref={null}
      config={tableConfig}
      afterTable={
        <>
      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent style={{ maxWidth: 896, maxHeight: '90vh', overflow: 'auto' }}>
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Create New Event'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              {/* Basic Info */}
              <div className="flex flex-col gap-4">
                <h3 className="font-semibold">Event Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Event Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label>Event Type</Label>
                    <Select
                      value={formData.event_type}
                      onValueChange={(v) => setFormData((p) => ({ ...p, event_type: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {eventTypes.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {formData.event_type === 'pride' && (
                  <div>
                    <Label>Pride type</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {PRIDE_SUBTYPES.map(({ tag, label }) => {
                        const active = formData.tags.includes(tag);
                        return (
                          <Button
                            key={tag}
                            type="button"
                            size="sm"
                            variant={active ? 'default' : 'outline'}
                            onClick={() =>
                              setFormData((p) => ({
                                ...p,
                                tags: active
                                  ? p.tags.filter((x) => x !== tag)
                                  : [...p.tags, tag],
                              }))
                            }
                            aria-pressed={active}
                          >
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>

              {/* Date & Time */}
              <div className="flex flex-col gap-4">
                <h3 className="font-semibold">Date & Time
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          style={{
                            width: '100%',
                            justifyContent: 'flex-start',
                            fontWeight: 'normal',
                          }}
                        >
                          <CalendarIcon style={{ marginRight: 8, height: 16, width: 16 }} />
                          {startDate ? format(startDate, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent style={{ width: 'auto', padding: 0 }}>
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          initialFocus
                          style={{ pointerEvents: 'auto' }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>End Date (Optional)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          style={{
                            width: '100%',
                            justifyContent: 'flex-start',
                            fontWeight: 'normal',
                          }}
                        >
                          <CalendarIcon style={{ marginRight: 8, height: 16, width: 16 }} />
                          {endDate ? format(endDate, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent style={{ width: 'auto', padding: 0 }}>
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          initialFocus
                          style={{ pointerEvents: 'auto' }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="flex flex-col gap-4">
                <h3 className="font-semibold">Location
                </h3>
                <div>
                  <Label>Select Venue (Optional)</Label>
                  <VenueCombobox
                    venues={venues}
                    value={formData.venue_id}
                    onValueChange={handleVenueSelect}
                    placeholder="Search and select venue"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Venue Name</Label>
                    <Input
                      value={formData.venue_name}
                      onChange={(e) => setFormData((p) => ({ ...p, venue_name: e.target.value }))}
                      disabled={!!formData.venue_id}
                    />
                  </div>
                  <LocationAutocomplete
                    value={formData.address}
                    onChange={handleAddressChange}
                    placeholder={formData.venue_id ? 'From venue' : 'Search address...'}
                    disabled={!!formData.venue_id}
                    label="Address"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>City</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
                      required
                      disabled={!!formData.venue_id}
                    />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input
                      value={formData.state}
                      onChange={(e) => setFormData((p) => ({ ...p, state: e.target.value }))}
                      disabled={!!formData.venue_id}
                    />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Input
                      value={formData.country}
                      onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
                      disabled={!!formData.venue_id}
                    />
                  </div>
                </div>
              </div>

              {/* Pricing & Capacity */}
              <div className="flex flex-col gap-4">
                <h3 className="font-semibold">Pricing & Capacity
                </h3>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_free"
                    checked={formData.is_free}
                    onCheckedChange={(c) => setFormData((p) => ({ ...p, is_free: c as boolean }))}
                  />
                  <Label htmlFor="is_free">Free Event</Label>
                </div>
                {!formData.is_free && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Min Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.price_min}
                        onChange={(e) => setFormData((p) => ({ ...p, price_min: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Max Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.price_max}
                        onChange={(e) => setFormData((p) => ({ ...p, price_max: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Max Attendees</Label>
                    <Input
                      type="number"
                      value={formData.max_attendees}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, max_attendees: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Age Restriction</Label>
                    <Select
                      value={formData.age_restriction}
                      onValueChange={(v) => setFormData((p) => ({ ...p, age_restriction: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Restriction</SelectItem>
                        <SelectItem value="18+">18+</SelectItem>
                        <SelectItem value="21+">21+</SelectItem>
                        <SelectItem value="all_ages">All Ages</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="flex flex-col gap-4">
                <h3 className="font-semibold">Additional Information
                </h3>
                <div>
                  <Label>Select Organizer (Optional)</Label>
                  <VenueCombobox
                    venues={organizers}
                    value={formData.organizer_id}
                    onValueChange={handleOrganizerSelect}
                    placeholder="Search organizers..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Organizer Name</Label>
                    <Input
                      value={formData.organizer_name}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, organizer_name: e.target.value }))
                      }
                      disabled={!!formData.organizer_id}
                    />
                  </div>
                  <div>
                    <Label>Organizer Contact</Label>
                    <Input
                      value={formData.organizer_contact}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, organizer_contact: e.target.value }))
                      }
                      disabled={!!formData.organizer_id}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Website</Label>
                    <Input
                      value={formData.website}
                      onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Ticket URL</Label>
                    <Input
                      value={formData.ticket_url}
                      onChange={(e) => setFormData((p) => ({ ...p, ticket_url: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_featured"
                    checked={formData.is_featured}
                    onCheckedChange={(c) => setFormData((p) => ({ ...p, is_featured: c as boolean }))}
                  />
                  <Label htmlFor="is_featured">Featured Event</Label>
                </div>
              </div>

              <EventImageUpload
                images={formData.images}
                onChange={(images) => setFormData((p) => ({ ...p, images }))}
                maxImages={5}
              />
              <Button type="submit" style={{ width: '100%' }}>
                {editingEvent ? 'Update Event' : 'Create Event'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
        </>
      }
    />
  );
}
