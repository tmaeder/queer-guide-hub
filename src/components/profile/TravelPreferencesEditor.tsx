import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Shield, DollarSign, Compass, Home, Users, Accessibility } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface TravelPreferences {
  budget_level: string;
  safety_threshold: number;
  preferred_accommodation: string[];
  interests: string[];
  travel_style: string;
  accessibility_needs: string[];
}

const DEFAULT_PREFS: TravelPreferences = {
  budget_level: 'mid_range',
  safety_threshold: 50,
  preferred_accommodation: ['hotel'],
  interests: [],
  travel_style: 'solo',
  accessibility_needs: [],
};

const INTERESTS = [
  'nightlife', 'culture', 'food', 'nature', 'adventure',
  'wellness', 'shopping', 'art', 'history', 'beach',
];

const ACCOMMODATION_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'bnb', label: 'B&B / Guesthouse' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'apartment', label: 'Apartment' },
];

const ACCESSIBILITY_OPTIONS = [
  'wheelchair', 'hearing', 'visual', 'mobility', 'sensory',
];

export function TravelPreferencesEditor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<TravelPreferences>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('travel_preferences')
        .eq('user_id', user.id)
        .single();
      if (data?.travel_preferences) {
        setPrefs({ ...DEFAULT_PREFS, ...(data.travel_preferences as Partial<TravelPreferences>) });
      }
      setLoaded(true);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ travel_preferences: prefs })
        .eq('user_id', user.id);
      if (error) throw error;
      toast({ title: 'Travel preferences saved' });
    } catch (err) {
      toast({ title: 'Failed to save', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleArrayItem = (key: 'interests' | 'preferred_accommodation' | 'accessibility_needs', value: string) => {
    setPrefs((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }));
  };

  if (!loaded) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Budget */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DollarSign style={{ width: 18, height: 18 }} />
              Budget Level
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={prefs.budget_level} onValueChange={(v) => setPrefs((p) => ({ ...p, budget_level: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="budget">Budget</SelectItem>
              <SelectItem value="mid_range">Mid-Range</SelectItem>
              <SelectItem value="luxury">Luxury</SelectItem>
            </SelectContent>
          </Select>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Used to rank hotel and activity recommendations by price
          </Typography>
        </CardContent>
      </Card>

      {/* Safety Threshold */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Shield style={{ width: 18, height: 18 }} />
              Safety Threshold
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Minimum LGBTQ+ equality score for recommended destinations
          </Typography>
          <Slider
            value={prefs.safety_threshold}
            onChange={(_, v) => setPrefs((p) => ({ ...p, safety_threshold: v as number }))}
            min={0}
            max={100}
            step={5}
            valueLabelDisplay="on"
            marks={[
              { value: 0, label: 'Any' },
              { value: 40, label: 'Caution' },
              { value: 70, label: 'Safe' },
              { value: 100, label: 'Very Safe' },
            ]}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Destinations below this score will be deprioritized in recommendations (not hidden)
          </Typography>
        </CardContent>
      </Card>

      {/* Interests */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Compass style={{ width: 18, height: 18 }} />
              Travel Interests
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {INTERESTS.map((interest) => (
              <Badge
                key={interest}
                variant={prefs.interests.includes(interest) ? 'default' : 'outline'}
                onClick={() => toggleArrayItem('interests', interest)}

              >
                {interest}
              </Badge>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Accommodation */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Home style={{ width: 18, height: 18 }} />
              Preferred Accommodation
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {ACCOMMODATION_TYPES.map(({ value, label }) => (
              <Badge
                key={value}
                variant={prefs.preferred_accommodation.includes(value) ? 'default' : 'outline'}
                onClick={() => toggleArrayItem('preferred_accommodation', value)}

              >
                {label}
              </Badge>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Travel Style */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Users style={{ width: 18, height: 18 }} />
              Travel Style
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={prefs.travel_style} onValueChange={(v) => setPrefs((p) => ({ ...p, travel_style: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solo">Solo</SelectItem>
              <SelectItem value="couple">Couple</SelectItem>
              <SelectItem value="group">Group</SelectItem>
              <SelectItem value="family">Family</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Accessibility */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Accessibility style={{ width: 18, height: 18 }} />
              Accessibility Needs
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {ACCESSIBILITY_OPTIONS.map((need) => (
              <Badge
                key={need}
                variant={prefs.accessibility_needs.includes(need) ? 'default' : 'outline'}
                onClick={() => toggleArrayItem('accessibility_needs', need)}

              >
                {need}
              </Badge>
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            We'll prioritize accessible venues and hotels in your recommendations
          </Typography>
        </CardContent>
      </Card>

      {/* Save */}
      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save Travel Preferences'}
      </Button>
    </Box>
  );
}
