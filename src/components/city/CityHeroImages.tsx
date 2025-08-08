import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CityImage {
  id: string;
  url: string;
  thumbnail: string;
  alt: string;
  photographer: string;
  photographer_url: string;
}

interface CityHeroImagesProps {
  cityName: string;
  countryName?: string;
  className?: string;
}

export default function CityHeroImages({ cityName, countryName, className = "" }: CityHeroImagesProps) {
  const [images, setImages] = useState<CityImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCityImages();
  }, [cityName, countryName]);

  const fetchCityImages = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('get-pexels-images', {
        body: {
          query: `${cityName} ${countryName || ''} city skyline architecture landmarks`,
          type: 'city',
          page: 1
        }
      });

      if (error) {
        console.error('Error fetching city images:', error);
        return;
      }

      if (data?.success && data.images) {
        setImages(data.images.slice(0, 3)); // Get first 3 images
      }
    } catch (error) {
      console.error('Error fetching city images:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || images.length === 0) {
    return null;
  }

  return (
    <div className={`relative h-48 rounded-lg overflow-hidden mb-6 ${className}`}>
      {/* Main image as background */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${images[0]?.url})` }}
      >
        <div className="absolute inset-0 bg-foreground/40" />
      </div>
      
      {/* Small thumbnail images overlay */}
      {images.length > 1 && (
        <div className="absolute bottom-4 right-4 flex gap-2">
          {images.slice(1).map((image) => (
            <div
              key={image.id}
              className="w-12 h-12 rounded border-2 border-foreground/70 overflow-hidden bg-cover bg-center"
              style={{ backgroundImage: `url(${image.thumbnail})` }}
            />
          ))}
        </div>
      )}
      
      {/* Photographer credit */}
      <div className="absolute bottom-2 left-2 text-xs text-primary-foreground drop-shadow-lg">
        Photo by{' '}
        <a 
          href={images[0]?.photographer_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-primary-foreground/80"
        >
          {images[0]?.photographer}
        </a>
      </div>
    </div>
  );
}