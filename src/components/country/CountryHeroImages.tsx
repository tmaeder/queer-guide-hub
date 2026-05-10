import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
 *   3. fetch-images entity_type=country (scored + persisted)
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
        const { data, error } = await supabase.functions.invoke('fetch-images', {
          body: {
            entity_type: 'country',
            id: country.id,
            name: country.name,
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
    <div
      className={`relative overflow-hidden mb-6 ${className}`}
      style={{ height: 192 }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} />
      </div>
      {metadata?.photographer && (
        <div
          className="absolute text-xs"
          style={{
            bottom: 8,
            left: 8,
            color: 'white',
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}
        >
          Photo by{' '}
          {metadata.photographer_url ? (
            <a
              href={metadata.photographer_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
              style={{ color: 'white' }}
            >
              {metadata.photographer}
            </a>
          ) : (
            metadata.photographer
          )}
        </div>
      )}
    </div>
  );
}
