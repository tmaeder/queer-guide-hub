import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Globe, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface WikipediaInfo {
  title: string;
  extract: string;
  description?: string;
  content: string;
  pageUrl: string;
  thumbnail?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
}

interface PexelsImage {
  id: number;
  url: string;
  thumbnail: string;
  alt: string;
  photographer: string;
  photographer_url: string;
}

interface LocationInfoProps {
  name: string;
  type: 'country' | 'city';
  className?: string;
}

export const LocationInfo = ({ name, type, className }: LocationInfoProps) => {
  const [wikipediaInfo, setWikipediaInfo] = useState<WikipediaInfo | null>(null);
  const [images, setImages] = useState<PexelsImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (name) {
      fetchLocationInfo();
    }
  }, [name, type]);

  const fetchLocationInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch Wikipedia info and Pexels images in parallel
      const [wikipediaResponse, imagesResponse] = await Promise.all([
        supabase.functions.invoke('get-wikipedia-info', {
          body: { query: name, type }
        }),
        supabase.functions.invoke('get-pexels-images', {
          body: { query: name, type }
        })
      ]);

      if (wikipediaResponse.error) {
        console.error('Wikipedia error:', wikipediaResponse.error);
      } else if (wikipediaResponse.data?.success) {
        setWikipediaInfo(wikipediaResponse.data);
      }

      if (imagesResponse.error) {
        console.error('Pexels error:', imagesResponse.error);
      } else if (imagesResponse.data?.success) {
        setImages(imagesResponse.data.images || []);
      }
    } catch (err) {
      console.error('Location info error:', err);
      setError('Failed to load location information');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="aspect-video rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Wikipedia Information */}
      {wikipediaInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              About {name}
              <Badge variant="secondary">{type}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {wikipediaInfo.description && (
              <p className="text-lg font-medium text-muted-foreground">
                {wikipediaInfo.description}
              </p>
            )}
            
            <div className="prose prose-sm max-w-none">
              <p>{wikipediaInfo.content}</p>
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t">
              <a
                href={wikipediaInfo.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Read more on Wikipedia
              </a>
              
              {wikipediaInfo.coordinates && (
                <span className="text-xs text-muted-foreground">
                  {wikipediaInfo.coordinates.lat.toFixed(4)}°, {wikipediaInfo.coordinates.lon.toFixed(4)}°
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photo Gallery */}
      {images.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Photo Gallery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {images.map((image) => (
                <div key={image.id} className="group relative">
                  <img
                    src={image.thumbnail}
                    alt={image.alt || `Photo of ${name}`}
                    className="w-full aspect-video object-cover rounded-lg transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-end p-3">
                    <div className="text-white text-xs">
                      <p className="font-medium">Photo by</p>
                      <a
                        href={image.photographer_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {image.photographer}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground text-center">
                Photos provided by{' '}
                <a
                  href="https://www.pexels.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Pexels
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};