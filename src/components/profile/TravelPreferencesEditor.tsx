import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  DollarSign,
  Compass,
  Home,
  Users,
  User,
  Accessibility,
  Plane,
  MapPin,
  Martini,
  Landmark,
  Utensils,
  Trees,
  Mountain,
  Leaf,
  ShoppingBag,
  Palette,
  BookOpen,
  Palmtree,
  Hotel,
  Coffee,
  BedDouble,
  Building,
  Ear,
  Eye,
  Footprints,
  Headphones,
  TrainFront,
  BusFront,
  Car,
  Wallet,
  Banknote,
  Crown,
  HeartHandshake,
} from '@/components/icons';
import {
  fetchProfileTravelPreferences,
  fetchTravelPrefsHomeCity,
  guessHomeCityFromProfile,
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
import { qk } from '@/lib/queryKeys';

interface TravelPreferences {
  budget_level: string;
  safety_threshold: number;
  preferred_accommodation: string[];
  interests: string[];
  travel_style: string[];
  accessibility_needs: string[];
}

const DEFAULT_PREFS: TravelPreferences = {
  budget_level: 'mid_range',
  safety_threshold: 50,
  preferred_accommodation: ['hotel'],
  interests: [],
  travel_style: ['solo'],
  accessibility_needs: [],
};

type Option<T extends string = string> = { value: T; label: string; icon: typeof Plane };

const INTERESTS: Option[] = [
  { value: 'nightlife', label: 'Nightlife', icon: Martini },
  { value: 'culture', label: 'Culture', icon: Landmark },
  { value: 'food', label: 'Food', icon: Utensils },
  { value: 'nature', label: 'Nature', icon: Trees },
  { value: 'adventure', label: 'Adventure', icon: Mountain },
  { value: 'wellness', label: 'Wellness', icon: Leaf },
  { value: 'shopping', label: 'Shopping', icon: ShoppingBag },
  { value: 'art', label: 'Art', icon: Palette },
  { value: 'history', label: 'History', icon: BookOpen },
  { value: 'beach', label: 'Beach', icon: Palmtree },
];

const ACCOMMODATION_TYPES: Option[] = [
  { value: 'hotel', label: 'Hotel', icon: Hotel },
  { value: 'bnb', label: 'B&B / Guesthouse', icon: Coffee },
  { value: 'hostel', label: 'Hostel', icon: BedDouble },
  { value: 'apartment', label: 'Apartment', icon: Building },
];

const ACCESSIBILITY_OPTIONS: Option[] = [
  { value: 'wheelchair', label: 'Wheelchair', icon: Accessibility },
  { value: 'hearing', label: 'Hearing', icon: Ear },
  { value: 'visual', label: 'Visual', icon: Eye },
  { value: 'mobility', label: 'Mobility', icon: Footprints },
  { value: 'sensory', label: 'Sensory', icon: Headphones },
];

const TRANSPORT_OPTIONS: Option<TransportMode>[] = [
  { value: 'flight', label: 'Flight', icon: Plane },
  { value: 'rail', label: 'Rail', icon: TrainFront },
  { value: 'bus', label: 'Bus', icon: BusFront },
  { value: 'car', label: 'Car', icon: Car },
];

const BUDGET_OPTIONS: Option[] = [
  { value: 'budget', label: 'Budget', icon: Wallet },
  { value: 'mid_range', label: 'Mid-Range', icon: Banknote },
  { value: 'luxury', label: 'Luxury', icon: Crown },
];

const STYLE_OPTIONS: Option[] = [
  { value: 'solo', label: 'Solo', icon: User },
  { value: 'couple', label: 'Couple', icon: HeartHandshake },
  { value: 'group', label: 'Group', icon: Users },
  { value: 'family', label: 'Family', icon: Home },
];

function Chips<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: Option<T>[];
  selected: readonly string[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ value, label, icon: Icon }) => (
        <ToggleChip
          key={value}
          pressed={selected.includes(value)}
          onPressedChange={() => onToggle(value)}
          icon={<Icon size={14} aria-hidden="true" />}
        >
          {label}
        </ToggleChip>
      ))}
    </div>
  );
}

function SelectItems({ options }: { options: Option[] }) {
  return options.map(({ value, label, icon: Icon }) => (
    <SelectItem key={value} value={value}>
      <span className="inline-flex items-center gap-2">
        <Icon size={16} aria-hidden="true" />
        {label}
      </span>
    </SelectItem>
  ));
}

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
        // travel_style was a single value before it became multi-select.
        const style = stored.travel_style as string | string[] | null | undefined;
        setPrefs({
          ...DEFAULT_PREFS,
          ...stored,
          travel_style: Array.isArray(style) ? style : style ? [style] : [],
        });
      }
      setLoaded(true);
    })();
  }, [user]);

  // Hydrate transport + home city from user_travel_preferences
  useEffect(() => {
    if (!travelPrefs) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setPreferredTransport(travelPrefs.preferred_transport ?? []);
    if (travelPrefs.home_city_id && !homeCity) {
      (async () => {
        const city = await fetchTravelPrefsHomeCity(travelPrefs.home_city_id!);
        if (city) setHomeCity(city);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelPrefs]);

  // No home city saved yet: prefill from the profile address. Not saved until Save.
  useEffect(() => {
    if (!user || homeCity || travelPrefs === undefined || travelPrefs?.home_city_id) return;
    let live = true;
    guessHomeCityFromProfile(user.id).then((city) => {
      if (live && city) setHomeCity((cur) => cur ?? city);
    });
    return () => {
      live = false;
    };
  }, [user, travelPrefs, homeCity]);

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

      qc.invalidateQueries({ queryKey: qk.trip.details() });
      toast({ title: 'Travel preferences saved' });
    } catch (err) {
      toast({ title: 'Failed to save', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleArrayItem = (
    key: 'interests' | 'preferred_accommodation' | 'accessibility_needs' | 'travel_style',
    value: string,
  ) => {
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
              <DollarSign size={18} />
              Budget Level
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={prefs.budget_level}
            onValueChange={(v) => setPrefs((p) => ({ ...p, budget_level: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItems options={BUDGET_OPTIONS} />
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
              <Shield size={18} />
              Safety Threshold
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4">Minimum LGBTQ+ equality score for recommended destinations</p>
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
            Current: {prefs.safety_threshold}. Destinations below this score will be deprioritized
            in recommendations (not hidden)
          </p>
        </CardContent>
      </Card>

      {/* Interests */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Compass size={18} />
              Travel Interests
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Chips
            options={INTERESTS}
            selected={prefs.interests}
            onToggle={(v) => toggleArrayItem('interests', v)}
          />
        </CardContent>
      </Card>

      {/* Accommodation */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Home size={18} />
              Preferred Accommodation
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Chips
            options={ACCOMMODATION_TYPES}
            selected={prefs.preferred_accommodation}
            onToggle={(v) => toggleArrayItem('preferred_accommodation', v)}
          />
        </CardContent>
      </Card>

      {/* Travel Style */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Users size={18} />
              Travel Style
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Chips
            options={STYLE_OPTIONS}
            selected={prefs.travel_style}
            onToggle={(v) => toggleArrayItem('travel_style', v)}
          />
        </CardContent>
      </Card>

      {/* Accessibility */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Accessibility size={18} />
              Accessibility Needs
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Chips
            options={ACCESSIBILITY_OPTIONS}
            selected={prefs.accessibility_needs}
            onToggle={(v) => toggleArrayItem('accessibility_needs', v)}
          />
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
              <Plane size={18} />
              Preferred Transport
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Chips
            options={TRANSPORT_OPTIONS}
            selected={preferredTransport}
            onToggle={toggleTransport}
          />
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
              <MapPin size={18} />
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
