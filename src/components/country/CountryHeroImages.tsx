import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Box from '@mui/material/Box';
import { resolveEntityImage, isValidImageUrl } from '@/lib/images/resolveEntityImage';

interface CountryRecord {
  id: string;
  name: string;
  capital?: string | null;
  image_url?: string | null;
  curated_image_url?: string | null;
  image_flagged?: boolean | null;
  image_metadata?: {
    photographer?: string;
    photographer_url?: string;
  } | null;
}

interface CountryHeroImagesProps {
  country: CountryRecord;
  className?: string;
}

/**
 * Country hero image.
 *
 * Resolution order:
 *   1. curated_image_url
 *   2. persisted image_url (not flagged)
 *   3. fetch-country-images (scored + persisted)
 *   4. null -> render nothing
 */
export default function CountryHeroImages({ country, className = '' }: CountryHeroImagesProps) {
  const resolved = resolveEntityImage('country', country);
  const [url, setUrl] = useState<string | null>(resolved.url);
  const [metadata, setMetadata] = useState(country.image_metadata ?? null);

  useEffect(() => {
    if (resolved.url) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('fetch-country-images', {
          body: {
            countryId: country.id,
            countryName: country.name,
            capital: country.capital ?? undefined,
          },
        });
        if (cancelled) return;
        if (error || !data?.success) return;
        if (isValidImageUrl(data.image_url)) {
          setUrl(data.image_url);
          setMetadata(data.image_metadata ?? null);
        }
      } catch {
        /* silent — placeholder stays */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [country.id, country.name, country.capital, resolved.url]);

  if (!url) return null;

  return (
    <Box
      sx={{ position: 'relative', height: 192, borderRadius: 2, overflow: 'hidden', mb: 3 }}
      className={className}
    >
      <Box
        sx={{ position: 'absolute', inset: 0, backgroundSize: 'cover', backgroundPosition: 'center' }}
        style={{ backgroundImage: `url(${url})` }}
      >
        <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.4)' }} />
      </Box>
      {metadata?.photographer && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            fontSize: '0.75rem',
            color: 'white',
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}
        >
          Photo by{' '}
          {metadata.photographer_url ? (
            <Box
              component="a"
              href={metadata.photographer_url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textDecoration: 'underline', color: 'white', '&:hover': { opacity: 0.8 } }}
            >
              {metadata.photographer}
            </Box>
          ) : (
            metadata.photographer
          )}
        </Box>
      )}
    </Box>
  );
}
