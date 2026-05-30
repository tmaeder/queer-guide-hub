import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Users, Globe, Building2, Loader2, ImageIcon, Crown } from 'lucide-react';
import { Country, City } from '@/hooks/useDirectory';
import { useState, useEffect } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { supabase } from '@/integrations/supabase/client';
import { useCityImages } from '@/hooks/useCityImages';
interface DirectoryCardProps {
  type: 'continent' | 'country' | 'city';
  name: string;
  data?: Country | City | unknown;
  onClick?: () => void;
}
export const DirectoryCard = ({ type, name, data, onClick }: DirectoryCardProps) => {
  const [countryImage, setCountryImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageKey, _setImageKey] = useState(0); // Force refresh mechanism

  // City images hook
  const { fetchCityImage, loading: cityImageLoading } = useCityImages();
  const [cityImageUrl, setCityImageUrl] = useState<string | null>(data?.image_url || null);
  const [cityImageError, setCityImageError] = useState(false);
  useEffect(() => {
    if (type === 'country' && name) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setImageLoading(true);
      const fetchCountryImage = async () => {
        try {
          // Create more specific country queries for better representative images
          const countrySpecificQueries = {
            France: 'France Eiffel Tower Paris landmarks',
            Italy: 'Italy Colosseum Rome landmarks',
            Japan: 'Japan Mount Fuji Tokyo landmarks',
            'United States': 'USA Statue of Liberty New York landmarks',
            'United Kingdom': 'UK Big Ben London landmarks',
            Germany: 'Germany Brandenburg Gate Berlin landmarks',
            Spain: 'Spain Sagrada Familia Barcelona landmarks',
            China: 'China Great Wall Beijing landmarks',
            India: 'India Taj Mahal Delhi landmarks',
            Brazil: 'Brazil Christ Redeemer Rio landmarks',
            Australia: 'Australia Sydney Opera House landmarks',
            Canada: 'Canada CN Tower Toronto landmarks',
            Russia: 'Russia Red Square Moscow landmarks',
            Greece: 'Greece Parthenon Athens landmarks',
            Egypt: 'Egypt Pyramids Cairo landmarks',
            Thailand: 'Thailand Bangkok temples landmarks',
            Turkey: 'Turkey Hagia Sophia Istanbul landmarks',
            Mexico: 'Mexico Chichen Itza landmarks',
            Netherlands: 'Netherlands Amsterdam canals landmarks',
            Switzerland: 'Switzerland Alps Matterhorn landmarks',
          };

          // Use specific query if available, otherwise use generic country query
          const specificQuery = countrySpecificQueries[name as keyof typeof countrySpecificQueries];
          const query = specificQuery || `${name} famous landmarks architecture cityscape`;

          // Add a small random element to ensure different images for each country
          const randomSeed = Math.floor(Math.random() * 5) + 1;
          const finalQuery = `${query} ${randomSeed}`;
          const { data: imageData, error } = await supabase.functions.invoke('get-pexels-images', {
            body: {
              query: finalQuery,
              type: 'country',
              page: 1, // Use first page for most relevant results
            },
          });
          if (error) {
            console.error('Error fetching country image:', error);
            return;
          }
          if (imageData?.images && imageData.images.length > 0) {
            // Use a deterministic but unique index based on country name
            const countryHash = name.split('').reduce((a, b) => {
              a = (a << 5) - a + b.charCodeAt(0);
              return a & a;
            }, 0);
            const imageIndex = Math.abs(countryHash) % imageData.images.length;
            setCountryImage(imageData.images[imageIndex].url);
          }
        } catch (error) {
          console.error('Error fetching country image:', error);
        } finally {
          setImageLoading(false);
        }
      };
      fetchCountryImage();
    }
  }, [type, name, imageKey]); // Include imageKey to trigger refresh

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
        } catch (error) {
          console.error('Failed to load city image:', error);
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
        return <Globe size={20} className="text-primary" />;
      case 'country':
        return <MapPin size={20} className="text-primary" />;
      case 'city':
        return <Building2 size={20} className="text-primary" />;
      default:
        return null;
    }
  };
  const getSubtitle = () => {
    if (type === 'country' && data) {
      const country = data as Country;
      return (
        <div style={{ flexDirection: 'column' }} className="flex gap-1">
          {country.capital && (
            <div
              style={{ alignItems: 'center' }}
              className="flex gap-1 text-sm text-muted-foreground"
            >
              <Crown size={16} />
              <span>{country.capital}</span>
            </div>
          )}
        </div>
      );
    }
    if (type === 'city' && data) {
      const city = data as City;
      return (
        <div style={{ flexDirection: 'column' }} className="flex gap-1">
          {city.countries && (
            <p className="text-sm text-muted-foreground m-0">{city.countries.name}</p>
          )}
          <div className="flex gap-2">
            {city.is_capital && (
              <div
                className="rounded-full flex"
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  backgroundColor: 'rgba(var(--primary-rgb), 0.1)',
                }}
              >
                <Crown size={12} className="text-primary" />
              </div>
            )}
            {city.is_major_city && (
              <div
                className="rounded-full flex"
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  backgroundColor: 'rgba(var(--secondary-rgb), 0.1)',
                }}
              >
                <Building2 size={12} style={{ color: 'var(--secondary-foreground)' }} />
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
        <div style={{ alignItems: 'center' }} className="flex gap-1 text-sm text-muted-foreground">
          <Users size={16} />
          <span>{formatPopulation(data.population)}</span>
        </div>
      );
    }
    return null;
  };
  const cardContent = (
    <Card className="group transition-colors duration-300 hover:border-foreground/40 cursor-pointer">
      {/* Country Image */}
      {type === 'country' && (
        <div
          className="rounded-t-container overflow-hidden"
          style={{ aspectRatio: '4/3', width: '100%', backgroundColor: 'var(--accent)' }}
        >
          {imageLoading ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="flex"
            >
              <div
                style={{
                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  backgroundColor: 'rgba(var(--muted-foreground-rgb), 0.2)',
                  width: '100%',
                  height: '100%',
                }}
              ></div>
            </div>
          ) : (
            <img
              loading="lazy"
              role="presentation"
              src={
                countryImage ||
                `https://images.unsplash.com/photo-1466442929976-97f336a657be?w=400&h=200&fit=crop`
              }
              alt={`${name} landscape`}
              className="transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                // Fallback to default image if Pexels image fails to load
                e.currentTarget.src = `https://images.unsplash.com/photo-1466442929976-97f336a657be?w=400&h=200&fit=crop`;
              }}
            />
          )}
        </div>
      )}

      {/* City Image */}
      {type === 'city' && (
        <div
          className="rounded-t-container overflow-hidden"
          style={{ aspectRatio: '4/3', width: '100%', backgroundColor: 'var(--accent)' }}
        >
          {cityImageLoading ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="flex"
            >
              <Loader2
                size={24}
                style={{ animation: 'spin 1s linear infinite' }}
                className="text-muted-foreground"
              />
            </div>
          ) : cityImageUrl && !cityImageError ? (
            <img
              loading="lazy"
              role="presentation"
              src={cityImageUrl}
              alt={`${name} cityscape`}
              className="transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setCityImageError(true)}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="flex"
            >
              <ImageIcon size={32} className="text-muted-foreground" />
            </div>
          )}
        </div>
      )}
      <CardHeader
        style={
          type === 'country' || type === 'city'
            ? { paddingBottom: 8, paddingTop: 12, paddingLeft: 12, paddingRight: 12 }
            : { paddingBottom: 12 }
        }
      >
        <CardTitle
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            ...(type === 'country' || type === 'city' ? { fontSize: '0.875rem' } : {}),
          }}
        >
          <div style={{ alignItems: 'center' }} className="flex gap-2">
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
      {getSubtitle() && <CardContent>{getSubtitle()}</CardContent>}
    </Card>
  );

  // Wrap with Link for cities and countries, otherwise use onClick
  if (type === 'city' && data?.id) {
    return (
      <LocalizedLink to={`/city/${data.slug || data.id}`} className="block">
        {cardContent}
      </LocalizedLink>
    );
  }
  if (type === 'country' && data?.id) {
    return (
      <LocalizedLink to={`/country/${data.slug || data.id}`} className="block">
        {cardContent}
      </LocalizedLink>
    );
  }

  // For continents or items without detail pages, use onClick
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {cardContent}
    </div>
  );
};
