import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Globe, Building2, Loader2, ImageIcon, Crown } from "lucide-react";
import { Country, City } from "@/hooks/useDirectory";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCityImages } from "@/hooks/useCityImages";

interface DirectoryCardProps {
  type: "continent" | "country" | "city";
  name: string;
  data?: Country | City | any;
  onClick?: () => void;
}
export const DirectoryCard = ({
  type,
  name,
  data,
  onClick
}: DirectoryCardProps) => {
  const [countryImage, setCountryImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageKey, setImageKey] = useState(0); // Force refresh mechanism
  
  // City images hook
  const { fetchCityImage, loading: cityImageLoading } = useCityImages();
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
          const result = await fetchCityImage(
            data.id, 
            name, 
            data.countries?.name || data.country_name
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
        return <Globe className="h-5 w-5 text-primary" />;
      case "country":
        return <MapPin className="h-5 w-5 text-primary" />;
      case "city":
        return <Building2 className="h-5 w-5 text-primary" />;
      default:
        return null;
    }
  };
  const getSubtitle = () => {
    if (type === "country" && data) {
      const country = data as Country;
      return <div className="space-y-1">
          {country.capital && <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Crown className="h-4 w-4" />
            <span>{country.capital}</span>
          </div>}
          {country.regions && <Badge variant="secondary" className="text-xs">
              {country.regions.name}
            </Badge>}
        </div>;
    }
    if (type === "city" && data) {
      const city = data as City;
      return <div className="space-y-1">
          {city.countries && <p className="text-sm text-muted-foreground">{city.countries.name}</p>}
          <div className="flex gap-2">
            {city.is_capital && <Badge variant="default" className="text-xs">
                Capital
              </Badge>}
            {city.is_major_city && <Badge variant="secondary" className="text-xs">
                Major City
              </Badge>}
          </div>
        </div>;
    }
    return null;
  };
  const getStats = () => {
    if (data?.population) {
      return <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{formatPopulation(data.population)}</span>
        </div>;
    }
    return null;
  };
  return <Card className={`cursor-pointer transition-all hover:shadow-md hover:scale-105 ${onClick ? "hover:bg-accent/50" : ""}`} onClick={onClick}>
      {/* Country Image */}
      {type === "country" && <div className="aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-muted">
          {imageLoading ? <div className="w-full h-full flex items-center justify-center">
              <div className="animate-pulse bg-muted-foreground/20 w-full h-full"></div>
            </div> : <img src={countryImage || `https://images.unsplash.com/photo-1466442929976-97f336a657be?w=400&h=200&fit=crop`} alt={`${name} landscape`} className="w-full h-full object-cover" onError={e => {
        // Fallback to default image if Pexels image fails to load
        e.currentTarget.src = `https://images.unsplash.com/photo-1466442929976-97f336a657be?w=400&h=200&fit=crop`;
      }} />}
        </div>}
      
      {/* City Image */}
      {type === "city" && (
        <div className="aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-muted">
          {cityImageLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cityImageUrl && !cityImageError ? (
            <img
              src={cityImageUrl}
              alt={`${name} cityscape`}
              className="w-full h-full object-cover"
              onError={() => setCityImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>
      )}
      <CardHeader className={(type === "country" || type === "city") ? "pb-2 pt-3 px-3" : "pb-3"}>
        <CardTitle className={`flex items-center justify-between ${(type === "country" || type === "city") ? "text-sm" : ""}`}>
          <div className="flex items-center gap-2">
            {(type !== "country" && type !== "city") && getIcon()}
            <span className={(type === "country" || type === "city") ? "text-sm font-medium" : "text-lg"}>{name}</span>
          </div>
          {(type !== "country" && type !== "city") && getStats()}
        </CardTitle>
      </CardHeader>
      {getSubtitle() && <CardContent className="pt-0">
          {getSubtitle()}
        </CardContent>}
    </Card>;
};