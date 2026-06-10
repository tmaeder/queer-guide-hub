import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ExternalLink,
  Globe,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
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

async function fetchWikipediaSummary(query: string): Promise<WikipediaInfo | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json() as {
      title?: string;
      extract?: string;
      description?: string;
      content_urls?: { desktop?: { page?: string } };
      thumbnail?: { source?: string };
      coordinates?: { lat: number; lon: number };
    };
    if (!data.extract) return null;
    return {
      title:       data.title ?? query,
      extract:     data.extract,
      description: data.description,
      content:     data.extract,
      pageUrl:     data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
      thumbnail:   data.thumbnail?.source,
      coordinates: data.coordinates,
    };
  } catch (err) {
    console.error('Wikipedia fetch failed:', err);
    return null;
  }
}

export const LocationInfo = ({ name, type, className }: LocationInfoProps) => {
  const [wikipediaInfo, setWikipediaInfo] = useState<WikipediaInfo | null>(null);
  const [images, setImages] = useState<PexelsImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (name) {
      // eslint-disable-next-line react-hooks/immutability -- fetchLocationInfo declared below; effect fires after render so binding is initialized.
      fetchLocationInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchLocationInfo defined below, re-run on name/type change
  }, [name, type]);

  const fetchLocationInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      // Wikipedia: direct REST API (CORS-friendly, no auth). The
      // get-wikipedia-info edge function was admin-only enrichment, never a
      // runtime fetcher. fetchWikipediaSummary returns null on miss/error
      // (any failure should degrade gracefully, not break the page).
      const [wikipediaInfoResult, imagesResponse] = await Promise.all([
        fetchWikipediaSummary(name),
        supabase.functions.invoke('get-pexels-images', {
          body: { query: name, type },
        }),
      ]);

      if (wikipediaInfoResult) setWikipediaInfo(wikipediaInfoResult);

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

  const openModal = (index: number) => {
    setSelectedImageIndex(index);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedImageIndex(null);
  };

  const navigateImage = (direction: 'prev' | 'next') => {
    if (selectedImageIndex === null) return;

    const newIndex =
      direction === 'prev'
        ? (selectedImageIndex - 1 + images.length) % images.length
        : (selectedImageIndex + 1) % images.length;

    setSelectedImageIndex(newIndex);
  };

  const selectedImage = selectedImageIndex !== null ? images[selectedImageIndex] : null;

  if (loading) {
    return (
      <div
        className={className}
        style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      >
        <Card>
          <CardHeader>
            <Skeleton />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton />
          </CardHeader>
          <CardContent>
            <div style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }} className="grid">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Wikipedia Information */}
      {wikipediaInfo && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Globe size={20} />
              Background
            </CardTitle>
          </CardHeader>
          <CardContent>
            {wikipediaInfo.description && (
              <p className="text-lg font-medium text-muted-foreground">
                {wikipediaInfo.description}
              </p>
            )}

            <div className="prose text-sm" style={{ maxWidth: 'none' }}>
              <p>{wikipediaInfo.content}</p>
            </div>

            <div
              style={{ alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem' }}
              className="flex"
            >
              <a
                href={wikipediaInfo.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ alignItems: 'center', gap: '0.5rem' }}
                className="inline-flex text-sm text-primary"
              >
                <ExternalLink size={16} />
                Read more on Wikipedia
              </a>

              {wikipediaInfo.coordinates && (
                <span className="text-xs text-muted-foreground">
                  {wikipediaInfo.coordinates.lat.toFixed(4)}°,{' '}
                  {wikipediaInfo.coordinates.lon.toFixed(4)}°
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
            <CardTitle>
              <ImageIcon size={20} />
              Photo Gallery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}
              className="grid"
            >
              {images.map((image, index) => (
                <div
                  key={image.id}
                  role="button"
                  tabIndex={0}
                  /* group removed */ style={{ transition: 'all 0.3s' }}
                  className="relative cursor-pointer overflow-hidden"
                  onClick={() => openModal(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openModal(index);
                    }
                  }}
                >
                  <div style={{ aspectRatio: '16/9' }} className="relative overflow-hidden">
                    <img
                      src={image.thumbnail}
                      alt={image.alt || `Photo of ${name}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transition: 'all 0.5s',
                      }}
                      loading="lazy"
                    />
                    <div
                      style={{
                        inset: 0,
                        background:
                          'linear-gradient(to top, rgba(0,0,0,0.6), transparent, transparent)',
                        opacity: 0,
                        transition: 'opacity 0.3s',
                      }}
                      className="absolute"
                    />
                  </div>

                  <div
                    style={{
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: '0.75rem',
                      color: 'white',
                      transform: 'translateY(100%)',
                      transition: 'transform 0.3s',
                    }}
                    className="absolute"
                  >
                    <p
                      style={{ textOverflow: 'ellipsis' }}
                      className="text-xs font-medium overflow-hidden whitespace-nowrap"
                    >
                      Photo by {image.photographer}
                    </p>
                  </div>

                  {/* Hover overlay */}
                  <div
                    style={{
                      inset: 0,
                      backgroundColor: 'rgba(var(--primary-rgb), 0.1)',
                      opacity: 0,
                      transition: 'opacity 0.3s',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    className="absolute flex"
                  >
                    <div
                      className="rounded-full"
                      style={{
                        backgroundColor: 'rgba(var(--background-rgb), 0.9)',
                        backdropFilter: 'blur(4px)',
                        padding: '0.5rem',
                        transform: 'scale(0)',
                        transition: 'transform 0.3s',
                      }}
                    >
                      <ImageIcon size={20} className="text-primary" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: '1.5rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--muted)',
              }}
            >
              <p className="text-xs text-muted-foreground text-center">
                Photos provided by{' '}
                <a
                  href="https://www.pexels.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline transition-colors"
                >
                  Pexels
                </a>
              </p>
            </div>

            {/* Enhanced Photo Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
              <DialogContent>
                {selectedImage && (
                  <div className="relative">
                    {/* Close button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      style={{ top: '1rem', right: '1rem', zIndex: 10, color: 'white' }}
                      className="absolute"
                      onClick={closeModal}
                    >
                      <X size={24} />
                    </Button>

                    {/* Navigation buttons */}
                    {images.length > 1 && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          style={{
                            left: '1rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            zIndex: 10,
                            color: 'white',
                          }}
                          className="absolute"
                          onClick={() => navigateImage('prev')}
                        >
                          <ChevronLeft size={32} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          style={{
                            right: '1rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            zIndex: 10,
                            color: 'white',
                          }}
                          className="absolute"
                          onClick={() => navigateImage('next')}
                        >
                          <ChevronRight size={32} />
                        </Button>
                      </>
                    )}

                    {/* Main image */}
                    <div className="relative">
                      <img
                        src={selectedImage.url}
                        alt={selectedImage.alt || `Photo of ${name}`}
                        style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                      />

                      {/* Image info overlay */}
                      <div
                        style={{
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                          padding: '1.5rem',
                        }}
                        className="absolute"
                      >
                        <div className="text-white flex flex-col gap-2">
                          <p style={{ opacity: 0.8 }} className="text-sm">
                            {selectedImageIndex !== null &&
                              `${selectedImageIndex + 1} of ${images.length}`}
                          </p>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Photo by {selectedImage.photographer}</p>
                              <p style={{ opacity: 0.8 }} className="text-sm">
                                {selectedImage.alt || `Photo of ${name}`}
                              </p>
                            </div>
                            <a
                              href={selectedImage.photographer_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-element inline-flex text-sm no-underline"
                              style={{
                                alignItems: 'center',
                                gap: '0.5rem',
                                backgroundColor: 'rgba(255,255,255,0.2)',
                                padding: '0.375rem 0.75rem',
                                color: 'inherit',
                                transition: 'background-color 0.2s',
                              }}
                            >
                              <ExternalLink size={16} />
                              View Profile
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent>
            <p className="text-center text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
