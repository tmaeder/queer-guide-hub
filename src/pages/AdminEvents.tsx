import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuth } from "@/hooks/useAuth";
import { useEvents } from "@/hooks/useEvents";
import { useVenues } from "@/hooks/useVenues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  ArrowLeft,
  Calendar as CalendarIcon,
  MapPin,
  Clock,
  Users
} from "lucide-react";
import { EventsCsvImport } from "@/components/events/EventsCsvImport";
import { EventImageUpload } from "@/components/events/EventImageUpload";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function AdminEvents() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { events, loading, createEvent, updateEvent, deleteEvent, refetch } = useEvents();
  const { venues, loading: venuesLoading } = useVenues();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [filteredEvents, setFilteredEvents] = useState(events);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_type: "",
    venue_id: "",
    venue_name: "",
    address: "",
    city: "",
    state: "",
    country: "US",
    start_date: "",
    end_date: "",
    price_min: "",
    price_max: "",
    is_free: false,
    max_attendees: "",
    age_restriction: "",
    website: "",
    ticket_url: "",
    organizer_name: "",
    organizer_contact: "",
    featured: false,
    tags: [] as string[],
    images: [] as string[]
  });

  const eventTypes = [
    "concert", "festival", "conference", "workshop", "meetup", 
    "party", "exhibition", "sports", "theater", "comedy", "other"
  ];

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!rolesLoading && !canManageContent()) {
      navigate("/");
      return;
    }
  }, [user, rolesLoading, canManageContent]);

  useEffect(() => {
    filterEvents();
  }, [events, searchQuery, selectedType]);

  const filterEvents = () => {
    let filtered = events;

    if (searchQuery) {
      filtered = filtered.filter(event => 
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.city.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedType !== "all") {
      filtered = filtered.filter(event => event.event_type === selectedType);
    }

    setFilteredEvents(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!startDate) {
      toast({
        title: "Error",
        description: "Please select a start date",
        variant: "destructive"
      });
      return;
    }

    try {
      const eventData = {
        ...formData,
        venue_id: (formData.venue_id === 'custom' || !formData.venue_id) ? null : formData.venue_id,
        age_restriction: formData.age_restriction === 'none' ? null : formData.age_restriction,
        start_date: startDate.toISOString(),
        end_date: endDate?.toISOString() || null,
        price_min: formData.price_min ? parseFloat(formData.price_min) : null,
        price_max: formData.price_max ? parseFloat(formData.price_max) : null,
        max_attendees: formData.max_attendees ? parseInt(formData.max_attendees) : null,
        images: formData.images.length > 0 ? formData.images : null,
        created_by: user?.id
      };

      if (editingEvent) {
        const { error } = await updateEvent(editingEvent.id, eventData);
        if (error) throw new Error(error);
        
        toast({
          title: "Success",
          description: "Event updated successfully"
        });
      } else {
        const { error } = await createEvent(eventData);
        if (error) throw new Error(error);
        
        toast({
          title: "Success",
          description: "Event created successfully"
        });
      }

      resetForm();
      setIsCreateDialogOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create event",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      event_type: "",
      venue_id: "",
      venue_name: "",
      address: "",
      city: "",
      state: "",
      country: "US",
      start_date: "",
      end_date: "",
      price_min: "",
      price_max: "",
      is_free: false,
      max_attendees: "",
      age_restriction: "",
      website: "",
      ticket_url: "",
      organizer_name: "",
      organizer_contact: "",
      featured: false,
      tags: [],
      images: []
    });
    setStartDate(undefined);
    setEndDate(undefined);
    setEditingEvent(null);
  };

  const handleVenueSelect = (venueId: string) => {
    if (venueId === 'custom') {
      setFormData(prev => ({ 
        ...prev, 
        venue_id: "",
        venue_name: "",
        address: "",
        city: "",
        state: "",
        country: "US"
      }));
    } else {
      setFormData(prev => ({ ...prev, venue_id: venueId }));
      
      if (venueId) {
        const selectedVenue = venues.find(v => v.id === venueId);
        if (selectedVenue) {
          setFormData(prev => ({
            ...prev,
            venue_name: selectedVenue.name,
            address: selectedVenue.address,
            city: selectedVenue.city,
            state: selectedVenue.state || "",
            country: selectedVenue.country
          }));
        }
      }
    }
  };

  const handleEditEvent = (event: any) => {
    setFormData({
      title: event.title,
      description: event.description || "",
      event_type: event.event_type,
      venue_id: event.venue_id || "",
      venue_name: event.venue_name || "",
      address: event.address || "",
      city: event.city,
      state: event.state || "",
      country: event.country,
      start_date: "",
      end_date: "",
      price_min: event.price_min?.toString() || "",
      price_max: event.price_max?.toString() || "",
      is_free: event.is_free,
      max_attendees: event.max_attendees?.toString() || "",
      age_restriction: event.age_restriction || "",
      website: event.website || "",
      ticket_url: event.ticket_url || "",
      organizer_name: event.organizer_name || "",
      organizer_contact: event.organizer_contact || "",
      featured: event.featured,
      tags: event.tags || [],
      images: event.images || []
    });
    setStartDate(new Date(event.start_date));
    setEndDate(event.end_date ? new Date(event.end_date) : undefined);
    setEditingEvent(event);
    setIsCreateDialogOpen(true);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to delete this event?")) {
      return;
    }

    try {
      const { error } = await deleteEvent(eventId);
      
      if (error) throw new Error(error);

      toast({
        title: "Success",
        description: "Event deleted successfully"
      });

      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete event",
        variant: "destructive"
      });
    }
  };

  if (rolesLoading || loading || venuesLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Events Management</h1>
            <p className="text-muted-foreground">Create and manage events</p>
          </div>
        </div>
        <div className="flex gap-2">
          <EventsCsvImport onImportComplete={refetch} />
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                Create Event
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingEvent ? 'Edit Event' : 'Create New Event'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Event Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Event Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="event_type">Event Type</Label>
                    <Select
                      value={formData.event_type}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, event_type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {eventTypes.map(type => (
                          <SelectItem key={type} value={type}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>

              {/* Date & Time */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Date & Time</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          initialFocus
                          className="pointer-events-auto"
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
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !endDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Location</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="venue_id">Select Venue (Optional)</Label>
                    <Select value={formData.venue_id} onValueChange={handleVenueSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose existing venue or enter custom location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom Location</SelectItem>
                        {venues.map((venue) => (
                          <SelectItem key={venue.id} value={venue.id}>
                            {venue.name} - {venue.city}, {venue.state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="venue_name">Venue Name</Label>
                      <Input
                        id="venue_name"
                        value={formData.venue_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, venue_name: e.target.value }))}
                        disabled={!!formData.venue_id}
                      />
                    </div>
                    <div>
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                        disabled={!!formData.venue_id}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                        required
                        disabled={!!formData.venue_id}
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                        disabled={!!formData.venue_id}
                      />
                    </div>
                    <div>
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        value={formData.country}
                        onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                        disabled={!!formData.venue_id}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Pricing & Capacity */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Pricing & Capacity</h3>
                <div className="flex items-center space-x-2 mb-4">
                  <Checkbox
                    id="is_free"
                    checked={formData.is_free}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_free: checked as boolean }))}
                  />
                  <Label htmlFor="is_free">Free Event</Label>
                </div>
                
                {!formData.is_free && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price_min">Min Price</Label>
                      <Input
                        id="price_min"
                        type="number"
                        step="0.01"
                        value={formData.price_min}
                        onChange={(e) => setFormData(prev => ({ ...prev, price_min: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="price_max">Max Price</Label>
                      <Input
                        id="price_max"
                        type="number"
                        step="0.01"
                        value={formData.price_max}
                        onChange={(e) => setFormData(prev => ({ ...prev, price_max: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="max_attendees">Max Attendees</Label>
                    <Input
                      id="max_attendees"
                      type="number"
                      value={formData.max_attendees}
                      onChange={(e) => setFormData(prev => ({ ...prev, max_attendees: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="age_restriction">Age Restriction</Label>
                    <Select
                      value={formData.age_restriction}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, age_restriction: value }))}
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
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Additional Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="organizer_name">Organizer Name</Label>
                    <Input
                      id="organizer_name"
                      value={formData.organizer_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, organizer_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="organizer_contact">Organizer Contact</Label>
                    <Input
                      id="organizer_contact"
                      value={formData.organizer_contact}
                      onChange={(e) => setFormData(prev => ({ ...prev, organizer_contact: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={formData.website}
                      onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ticket_url">Ticket URL</Label>
                    <Input
                      id="ticket_url"
                      value={formData.ticket_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, ticket_url: e.target.value }))}
                    />
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="featured"
                    checked={formData.featured}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, featured: checked as boolean }))}
                  />
                  <Label htmlFor="featured">Featured Event</Label>
                </div>
              </div>

              {/* Event Images */}
              <EventImageUpload
                images={formData.images}
                onChange={(images) => setFormData(prev => ({ ...prev, images }))}
                maxImages={5}
              />

              <Button type="submit" className="w-full">
                {editingEvent ? 'Update Event' : 'Create Event'}
              </Button>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {eventTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{events.length}</p>
                <p className="text-sm text-muted-foreground">Total Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {events.filter(e => new Date(e.start_date) > new Date()).length}
                </p>
                <p className="text-sm text-muted-foreground">Upcoming</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-accent" />
              <div>
                <p className="text-2xl font-bold">{events.filter(e => e.featured).length}</p>
                <p className="text-sm text-muted-foreground">Featured</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-secondary" />
              <div>
                <p className="text-2xl font-bold">{new Set(events.map(e => e.city)).size}</p>
                <p className="text-sm text-muted-foreground">Cities</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Events List */}
      <Card>
        <CardHeader>
          <CardTitle>Events ({filteredEvents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">{event.title}</h3>
                    <Badge variant="outline">{event.event_type}</Badge>
                    {event.featured && (
                      <Badge className="bg-secondary/10 text-secondary">Featured</Badge>
                    )}
                    {event.is_free && (
                      <Badge className="bg-accent/10 text-accent">Free</Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                    <div className="flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      {format(new Date(event.start_date), "MMM d, yyyy")}
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {event.city}, {event.state}
                    </div>
                    {event.venue_name && (
                      <div>{event.venue_name}</div>
                    )}
                  </div>

                  {event.description && (
                    <p className="text-sm text-muted-foreground">
                      {event.description.slice(0, 100)}...
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditEvent(event)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteEvent(event.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            
            {filteredEvents.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No events found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}