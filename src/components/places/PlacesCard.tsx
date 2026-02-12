import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Globe, Building2, Loader2, ImageIcon, Crown } from "lucide-react";
import { Country, City } from "@/hooks/usePlaces";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCityImages } from "@/hooks/useCityImages";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface PlacesCardProps {
  type: "continent" | "country" | "city";
  name: string;
  data?: Country | City | any;
  onClick?: () => void;
}

export const PlacesCard = ({
  type,
  name,
  data,
  onClick
}: PlacesCardProps) => {
  const [countryImage, setCountryImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageKey, setImageKey] = useState(0); // Force refresh mechanism

  // City images hook
  const {
    fetchCityImage,
    loading: cityImageLoading
  } = useCityImages();
  const [cityImageUrl, setCityImageUrl] = useState<string | null>(data?.image_url || null);
  const [cityImageError, setCityImageError] = useState(false);

  useEffect(() => {
    if (type === "country" && name) {
      setImageLoading(true);
      const fetchCountryImage = async () => {
        try {
          // Create more specific country queries for better representative images
          const countrySpecificQueries = {
            'France': 'France Eiffel Tower Paris landmarks',
            'Italy': 'Italy Colosseum Rome landmarks',
            'Japan': 'Japan Mount Fuji Tokyo landmarks',
            'United States': 'USA Statue of Liberty New York landmarks',
            'United Kingdom': 'UK Big Ben London landmarks',
            'Germany': 'Germany Brandenburg Gate Berlin landmarks',
            'Spain': 'Spain Sagrada Familia Barcelona landmarks',
            'China': 'China Great Wall Beijing landmarks',
            'India': 'India Taj Mahal Delhi landmarks',
            'Brazil': 'Brazil Christ Redeemer Rio landmarks',
            'Australia': 'Australia Sydney Opera House landmarks',
            'Canada': 'Canada CN Tower Toronto landmarks',
            'Russia': 'Russia Red Square Moscow landmarks',
            'Greece': 'Greece Parthenon Athens landmarks',
            'Egypt': 'Egypt Pyramids Cairo landmarks',
            'Thailand': 'Thailand Bangkok temples landmarks',
            'Turkey': 'Turkey Hagia Sophia Istanbul landmarks',
            'Mexico': 'Mexico Chichen Itza landmarks',
            'Netherlands': 'Netherlands Amsterdam canals landmarks',
            'Switzerland': 'Switzerland Alps Matterhorn landmarks'
          };

          // Use specific query if available, otherwise use generic country query
          const specificQuery = countrySpecificQueries[name as keyof typeof countrySpecificQueries];
          const query = specificQuery || `${name} famous landmarks architecture cityscape`;

          // Add a small random element to ensure different images for each country
          const randomSeed = Math.floor(Math.random() * 5) + 1;
          const finalQuery = `${query} ${randomSeed}`;

          const {
            data: imageData,
            error
          } = await supabase.functions.invoke('get-pexels-images', {
            body: {
              query: finalQuery,
              type: 'country',
              page: 1 // Use first page for most relevant results
            }
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
    if (type === "city" && !cityImageUrl && !cityImageError && data?.id) {
      const loadCityImage = async () => {
        try {
          const result = await fetchCityImage(data.id, name, data.countries?.name || data.country_name);
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
  }, [type, data?.id, name, cityImageUrl, cityImageError, fetchCityImage, data?.countries?.name, data?.country_name]);

  const refreshImage = () => {
    setImageKey(prev => prev + 1);
  };

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
      case "continent":
        return <Globe style={{ height: 20, width: 20, color: 'var(--primary)' }} />;
      case "country":
        return <MapPin style={{ height: 20, width: 20, color: 'var(--primary)' }} />;
      case "city":
        return <Building2 style={{ height: 20, width: 20, color: 'var(--primary)' }} />;
      default:
        return null;
    }
  };

  const getSubtitle = () => {
    if (type === "country" && data) {
      const country = data as Country;
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {country.capital && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
              <Crown style={{ height: 16, width: 16 }} />
              <span>{country.capital}</span>
            </Box>
          )}
        </Box>
      );
    }

    if (type === "city" && data) {
      const city = data as City;
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {city.countries && <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>{city.countries.name}</Typography>}
          <Box sx={{ display: 'flex', gap: 1 }}>
            {city.is_capital && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', bgcolor: 'rgba(var(--primary-rgb, 59, 130, 246), 0.1)' }}>
                <Crown style={{ height: 12, width: 12, color: 'var(--primary)' }} />
              </Box>
            )}
            {city.is_major_city && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', bgcolor: 'rgba(var(--secondary-rgb, 107, 114, 128), 0.1)' }}>
                <Building2 style={{ height: 12, width: 12, color: 'var(--secondary-foreground)' }} />
              </Box>
            )}
          </Box>
        </Box>
      );
    }

    return null;
  };

  const getStats = () => {
    if (data?.population) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
          <Users style={{ height: 16, width: 16 }} />
          <span>{formatPopulation(data.population)}</span>
        </Box>
      );
    }
    return null;
  };

  const cardContent = (
    <Card style={{ cursor: 'pointer', transition: 'all 0.2s', ...(onClick ? {} : {}) }}>
      {/* Country Image */}
      {type === "country" && (
        <Box sx={{ aspectRatio: '4/3', width: '100%', overflow: 'hidden', borderTopLeftRadius: 8, borderTopRightRadius: 8, bgcolor: 'action.hover' }}>
          {imageLoading ? (
            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Box sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', bgcolor: 'rgba(var(--muted-foreground-rgb, 107, 114, 128), 0.2)', width: '100%', height: '100%' }} />
            </Box>
          ) : (
            <img
              src={countryImage || `https://images.unsplash.com/photo-1466442929976-97f336a657be?w=400&h=200&fit=crop`}
              alt={`${name} landscape`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                // Fallback to default image if Pexels image fails to load
                e.currentTarget.src = `https://images.unsplash.com/photo-1466442929976-97f336a657be?w=400&h=200&fit=crop`;
              }}
            />
          )}
        </Box>
      )}

      {/* City Image */}
      {type === "city" && (
        <Box sx={{ aspectRatio: '4/3', width: '100%', overflow: 'hidden', borderTopLeftRadius: 8, borderTopRightRadius: 8, bgcolor: 'action.hover' }}>
          {cityImageLoading ? (
            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 style={{ height: 24, width: 24, animation: 'spin 1s linear infinite', color: 'var(--muted-foreground)' }} />
            </Box>
          ) : cityImageUrl && !cityImageError ? (
            <img
              src={cityImageUrl}
              alt={`${name} cityscape`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setCityImageError(true)}
            />
          ) : (
            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ImageIcon style={{ height: 32, width: 32, color: 'var(--muted-foreground)' }} />
            </Box>
          )}
        </Box>
      )}

      <CardHeader style={type === "country" || type === "city" ? { paddingBottom: 8, paddingTop: 12, paddingLeft: 12, paddingRight: 12 } : { paddingBottom: 12 }}>
        <CardTitle style={type === "country" || type === "city" ? { fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } : { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {type !== "country" && type !== "city" && getIcon()}
            <span style={type === "country" || type === "city" ? { fontSize: '0.875rem', fontWeight: 500 } : { fontSize: '1.125rem' }}>{name}</span>
          </Box>
          {type !== "country" && type !== "city" && getStats()}
        </CardTitle>
      </CardHeader>

      {getSubtitle() && (
        <CardContent style={{ paddingTop: 0 }}>
          {getSubtitle()}
        </CardContent>
      )}
    </Card>
  );

  // Wrap with Link for cities and countries, otherwise use onClick
  if (type === "city" && data?.id) {
    return (
      <Link to={`/city/${data.id}`} style={{ display: 'block' }}>
        {cardContent}
      </Link>
    );
  }

  if (type === "country" && data?.id) {
    return (
      <Link to={`/country/${data.id}`} style={{ display: 'block' }}>
        {cardContent}
      </Link>
    );
  }

  // For continents or items without detail pages, use onClick
  return <div onClick={onClick}>{cardContent}</div>;
};
