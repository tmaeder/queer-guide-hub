import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useAuth } from '@/hooks/useAuth';
import { useTripMutations } from '@/hooks/useTrips';
import {
  CityCountryAutocomplete,
  type GeoSelection,
} from '@/components/trips/create/CityCountryAutocomplete';

export function StartTripHero() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { createTrip } = useTripMutations();

  const [geo, setGeo] = useState<GeoSelection | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handlePlan = async () => {
    setError(null);
    if (!geo) {
      setError(t('pages.travel.hero.errors.city', 'Pick a city to plan a trip.'));
      return;
    }
    if (!user) {
      // Park selection on /trips so user can sign in then build
      const params = new URLSearchParams({
        cityId: geo.cityId,
        cityName: geo.cityName,
        countryId: geo.countryId,
        countryName: geo.countryName,
      });
      if (geo.countryCode) params.set('countryCode', geo.countryCode);
      if (geo.timezone) params.set('timezone', geo.timezone);
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);
      navigate(`/trips?${params.toString()}`);
      return;
    }
    try {
      const trip = await createTrip.mutateAsync({
        title: `${geo.cityName} trip`,
        primary_city_id: geo.cityId,
        primary_country_id: geo.countryId,
        primary_city_name: geo.cityName,
        primary_country_code: geo.countryCode ?? undefined,
        timezone: geo.timezone ?? undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      navigate(`/trips/${trip.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create trip');
    }
  };

  return (
    <section className="border border-border bg-background p-6 sm:p-8 mb-8 rounded">
      <h1 className="text-3xl font-extrabold tracking-tight mb-2">
        {t('pages.travel.hero.title', 'Plan a trip')}
      </h1>
      <p className="text-muted-foreground mb-5 max-w-prose">
        {t(
          'pages.travel.hero.subtitle',
          'Build a queer-friendly itinerary: pick a city, pull in Pride events, bars, hotels, and safety context for every stop. Save it, share it, take it on the road.',
        )}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_160px_auto] gap-3 items-end">
        <CityCountryAutocomplete
          id="travel-hero-city"
          label={t('pages.travel.hero.cityLabel', 'Where to?')}
          value={geo}
          onChange={setGeo}
          required
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor="travel-hero-start">
            {t('pages.travel.hero.start', 'Start')}
          </Label>
          <Input
            id="travel-hero-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="travel-hero-end">
            {t('pages.travel.hero.end', 'End')}
          </Label>
          <Input
            id="travel-hero-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || undefined}
          />
        </div>
        <Button
          onClick={handlePlan}
          disabled={createTrip.isPending}
          data-testid="travel-plan-trip"
        >
          {createTrip.isPending && (
            <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} />
          )}
          {t('pages.travel.hero.cta', 'Plan this trip')}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive mt-3">{error}</p>}

      <p className="text-sm text-muted-foreground mt-4">
        {t('pages.travel.hero.discover', 'Or')}{' '}
        <LocalizedLink to="/trips/discover">
          {t('pages.travel.hero.discoverLink', 'browse public trips')}
        </LocalizedLink>{' '}
        {t('pages.travel.hero.discoverTail', 'from the community.')}
      </p>
    </section>
  );
}
