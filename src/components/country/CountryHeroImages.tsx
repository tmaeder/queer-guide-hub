import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Box from '@mui/material/Box';

interface CountryImage {
  id: string;
  url: string;
  thumbnail: string;
  alt: string;
  photographer: string;
  photographer_url: string;
}

interface CountryHeroImagesProps {
  countryName: string;
  className?: string;
}

export default function CountryHeroImages({ countryName, className = "" }: CountryHeroImagesProps) {
  const [images, setImages] = useState<CountryImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCountryImages();
  }, [countryName]);

  const fetchCountryImages = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.functions.invoke('get-pexels-images', {
        body: {
          query: `${countryName} famous landmarks architecture cityscape national symbols capital`,
          type: 'country',
          page: 1
        }
      });

      if (error) {
        console.error('Error fetching country images:', error);
        return;
      }

      if (data?.success && data.images) {
        setImages(data.images.slice(0, 3)); // Get first 3 images
      }
    } catch (error) {
      console.error('Error fetching country images:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || images.length === 0) {
    return null;
  }

  return (
    <Box sx={{ position: 'relative', height: 192, borderRadius: 2, overflow: 'hidden', mb: 3 }} className={className}>
      {/* Main image as background */}
      <Box
        sx={{ position: 'absolute', inset: 0, backgroundSize: 'cover', backgroundPosition: 'center' }}
        style={{ backgroundImage: `url(${images[0]?.url})` }}
      >
        <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.4)' }} />
      </Box>

      {/* Small thumbnail images overlay */}
      {images.length > 1 && (
        <Box sx={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: 1 }}>
          {images.slice(1).map((image) => (
            <Box
              key={image.id}
              sx={{ width: 48, height: 48, borderRadius: 1, border: '2px solid rgba(255,255,255,0.7)', overflow: 'hidden', backgroundSize: 'cover', backgroundPosition: 'center' }}
              style={{ backgroundImage: `url(${image.thumbnail})` }}
            />
          ))}
        </Box>
      )}

      {/* Photographer credit */}
      <Box sx={{ position: 'absolute', bottom: 8, left: 8, fontSize: '0.75rem', color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
        Photo by{' '}
        <Box
          component="a"
          href={images[0]?.photographer_url}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ textDecoration: 'underline', color: 'white', '&:hover': { opacity: 0.8 } }}
        >
          {images[0]?.photographer}
        </Box>
      </Box>
    </Box>
  );
}
