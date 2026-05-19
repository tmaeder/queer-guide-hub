import { MotionCard as Card, CardImage, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Users, Globe, Building2, Crown, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import type {
  CountryWithRegions as Country,
  CityWithCountry as City,
} from '@/hooks/usePlaces';
import { useState, useEffect, memo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { supabase } from '@/integrations/supabase/client';
import { updateRow } from '@/hooks/usePageFetchers';
import { useCityImages } from '@/hooks/useCityImages';
import { getLegalityBadge, type LegalityLevel } from '@/lib/lgbtLegality';

interface PlacesCardProps {
  type: 'continent' | 'country' | 'city';
  name: string;
  data?: Country | City | unknown;
  onClick?: () => void;
}

export const PlacesCard = memo(function PlacesCard({ type, name, data, onClick }: PlacesCardProps) {
  const [countryImage, setCountryImage] = useState<string | null>(data?.image_url || null);
  const [_imageLoading, setImageLoading] = useState(false);

  // City images hook
  const { fetchCityImage, loading: _cityImageLoading } = useCityImages();
  const [cityImageUrl, setCityImageUrl] = useState<string | null>(data?.image_url || null);
  const [cityImageError, setCityImageError] = useState(false);

  // Fetch country image: use DB image_url first, fall back to Pexels, save result
  useEffect(() => {
    if (type !== 'country' || !name || !data?.id) return;
    // Already have image from DB
    if (data?.image_url) {
      setCountryImage(data.image_url);
      return;
    }

    setImageLoading(true);
    const fetchCountryImage = async () => {
      try {
        // Editorial Pexels queries — bias toward LGBTQ+ pride / queer-culture
        // imagery for countries known as queer destinations. Falls back to
        // landmark queries for everywhere else.
        const countrySpecificQueries: Record<string, string> = {
          // Queer-essential destinations — pride / community imagery first
          Germany: 'Berlin Pride Christopher Street Day parade rainbow',
          Netherlands: 'Amsterdam Pride canal parade rainbow',
          Spain: 'Madrid Pride rainbow flag parade',
          Portugal: 'Lisbon Pride parade rainbow',
          France: 'Paris Pride Marche des Fiertés rainbow',
          Belgium: 'Brussels Pride parade rainbow',
          Sweden: 'Stockholm Pride parade rainbow',
          Denmark: 'Copenhagen Pride parade rainbow',
          Norway: 'Oslo Pride parade rainbow',
          Finland: 'Helsinki Pride parade rainbow',
          Iceland: 'Reykjavik Pride parade rainbow',
          Ireland: 'Dublin Pride parade rainbow',
          Malta: 'Malta Pride Valletta rainbow',
          'United Kingdom': 'London Pride parade rainbow flag',
          'United States': 'San Francisco Pride parade rainbow Castro',
          Canada: 'Toronto Pride parade rainbow Church Wellesley',
          Mexico: 'Mexico City Pride Marcha del Orgullo rainbow',
          Brazil: 'São Paulo Pride parade Avenida Paulista rainbow',
          Argentina: 'Buenos Aires Pride Marcha del Orgullo rainbow',
          Uruguay: 'Montevideo Pride parade rainbow',
          Australia: 'Sydney Mardi Gras parade rainbow',
          'New Zealand': 'Auckland Pride parade rainbow',
          'South Africa': 'Cape Town Pride parade rainbow',
          Thailand: 'Bangkok Pride parade rainbow',
          // Landmark fallbacks for the rest
          Italy: 'Italy Colosseum Rome landmarks',
          Japan: 'Japan Mount Fuji Tokyo landmarks',
          China: 'China Great Wall Beijing landmarks',
          India: 'India Taj Mahal Delhi landmarks',
          Russia: 'Russia Red Square Moscow landmarks',
          Greece: 'Greece Parthenon Athens landmarks',
          Egypt: 'Egypt Pyramids Cairo landmarks',
          Turkey: 'Turkey Hagia Sophia Istanbul landmarks',
          Switzerland: 'Switzerland Alps Matterhorn landmarks',
        };

        const specificQuery = countrySpecificQueries[name];
        const query = specificQuery || `${name} famous landmarks architecture cityscape`;

        const { data: imageData, error } = await supabase.functions.invoke('get-pexels-images', {
          body: { query, type: 'country', page: 1 },
        });

        if (error || !imageData?.images?.length) return;

        // Deterministic index based on country name
        const countryHash = name.split('').reduce((a, b) => {
          a = (a << 5) - a + b.charCodeAt(0);
          return a & a;
        }, 0);
        const imageIndex = Math.abs(countryHash) % imageData.images.length;
        const imageUrl = imageData.images[imageIndex].url;
        setCountryImage(imageUrl);

        // Save to DB so future visits don't need Pexels
        void updateRow('countries', data.id, { image_url: imageUrl });
      } catch (_err) {
        // Silently fail — fallback image handles it
      } finally {
        setImageLoading(false);
      }
    };
    fetchCountryImage();
  }, [type, name, data?.id, data?.image_url]);

  // Fetch city image if it's a city and doesn't have an image
  useEffect(() => {
    if (type === 'city' && !cityImageUrl && !cityImageError && data?.id) {
      const loadCityImage = async () => {
        try {
          const result = await fetchCityImage(
            data.id,
            name,
            data.countries?.name || data.country_name,
          );
          if (result?.image_url) {
            setCityImageUrl(result.image_url);
          } else {
            setCityImageError(true);
          }
        } catch (_error) {
          setCityImageError(true);
        }
      };
      loadCityImage();
    }
  }, [
    type,
    data?.id,
    name,
    cityImageUrl,
    cityImageError,
    fetchCityImage,
    data?.countries?.name,
    data?.country_name,
  ]);

  const formatPopulation = (population?: number | null) => {
    if (!population) return null;
    if (population >= 1000000) {
      return `${(population / 1000000).toFixed(1)}M`;
    } else if (population >= 1000) {
      return `${(population / 1000).toFixed(0)}K`;
    }
    return population.toString();
  };

  const getIcon = () => {
    switch (type) {
      case 'continent':
        return <Globe style={{ height: 20, width: 20 }} />;
      case 'country':
        return <MapPin style={{ height: 20, width: 20 }} />;
      case 'city':
        return <Building2 style={{ height: 20, width: 20 }} />;
      default:
        return null;
    }
  };

  const getSubtitle = () => {
    if (type === 'country' && data) {
      const country = data as Country;
      const legality = getLegalityBadge(country);
      return (
        <div className="flex flex-col gap-1">
          {country.capital && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Crown style={{ height: 16, width: 16 }} />
              <span>{country.capital}</span>
            </div>
          )}
          {legality && <LegalityBadge legality={legality} />}
        </div>
      );
    }

    if (type === 'city' && data) {
      const city = data as City;
      return (
        <div className="flex flex-col gap-1">
          {city.countries && (
            <p className="text-sm text-muted-foreground">{city.countries.name}</p>
          )}
          <div className="flex gap-2">
            {city.is_capital && (
              <div
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 24,
                  height: 24,
                  backgroundColor: 'rgba(var(--primary-rgb, 59, 130, 246), 0.1)',
                }}
              >
                <Crown style={{ height: 12, width: 12 }} />
              </div>
            )}
            {city.is_major_city && (
              <div
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 24,
                  height: 24,
                  backgroundColor: 'rgba(var(--secondary-rgb, 107, 114, 128), 0.1)',
                }}
              >
                <Building2
                  style={{ height: 12, width: 12, color: 'var(--secondary-foreground)' }}
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  const getStats = () => {
    if (data?.population) {
      return (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Users style={{ height: 16, width: 16 }} />
          <span>{formatPopulation(data.population)}</span>
        </div>
      );
    }
    return null;
  };

  const cardContent = (
    <Card>
      {type === 'country' && (
        <CardImage
          src={countryImage}
          alt={`${name} landscape`}
          fallbackIcon={Globe}
          height={200}
        />
      )}

      {type === 'city' && (
        <CardImage
          src={cityImageUrl && !cityImageError ? cityImageUrl : null}
          alt={`${name} cityscape`}
          fallbackIcon={Building2}
          height={200}
        />
      )}

      <CardHeader
        style={
          type === 'country' || type === 'city'
            ? { paddingBottom: 8, paddingTop: 12, paddingLeft: 12, paddingRight: 12 }
            : { paddingBottom: 12 }
        }
      >
        <CardTitle
          style={
            type === 'country' || type === 'city'
              ? {
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }
              : { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
          }
        >
          <div className="flex items-center gap-2">
            {type !== 'country' && type !== 'city' && getIcon()}
            <span
              style={
                type === 'country' || type === 'city'
                  ? { fontSize: '0.875rem', fontWeight: 500 }
                  : { fontSize: '1.125rem' }
              }
            >
              {name}
            </span>
          </div>
          {type !== 'country' && type !== 'city' && getStats()}
        </CardTitle>
      </CardHeader>

      {getSubtitle() && <CardContent style={{ paddingTop: 0 }}>{getSubtitle()}</CardContent>}
    </Card>
  );

  // Wrap with Link for cities and countries, otherwise use onClick
  if (type === 'city' && data?.id) {
    return (
      <LocalizedLink to={`/city/${data.slug || data.id}`} style={{ display: 'block' }}>
        {cardContent}
      </LocalizedLink>
    );
  }

  if (type === 'country' && data?.id) {
    return (
      <LocalizedLink to={`/country/${data.slug || data.id}`} style={{ display: 'block' }}>
        {cardContent}
      </LocalizedLink>
    );
  }

  // For continents or items without detail pages, use onClick
  return <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}>{cardContent}</div>;
});

const LEGALITY_ICON_STYLE: React.CSSProperties = { height: 12, width: 12 };

function LegalityBadge({ legality }: { legality: { level: LegalityLevel; label: string; ariaLabel: string } }) {
  const Icon = legality.level === 'protected' ? ShieldCheck : legality.level === 'restricted' ? ShieldAlert : Shield;
  return (
    <Badge
      variant={legality.level === 'protected' ? 'secondary' : 'outline'}
      aria-label={legality.ariaLabel}
      data-testid={`legality-${legality.level}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 500 }}
    >
      <Icon style={LEGALITY_ICON_STYLE} />
      <span>{legality.label}</span>
    </Badge>
  );
}
