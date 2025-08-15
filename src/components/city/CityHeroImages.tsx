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
          query: `${cityName} ${countryName || ''} city skyline architecture landmarks downtown`,
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
    <div className={`relative h-80 rounded-2xl overflow-hidden ${className}`}>
      {/* Main image as background with enhanced styling */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
        style={{ backgroundImage: `url(${images[0]?.url})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
      </div>
      
      {/* Enhanced thumbnail images overlay */}
      {images.length > 1 && (
        <div className="absolute bottom-6 right-6 flex gap-3">
          {images.slice(1).map((image, index) => (
            <div
              key={image.id}
              className="w-16 h-16 rounded-xl border-2 border-white/70 overflow-hidden bg-cover bg-center shadow-lg hover:scale-110 transition-all duration-300 cursor-pointer"
              style={{ backgroundImage: `url(${image.thumbnail})` }}
            />
          ))}
        </div>
      )}
      
      {/* Enhanced photographer credit */}
      <div className="absolute bottom-3 left-4 px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm">
        <span className="text-xs text-white/90 font-medium">
          Photo by{' '}
          <a 
            href={images[0]?.photographer_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-white/70 transition-colors story-link"
          >
            {images[0]?.photographer}
          </a>
        </span>
      </div>

      {/* Decorative overlay elements */}
      <div className="absolute top-4 left-4 w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm animate-pulse" />
      <div className="absolute top-8 right-8 w-12 h-12 rounded-full bg-white/5 backdrop-blur-sm animate-pulse" style={{ animationDelay: '1s' }} />
    </div>
  );
}