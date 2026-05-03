import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { CreateGroupEventData } from '@/hooks/useGroupEvents';

interface CreateGroupEventDialogProps {
  onCreateEvent: (eventData: CreateGroupEventData) => void;
  isCreating: boolean;
}

export function CreateGroupEventDialog({ onCreateEvent, isCreating }: CreateGroupEventDialogProps) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    venue_name: '',
    address: '',
    city: '',
    state: '',
    event_type: 'social',
    is_free: true,
    price_min: '',
    price_max: '',
    max_attendees: '',
    ticket_url: '',
    website: '',
    age_restriction: '',
    organizer_name: '',
    organizer_contact: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!startDate || !formData.title || !formData.city) {
      return;
    }

    const eventData: CreateGroupEventData = {
      title: formData.title,
      description: formData.description || undefined,
      start_date: startDate.toISOString(),
      end_date: endDate?.toISOString(),
      venue_name: formData.venue_name || undefined,
      address: formData.address || undefined,
      city: formData.city,
      state: formData.state || undefined,
      event_type: formData.event_type,
      is_free: formData.is_free,
      price_min: formData.price_min ? parseFloat(formData.price_min) : undefined,
      price_max: formData.price_max ? parseFloat(formData.price_max) : undefined,
      max_attendees: formData.max_attendees ? parseInt(formData.max_attendees) : undefined,
      ticket_url: formData.ticket_url || undefined,
      website: formData.website || undefined,
      age_restriction: formData.age_restriction || undefined,
      organizer_name: formData.organizer_name || undefined,
      organizer_contact: formData.organizer_contact || undefined
    };

    onCreateEvent(eventData);

    // Reset form
    setFormData({
      title: '',
      description: '',
      venue_name: '',
      address: '',
      city: '',
      state: '',
      event_type: 'social',
      is_free: true,
      price_min: '',
      price_max: '',
      max_attendees: '',
      ticket_url: '',
      website: '',
      age_restriction: '',
      organizer_name: '',
      organizer_contact: ''
    });
    setStartDate(undefined);
    setEndDate(undefined);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
          Create Event
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Group Event</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter event title"
                required
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe your event"
                rows={3}
              />
            </div>

            <div>
              <Label>Start Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"

                  >
                    <CalendarIcon style={{ marginRight: 8, height: 16, width: 16 }} />
                    {startDate ? format(startDate, "PPP") : "Select start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent>
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
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"

                  >
                    <CalendarIcon style={{ marginRight: 8, height: 16, width: 16 }} />
                    {endDate ? format(endDate, "PPP") : "Select end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent>
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

            <div>
              <Label htmlFor="event_type">Event Type</Label>
              <Select value={formData.event_type} onValueChange={(value) => setFormData({ ...formData, event_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="social">Social</SelectItem>
                  <SelectItem value="meetup">Meetup</SelectItem>
                  <SelectItem value="workshop">Workshop</SelectItem>
                  <SelectItem value="conference">Conference</SelectItem>
                  <SelectItem value="party">Party</SelectItem>
                  <SelectItem value="sports">Sports</SelectItem>
                  <SelectItem value="cultural">Cultural</SelectItem>
                  <SelectItem value="educational">Educational</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Event city"
                required
              />
            </div>

            <div>
              <Label htmlFor="venue_name">Venue Name</Label>
              <Input
                id="venue_name"
                value={formData.venue_name}
                onChange={(e) => setFormData({ ...formData, venue_name: e.target.value })}
                placeholder="Venue name"
              />
            </div>

            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="State"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Event address"
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="is_free"
                  checked={formData.is_free}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_free: checked })}
                />
                <Label htmlFor="is_free">Free Event</Label>
              </div>
            </div>

            {!formData.is_free && (
              <>
                <div>
                  <Label htmlFor="price_min">Min Price ($)</Label>
                  <Input
                    id="price_min"
                    type="number"
                    value={formData.price_min}
                    onChange={(e) => setFormData({ ...formData, price_min: e.target.value })}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>

                <div>
                  <Label htmlFor="price_max">Max Price ($)</Label>
                  <Input
                    id="price_max"
                    type="number"
                    value={formData.price_max}
                    onChange={(e) => setFormData({ ...formData, price_max: e.target.value })}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
              </>
            )}

            <div>
              <Label htmlFor="max_attendees">Max Attendees</Label>
              <Input
                id="max_attendees"
                type="number"
                value={formData.max_attendees}
                onChange={(e) => setFormData({ ...formData, max_attendees: e.target.value })}
                placeholder="Unlimited"
              />
            </div>

            <div>
              <Label htmlFor="age_restriction">Age Restriction</Label>
              <Select value={formData.age_restriction} onValueChange={(value) => setFormData({ ...formData, age_restriction: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select age restriction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No restriction</SelectItem>
                  <SelectItem value="18+">18+</SelectItem>
                  <SelectItem value="21+">21+</SelectItem>
                  <SelectItem value="all-ages">All ages</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="organizer_name">Organizer Name</Label>
              <Input
                id="organizer_name"
                value={formData.organizer_name}
                onChange={(e) => setFormData({ ...formData, organizer_name: e.target.value })}
                placeholder="Event organizer"
              />
            </div>

            <div>
              <Label htmlFor="organizer_contact">Organizer Contact</Label>
              <Input
                id="organizer_contact"
                value={formData.organizer_contact}
                onChange={(e) => setFormData({ ...formData, organizer_contact: e.target.value })}
                placeholder="Contact information"
              />
            </div>

            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://example.com"
              />
            </div>

            <div>
              <Label htmlFor="ticket_url">Ticket URL</Label>
              <Input
                id="ticket_url"
                value={formData.ticket_url}
                onChange={(e) => setFormData({ ...formData, ticket_url: e.target.value })}
                placeholder="https://tickets.example.com"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isCreating || !startDate || !formData.title || !formData.city}

            >
              {isCreating ? "Creating..." : "Create Event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
