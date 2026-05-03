import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Shield, DollarSign, Compass, Home, Users, Accessibility, Plane, MapPin } from 'lucide-react';
import {
  fetchProfileTravelPreferences,
  fetchTravelPrefsHomeCity,
  saveProfileTravelPreferences,
} from '@/hooks/useTravelPreferencesEditor';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  useUserTravelPreferences,
  useUpdateUserTravelPreferences,
  type TransportMode,
  type BudgetTier,
} from '@/hooks/useUserTravelPreferences';
import {
  CityCountryAutocomplete,
  type GeoSelection,
} from '@/components/trips/create/CityCountryAutocomplete';

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

const TRANSPORT_OPTIONS: { value: TransportMode; label: string }[] = [
  { value: 'flight', label: 'Flight' },
  { value: 'rail', label: 'Rail' },
  { value: 'bus', label: 'Bus' },
  { value: 'car', label: 'Car' },
];

// budget_level (profiles.travel_preferences) uses 'mid_range'; user_travel_preferences uses 'mid'
const BUDGET_TO_TIER: Record<string, BudgetTier> = {
  budget: 'budget',
  mid_range: 'mid',
  luxury: 'luxury',
};

export function TravelPreferencesEditor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<TravelPreferences>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preferredTransport, setPreferredTransport] = useState<TransportMode[]>([]);
  const [homeCity, setHomeCity] = useState<GeoSelection | null>(null);

  const { data: travelPrefs } = useUserTravelPreferences();
  const updateTravelPrefs = useUpdateUserTravelPreferences();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const stored = await fetchProfileTravelPreferences(user.id);
      if (stored) {
        setPrefs({ ...DEFAULT_PREFS, ...stored });
      }
      setLoaded(true);
    })();
  }, [user]);

  // Hydrate transport + home city from user_travel_preferences
  useEffect(() => {
    if (!travelPrefs) return;
    setPreferredTransport(travelPrefs.preferred_transport ?? []);
    if (travelPrefs.home_city_id && !homeCity) {
      (async () => {
        const city = await fetchTravelPrefsHomeCity(travelPrefs.home_city_id!);
        if (city) setHomeCity(city);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelPrefs]);

  const toggleTransport = (mode: TransportMode) => {
    setPreferredTransport((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveProfileTravelPreferences(user.id, prefs);

      await updateTravelPrefs.mutateAsync({
        budget_tier: BUDGET_TO_TIER[prefs.budget_level] ?? null,
        preferred_transport: preferredTransport,
        home_city_id: homeCity?.cityId ?? null,
        home_country_id: homeCity?.countryId ?? null,
      });

      qc.invalidateQueries({ queryKey: ['trip-reservation-suggestions'] });
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
    <div className="flex flex-col gap-6">
      {/* Budget */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <DollarSign style={{ width: 18, height: 18 }} />
              Budget Level
            </div>
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
          <p className="text-xs text-muted-foreground mt-2 block">
            Used to rank hotel and activity recommendations by price
          </p>
        </CardContent>
      </Card>

      {/* Safety Threshold */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Shield style={{ width: 18, height: 18 }} />
              Safety Threshold
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4">
            Minimum LGBTQ+ equality score for recommended destinations
          </p>
          <Slider
            value={[prefs.safety_threshold]}
            onValueChange={([v]) => setPrefs((p) => ({ ...p, safety_threshold: v }))}
            min={0}
            max={100}
            step={5}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>Any (0)</span>
            <span>Caution (40)</span>
            <span>Safe (70)</span>
            <span>Very Safe (100)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 block">
            Current: {prefs.safety_threshold}. Destinations below this score will be deprioritized in recommendations (not hidden)
          </p>
        </CardContent>
      </Card>

      {/* Interests */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Compass style={{ width: 18, height: 18 }} />
              Travel Interests
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((interest) => (
              <Badge
                key={interest}
                variant={prefs.interests.includes(interest) ? 'default' : 'outline'}
                onClick={() => toggleArrayItem('interests', interest)}

              >
                {interest}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Accommodation */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Home style={{ width: 18, height: 18 }} />
              Preferred Accommodation
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ACCOMMODATION_TYPES.map(({ value, label }) => (
              <Badge
                key={value}
                variant={prefs.preferred_accommodation.includes(value) ? 'default' : 'outline'}
                onClick={() => toggleArrayItem('preferred_accommodation', value)}

              >
                {label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Travel Style */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Users style={{ width: 18, height: 18 }} />
              Travel Style
            </div>
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
            <div className="flex items-center gap-2">
              <Accessibility style={{ width: 18, height: 18 }} />
              Accessibility Needs
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ACCESSIBILITY_OPTIONS.map((need) => (
              <Badge
                key={need}
                variant={prefs.accessibility_needs.includes(need) ? 'default' : 'outline'}
                onClick={() => toggleArrayItem('accessibility_needs', need)}

              >
                {need}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2 block">
            We'll prioritize accessible venues and hotels in your recommendations
          </p>
        </CardContent>
      </Card>

      {/* Preferred Transport */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Plane style={{ width: 18, height: 18 }} />
              Preferred Transport
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {TRANSPORT_OPTIONS.map(({ value, label }) => (
              <Badge
                key={value}
                variant={preferredTransport.includes(value) ? 'default' : 'outline'}
                onClick={() => toggleTransport(value)}
              >
                {label}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2 block">
            Trip transport suggestions prioritize your preferred modes
          </p>
        </CardContent>
      </Card>

      {/* Home City */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <MapPin style={{ width: 18, height: 18 }} />
              Home City
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CityCountryAutocomplete
            value={homeCity}
            onChange={setHomeCity}
            label="Home city"
            id="travel-prefs-home-city"
          />
          <p className="text-xs text-muted-foreground mt-2 block">
            Used as the default origin for flight, rail and bus deep-links
          </p>
        </CardContent>
      </Card>

      {/* Save */}
      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save Travel Preferences'}
      </Button>
    </div>
  );
}
