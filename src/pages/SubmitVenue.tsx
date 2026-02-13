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
import { MapPin, ArrowLeft, CheckCircle } from 'lucide-react';

const venueCategories = [
  'bar', 'club', 'restaurant', 'cafe', 'hotel', 'sauna', 'shop',
  'community_center', 'cultural_space', 'outdoor', 'other',
];

const SubmitVenue = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    address: '',
    city: '',
    country: '',
    website: '',
    phone: '',
    email: '',
    // Honeypot field — should stay empty
    _hp: '',
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot check
    if (form._hp) return;

    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }

    if (!user) {
      toast({
        title: 'Sign in to submit',
        description: 'Create a free account to submit venues directly. Your submission will be reviewed by our team.',
        variant: 'default',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('venues').insert([
        {
          name: form.name.trim(),
          description: form.description.trim() || null,
          category: form.category || null,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          website: form.website.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          featured: false,
        },
      ]);

      if (error) throw error;

      setSubmitted(true);
      toast({ title: 'Venue submitted!', description: 'Thank you — your submission will be reviewed shortly.' });
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
              Your venue has been submitted and will be reviewed by our team. It will appear on the site once approved.
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
              <Button onClick={() => navigate('/venues')}>Browse Venues</Button>
              <Button variant="outline" onClick={() => { setSubmitted(false); setForm({ name: '', description: '', category: '', address: '', city: '', country: '', website: '', phone: '', email: '', _hp: '' }); }}>
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
        <MapPin style={{ width: 28, height: 28, color: '#333333' }} />
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Submit a Venue
        </Typography>
      </Box>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Know a queer-friendly venue? Share it with the community. All submissions are reviewed before publishing.
      </Typography>

      {!user && (
        <Card sx={{ mb: 3, bgcolor: '#f5f5f5' }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Tip:</strong>{' '}
              <Box
                component="span"
                onClick={() => navigate('/auth')}
                sx={{ color: '#333333', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Sign in or create an account
              </Box>{' '}
              to submit venues directly. Guest submissions are not currently supported.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent sx={{ p: 3 }}>
          <form onSubmit={handleSubmit}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {/* Honeypot — hidden from real users */}
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
                  Venue Name <span style={{ color: '#d32f2f' }}>*</span>
                </Label>
                <Input
                  placeholder="e.g., The Rainbow Lounge"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  required
                />
              </Box>

              <Box>
                <Label style={{ marginBottom: 4, display: 'block' }}>Description</Label>
                <Textarea
                  placeholder="Tell us about this venue — what makes it special?"
                  value={form.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('description', e.target.value)}
                  style={{ minHeight: 80 }}
                />
              </Box>

              <Box>
                <Label style={{ marginBottom: 4, display: 'block' }}>Category</Label>
                <Select value={form.category} onValueChange={(val) => updateField('category', val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {venueCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label style={{ marginBottom: 4, display: 'block' }}>Address</Label>
                <Input
                  placeholder="Full street address"
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <Box>
                  <Label style={{ marginBottom: 4, display: 'block' }}>Website</Label>
                  <Input
                    placeholder="https://..."
                    type="url"
                    value={form.website}
                    onChange={(e) => updateField('website', e.target.value)}
                  />
                </Box>
                <Box>
                  <Label style={{ marginBottom: 4, display: 'block' }}>Phone</Label>
                  <Input
                    placeholder="+49 30 12345678"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                  />
                </Box>
              </Box>

              <Box>
                <Label style={{ marginBottom: 4, display: 'block' }}>Email</Label>
                <Input
                  placeholder="contact@venue.com"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                />
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
                {submitting ? 'Submitting...' : 'Submit Venue'}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default SubmitVenue;
