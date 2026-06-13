import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, CloudRain, Sun } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { resolveEntityImage, isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Editable } from '@/components/admin/inline/Editable';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CountryRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WeatherData = any;

function WeatherGlyph({ condition }: { condition?: string }) {
  if (condition?.includes('rain') || condition?.includes('drizzle'))
    return <CloudRain className="h-4 w-4" aria-hidden="true" />;
  if (condition?.includes('cloud')) return <Cloud className="h-4 w-4" aria-hidden="true" />;
  return <Sun className="h-4 w-4" aria-hidden="true" />;
}

export interface CountryHeroProps {
  country: CountryRow;
  weatherData?: WeatherData;
  onContentUpdated?: () => void;
}

/**
 * Editorial, destination-first country hero. Full-bleed image with a black
 * readability scrim (the one permitted gradient) and the name + editorial hook
 * overlaid. Falls back to a monochrome flag block when no image resolves.
 */
export function CountryHero({ country, weatherData, onContentUpdated }: CountryHeroProps) {
  const { t } = useTranslation();
  const resolved = resolveEntityImage('country', country);
  // Only the live-fetch fallback needs state; the resolved url is derived from
  // props, so deriving it avoids syncing state to props inside an effect.
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
  const imageUrl = resolved.url ?? fetchedUrl;

  // Live-fetch fallback when nothing is persisted (mirrors CountryHeroImages).
  useEffect(() => {
    if (resolved.url) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('fetch-images', {
          body: {
            entity_type: 'country',
            id: country.id,
            name: country.name,
            capital: country.capital ?? undefined,
          },
        });
        if (cancelled || error || !data?.success) return;
        if (isValidImageUrl(data.image_url)) setFetchedUrl(data.image_url);
      } catch {
        /* silent — flag-block fallback stays */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [country.id, country.name, country.capital, resolved.url]);

  const continentName = (country.continents as { name?: string } | null)?.name;
  const regionName = (country.regions as { name?: string } | null)?.name;
  const place = [regionName, continentName].filter(Boolean).join(' · ');

  return (
    <div className="relative h-72 overflow-hidden rounded-container border bg-muted md:h-96">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <span className="text-hero-xl opacity-30" aria-hidden="true">
            {country.flag_emoji || '🏳️‍🌈'}
          </span>
        </div>
      )}
      {/* Black readability scrim — documented design exception. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/10" />

      {/* Top-right utility cluster */}
      <div className="absolute right-4 top-4 flex flex-wrap items-center justify-end gap-2">
        {weatherData?.current && (
          <div className="flex items-center gap-1.5 rounded-element bg-black/35 px-4 py-1.5 text-white backdrop-blur-sm">
            <WeatherGlyph condition={weatherData?.current?.condition} />
            <span className="text-sm font-semibold">
              {Math.round(weatherData.current.temperature)}°C
            </span>
          </div>
        )}
        <ReportButton contentType="countries" contentId={country.id} contentName={country.name} />
        <AdminEditButton
          contentType="countries"
          contentId={country.id}
          contentName={country.name}
          currentData={country as Record<string, unknown>}
          onSaved={onContentUpdated}
        />
      </div>

      {/* Bottom-left editorial overlay */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-6 md:p-8">
        {place && (
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-white/80">{place}</p>
        )}
        <h1 className="flex items-center gap-4 text-display font-bold leading-none text-white sm:text-hero">
          {country.flag_emoji && (
            <span aria-hidden="true" className="text-headline sm:text-display">
              {country.flag_emoji}
            </span>
          )}
          <Editable
            contentType="countries"
            recordId={country.id}
            field="name"
            value={country.name}
            onSaved={onContentUpdated}
          >
            {country.name}
          </Editable>
        </h1>
        {country.editorial_hook && (
          <p className="max-w-2xl text-body-lg font-medium text-white/90">
            {country.editorial_hook}
          </p>
        )}
        {!country.editorial_hook && country.capital && (
          <p className="text-body-lg text-white/80">
            {t('country.hero.capital', 'Capital')}: {country.capital}
          </p>
        )}
      </div>
    </div>
  );
}

export default CountryHero;
