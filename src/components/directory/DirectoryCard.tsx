import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Globe, Building2 } from "lucide-react";
import { Country, City } from "@/hooks/useDirectory";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DirectoryCardProps {
  type: "continent" | "country" | "city";
  name: string;
  data?: Country | City | any;
  onClick?: () => void;
}

export const DirectoryCard = ({ type, name, data, onClick }: DirectoryCardProps) => {
  const [countryImage, setCountryImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageKey, setImageKey] = useState(0); // Force refresh mechanism

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
          
          const { data: imageData, error } = await supabase.functions.invoke('get-pexels-images', {
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
              a = ((a << 5) - a) + b.charCodeAt(0);
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

  const getCountryFallbackImage = (countryName: string) => {
    // Country-specific fallback images using Unsplash with country-specific photo IDs
    const countryImages: { [key: string]: string } = {
      'France': 'https://images.unsplash.com/photo-1502602898536-47ad22581b52?w=400&h=300&fit=crop', // Eiffel Tower
      'Italy': 'https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b?w=400&h=300&fit=crop', // Colosseum
      'Spain': 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=400&h=300&fit=crop', // Sagrada Familia
      'Germany': 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=400&h=300&fit=crop', // Brandenburg Gate
      'United Kingdom': 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=400&h=300&fit=crop', // Big Ben
      'UK': 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=400&h=300&fit=crop', // Big Ben
      'Japan': 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&h=300&fit=crop', // Mount Fuji
      'United States': 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=400&h=300&fit=crop', // Statue of Liberty
      'USA': 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=400&h=300&fit=crop', // Statue of Liberty
      'China': 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=400&h=300&fit=crop', // Great Wall
      'India': 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=400&h=300&fit=crop', // Taj Mahal
      'Brazil': 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=400&h=300&fit=crop', // Christ the Redeemer
      'Australia': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop', // Sydney Opera House
      'Canada': 'https://images.unsplash.com/photo-1517935706615-2717063c2225?w=400&h=300&fit=crop', // Canadian landscape
      'Russia': 'https://images.unsplash.com/photo-1520637836862-4d197d17c88a?w=400&h=300&fit=crop', // Red Square
      'Greece': 'https://images.unsplash.com/photo-1555993539-1732b0258092?w=400&h=300&fit=crop', // Parthenon
      'Egypt': 'https://images.unsplash.com/photo-1539650116574-75c0c6d0c620?w=400&h=300&fit=crop', // Pyramids
      'Thailand': 'https://images.unsplash.com/photo-1528181304800-259b08848526?w=400&h=300&fit=crop', // Thai temple
      'Turkey': 'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=400&h=300&fit=crop', // Hagia Sophia
      'Mexico': 'https://images.unsplash.com/photo-1518105779142-d975f22f1b0f?w=400&h=300&fit=crop', // Mexican pyramid
      'Netherlands': 'https://images.unsplash.com/photo-1534313314376-aeb2a73810d4?w=400&h=300&fit=crop', // Amsterdam canals
      'Switzerland': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop', // Swiss Alps
      'South Korea': 'https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=400&h=300&fit=crop', // Korean palace
      'Norway': 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&h=300&fit=crop', // Norwegian fjords
      'Sweden': 'https://images.unsplash.com/photo-1509356843151-3e7d96241e11?w=400&h=300&fit=crop', // Stockholm
      'Denmark': 'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=400&h=300&fit=crop', // Copenhagen
      'Portugal': 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=400&h=300&fit=crop', // Lisbon
      'Argentina': 'https://images.unsplash.com/photo-1589909202802-8f4aadce1849?w=400&h=300&fit=crop', // Buenos Aires
      'Chile': 'https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?w=400&h=300&fit=crop', // Chilean landscape
      'Peru': 'https://images.unsplash.com/photo-1526392060635-9d6019884377?w=400&h=300&fit=crop', // Machu Picchu
      'South Africa': 'https://images.unsplash.com/photo-1484318571209-661cf29a69ea?w=400&h=300&fit=crop', // Table Mountain
      'New Zealand': 'https://images.unsplash.com/photo-1469521669194-babb45599def?w=400&h=300&fit=crop', // New Zealand landscape
      'Iceland': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop', // Iceland landscape
      'Ireland': 'https://images.unsplash.com/photo-1590736969955-71cc94901144?w=400&h=300&fit=crop', // Irish cliffs
      'Morocco': 'https://images.unsplash.com/photo-1489749798305-4fea3ae436d3?w=400&h=300&fit=crop', // Moroccan architecture
    };

    // Return country-specific image or generic landscape fallback
    return countryImages[countryName] || 'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=400&h=300&fit=crop';
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
      return (
        <div className="space-y-1">
          {country.capital && (
            <p className="text-sm text-muted-foreground">Capital: {country.capital}</p>
          )}
          {country.regions && (
            <Badge variant="secondary" className="text-xs">
              {country.regions.name}
            </Badge>
          )}
        </div>
      );
    }
    
    if (type === "city" && data) {
      const city = data as City;
      return (
        <div className="space-y-1">
          {city.countries && (
            <p className="text-sm text-muted-foreground">{city.countries.name}</p>
          )}
          <div className="flex gap-2">
            {city.is_capital && (
              <Badge variant="default" className="text-xs">
                Capital
              </Badge>
            )}
            {city.is_major_city && (
              <Badge variant="secondary" className="text-xs">
                Major City
              </Badge>
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
          <Users className="h-4 w-4" />
          <span>{formatPopulation(data.population)}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md hover:scale-105 ${
        onClick ? "hover:bg-accent/50" : ""
      }`}
      onClick={onClick}
    >
      {type === "country" && (
        <div className="aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-muted">
          {imageLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="animate-pulse bg-muted-foreground/20 w-full h-full"></div>
            </div>
          ) : (
            <img 
              src={countryImage || getCountryFallbackImage(name)}
              alt={`${name} landscape`}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to default image if Pexels image fails to load
                e.currentTarget.src = getCountryFallbackImage(name);
              }}
            />
          )}
        </div>
      )}
      <CardHeader className={type === "country" ? "pb-2 pt-3 px-3" : "pb-3"}>
        <CardTitle className={`flex items-center justify-between ${type === "country" ? "text-sm" : ""}`}>
          <div className="flex items-center gap-2">
            {type !== "country" && getIcon()}
            <span className={type === "country" ? "text-sm font-medium" : "text-lg"}>{name}</span>
          </div>
          {type !== "country" && getStats()}
        </CardTitle>
      </CardHeader>
      {getSubtitle() && (
        <CardContent className="pt-0">
          {getSubtitle()}
        </CardContent>
      )}
    </Card>
  );
};