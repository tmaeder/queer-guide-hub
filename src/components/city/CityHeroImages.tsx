import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
    <Box sx={{ position: 'relative', height: 320, borderRadius: 4, overflow: 'hidden' }} className={className}>
      {/* Main image as background with enhanced styling */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transition: 'transform 0.7s',
          '&:hover': { transform: 'scale(1.05)' }
        }}
        style={{ backgroundImage: `url(${images[0]?.url})` }}
      >
        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent, rgba(0,0,0,0.2))' }} />
      </Box>

      {/* Enhanced thumbnail images overlay */}
      {images.length > 1 && (
        <Box sx={{ position: 'absolute', bottom: 24, right: 24, display: 'flex', gap: 1.5 }}>
          {images.slice(1).map((image, index) => (
            <Box
              key={image.id}
              sx={{
                width: 64,
                height: 64,
                borderRadius: 3,
                border: '2px solid rgba(255,255,255,0.7)',
                overflow: 'hidden',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                boxShadow: 3,
                cursor: 'pointer',
                transition: 'all 0.3s',
                '&:hover': { transform: 'scale(1.1)' }
              }}
              style={{ backgroundImage: `url(${image.thumbnail})` }}
            />
          ))}
        </Box>
      )}

      {/* Enhanced photographer credit */}
      <Box sx={{ position: 'absolute', bottom: 12, left: 16, px: 1.5, py: 0.5, borderRadius: '9999px', bgcolor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
          Photo by{' '}
          <Box
            component="a"
            href={images[0]?.photographer_url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: 'white', '&:hover': { color: 'rgba(255,255,255,0.7)' }, transition: 'color 0.2s' }}
          >
            {images[0]?.photographer}
          </Box>
        </Typography>
      </Box>

      {/* Decorative overlay elements */}
      <Box sx={{ position: 'absolute', top: 16, left: 16, width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)' , animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
      <Box sx={{ position: 'absolute', top: 32, right: 32, width: 48, height: 48, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(4px)', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', animationDelay: '1s' }} />
    </Box>
  );
}
