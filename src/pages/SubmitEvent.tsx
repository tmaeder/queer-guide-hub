import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Calendar, ArrowLeft, CheckCircle } from 'lucide-react';

const eventTypes = [
  'party', 'workshop', 'meetup', 'pride', 'rally', 'conference',
  'social', 'fundraiser', 'performance', 'drag_show', 'sports',
  'activism', 'art_exhibition', 'mixer', 'other',
];

const SubmitEvent = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_type: '',
    start_date: '',
    end_date: '',
    venue_name: '',
    city: '',
    country: '',
    website: '',
    // Honeypot
    _hp: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = (field: string, value: string) => {
    const newErrors = { ...errors };
    switch (field) {
      case 'title':
        if (!value.trim()) newErrors.title = 'Event title is required';
        else if (value.trim().length < 2) newErrors.title = 'Title must be at least 2 characters';
        else delete newErrors.title;
        break;
      case 'website':
        if (value && !/^https?:\/\/.+\..+/.test(value)) newErrors.website = 'Please enter a valid URL starting with http:// or https://';
        else delete newErrors.website;
        break;
      case 'end_date':
        if (value && form.start_date && value < form.start_date) newErrors.end_date = 'End date must be after start date';
        else delete newErrors.end_date;
        break;
      case 'start_date':
        if (form.end_date && form.end_date < value) newErrors.end_date = 'End date must be after start date';
        else delete newErrors.end_date;
        break;
      default:
        break;
    }
    setErrors(newErrors);
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot check
    if (form._hp) return;

    if (!form.title.trim()) {
      toast({ title: 'Event title is required', variant: 'destructive' });
      return;
    }

    if (form.website && !/^https?:\/\/.+\..+/.test(form.website)) {
      toast({ title: 'Invalid website URL', description: 'URL must start with http:// or https://', variant: 'destructive' });
      return;
    }

    if (form.end_date && form.start_date && form.end_date < form.start_date) {
      toast({ title: 'Invalid dates', description: 'End date must be after start date', variant: 'destructive' });
      return;
    }

    if (Object.keys(errors).length > 0) {
      toast({ title: 'Please fix form errors', variant: 'destructive' });
      return;
    }

    if (!user) {
      toast({
        title: 'Sign in to submit',
        description: 'Create a free account to submit events directly. Your submission will be reviewed by our team.',
        variant: 'default',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('events').insert([
        {
          title: form.title.trim(),
          description: form.description.trim() || null,
          event_type: form.event_type || null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          venue_name: form.venue_name.trim() || null,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          website: form.website.trim() || null,
          featured: false,
        },
      ]);

      if (error) throw error;

      setSubmitted(true);
      toast({ title: 'Event submitted!', description: 'Thank you — your event will be reviewed shortly.' });
    } catch (err: any) {
      toast({
        title: 'Submission failed',
        description: err.message || 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Box sx={{ maxWidth: '40rem', mx: 'auto', py: 6, px: 2 }}>
        <Card>
          <CardContent sx={{ p: 6, textAlign: 'center' }}>
            <CheckCircle style={{ width: 48, height: 48, margin: '0 auto 16px', color: '#4caf50' }} />
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
              Thank you!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Your event has been submitted and will be reviewed by our team. It will appear on the site once approved.
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
              <Button onClick={() => navigate('/events')}>Browse Events</Button>
              <Button variant="outline" onClick={() => { setSubmitted(false); setForm({ title: '', description: '', event_type: '', start_date: '', end_date: '', venue_name: '', city: '', country: '', website: '', _hp: '' }); }}>
                Submit Another
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: '40rem', mx: 'auto', py: 4, px: 2 }}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} />
        Back
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Calendar style={{ width: 28, height: 28 }} />
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Submit an Event
        </Typography>
      </Box>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Know about an upcoming LGBTQ+ event? Share it with the community. All submissions are reviewed before publishing.
      </Typography>

      {!user && (
        <Card sx={{ mb: 3, bgcolor: 'action.hover' }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Tip:</strong>{' '}
              <Box
                component="span"
                onClick={() => navigate('/auth')}
                sx={{ color: 'text.primary', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Sign in or create an account
              </Box>{' '}
              to submit events directly. Guest submissions are not currently supported.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent sx={{ p: 3 }}>
          <form onSubmit={handleSubmit}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {/* Honeypot */}
              <Box sx={{ position: 'absolute', left: -9999, opacity: 0, height: 0, overflow: 'hidden' }}>
                <Input
                  tabIndex={-1}
                  autoComplete="off"
                  value={form._hp}
                  onChange={(e) => updateField('_hp', e.target.value)}
                />
              </Box>

              <Box>
                <Label style={{ marginBottom: 4, display: 'block' }}>
                  Event Title <span style={{ color: '#d32f2f' }} aria-label="required">*</span>
                </Label>
                <Input
                  placeholder="e.g., Pride Parade Berlin 2026"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  required
                  aria-required="true"
                  aria-invalid={!!errors.title}
                  aria-describedby={errors.title ? 'title-error' : undefined}
                />
                {errors.title && (
                  <Typography variant="caption" sx={{ color: '#d32f2f', mt: 0.5, display: 'block' }} role="alert" id="title-error">
                    {errors.title}
                  </Typography>
                )}
              </Box>

              <Box>
                <Label style={{ marginBottom: 4, display: 'block' }}>Description</Label>
                <Textarea
                  placeholder="Tell us about this event — what should people expect?"
                  value={form.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('description', e.target.value)}
                  style={{ minHeight: 80 }}
                />
              </Box>

              <Box>
                <Label style={{ marginBottom: 4, display: 'block' }}>Event Type</Label>
                <Select value={form.event_type} onValueChange={(val) => updateField('event_type', val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select event type" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <Box>
                  <Label style={{ marginBottom: 4, display: 'block' }}>Start Date</Label>
                  <Input
                    type="datetime-local"
                    value={form.start_date}
                    onChange={(e) => updateField('start_date', e.target.value)}
                  />
                </Box>
                <Box>
                  <Label style={{ marginBottom: 4, display: 'block' }}>End Date</Label>
                  <Input
                    type="datetime-local"
                    value={form.end_date}
                    onChange={(e) => updateField('end_date', e.target.value)}
                    min={form.start_date || undefined}
                    aria-invalid={!!errors.end_date}
                    aria-describedby={errors.end_date ? 'end-date-error' : undefined}
                  />
                  {errors.end_date && (
                    <Typography variant="caption" sx={{ color: '#d32f2f', mt: 0.5, display: 'block' }} role="alert" id="end-date-error">
                      {errors.end_date}
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box>
                <Label style={{ marginBottom: 4, display: 'block' }}>Venue / Location</Label>
                <Input
                  placeholder="e.g., Club XYZ or Brandenburg Gate"
                  value={form.venue_name}
                  onChange={(e) => updateField('venue_name', e.target.value)}
                />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <Box>
                  <Label style={{ marginBottom: 4, display: 'block' }}>City</Label>
                  <Input
                    placeholder="e.g., Berlin"
                    value={form.city}
                    onChange={(e) => updateField('city', e.target.value)}
                  />
                </Box>
                <Box>
                  <Label style={{ marginBottom: 4, display: 'block' }}>Country</Label>
                  <Input
                    placeholder="e.g., Germany"
                    value={form.country}
                    onChange={(e) => updateField('country', e.target.value)}
                  />
                </Box>
              </Box>

              <Box>
                <Label style={{ marginBottom: 4, display: 'block' }}>Website / Ticket Link</Label>
                <Input
                  placeholder="https://..."
                  type="url"
                  value={form.website}
                  onChange={(e) => updateField('website', e.target.value)}
                  aria-invalid={!!errors.website}
                  aria-describedby={errors.website ? 'website-error' : undefined}
                />
                {errors.website && (
                  <Typography variant="caption" sx={{ color: '#d32f2f', mt: 0.5, display: 'block' }} role="alert" id="website-error">
                    {errors.website}
                  </Typography>
                )}
              </Box>

              <Button
                type="submit"
                disabled={submitting || !user}
                style={{
                  width: '100%',
                  backgroundColor: '#333333',
                  color: '#ffffff',
                  marginTop: 8,
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Event'}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default SubmitEvent;
