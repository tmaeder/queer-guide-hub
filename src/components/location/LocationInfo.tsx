import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Globe, Image as ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (name) {
      fetchLocationInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchLocationInfo defined below, re-run on name/type change
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
    
    const newIndex = direction === 'prev' 
      ? (selectedImageIndex - 1 + images.length) % images.length
      : (selectedImageIndex + 1) % images.length;
    
    setSelectedImageIndex(newIndex);
  };

  const selectedImage = selectedImageIndex !== null ? images[selectedImageIndex] : null;

  if (loading) {
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Card>
          <CardHeader>
            <Skeleton />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </Box>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <Skeleton />
          </CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
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
              <Globe style={{ height: 20, width: 20 }} />
              About {name}
              <Badge variant="secondary">{type}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {wikipediaInfo.description && (
              <p style={{ fontSize: '1.125rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>
                {wikipediaInfo.description}
              </p>
            )}
            
            <div className="prose" style={{ fontSize: '0.875rem', maxWidth: 'none' }}>
              <p>{wikipediaInfo.content}</p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem' }}>
              <a
                href={wikipediaInfo.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--primary)' }}
              >
                <ExternalLink style={{ height: 16, width: 16 }} />
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
            <CardTitle>
              <ImageIcon style={{ height: 20, width: 20 }} />
              Photo Gallery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              {images.map((image, index) => (
                <div
                  key={image.id}
                  role="button"
                  tabIndex={0}
                  /* group removed */
                  style={{ position: 'relative', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.3s' }}
                  onClick={() => openModal(index)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(index); } }}
                >
                  <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}>
                    <img
                      src={image.thumbnail}
                      alt={image.alt || `Photo of ${name}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'all 0.5s' }}
                      loading="lazy"
                    />
                    <div
                      style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent, transparent)', opacity: 0, transition: 'opacity 0.3s' }}
                    />
                  </div>
                  
                  <div
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0.75rem', color: 'white', transform: 'translateY(100%)', transition: 'transform 0.3s' }}
                  >
                    <p style={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Photo by {image.photographer}
                    </p>
                  </div>
                  
                  {/* Hover overlay */}
                  <div
                    style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(var(--primary-rgb), 0.1)', opacity: 0, transition: 'opacity 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <div
                      style={{ backgroundColor: 'rgba(var(--background-rgb), 0.9)', backdropFilter: 'blur(4px)', borderRadius: '9999px', padding: '0.5rem', transform: 'scale(0)', transition: 'transform 0.3s' }}
                    >
                      <ImageIcon style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--muted)' }}>
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
                  <div style={{ position: 'relative' }}>
                    {/* Close button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10, color: 'white' }}
                      onClick={closeModal}
                    >
                      <X style={{ height: 24, width: 24 }} />
                    </Button>
                    
                    {/* Navigation buttons */}
                    {images.length > 1 && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', zIndex: 10, color: 'white' }}
                          onClick={() => navigateImage('prev')}
                        >
                          <ChevronLeft style={{ height: 32, width: 32 }} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', zIndex: 10, color: 'white' }}
                          onClick={() => navigateImage('next')}
                        >
                          <ChevronRight style={{ height: 32, width: 32 }} />
                        </Button>
                      </>
                    )}
                    
                    {/* Main image */}
                    <div style={{ position: 'relative' }}>
                      <img
                        src={selectedImage.url}
                        alt={selectedImage.alt || `Photo of ${name}`}
                        style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                      />

                      {/* Image info overlay */}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', padding: '1.5rem' }}>
                        <div className="text-white flex flex-col gap-2">
                          <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                            {selectedImageIndex !== null && `${selectedImageIndex + 1} of ${images.length}`}
                          </p>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Photo by {selectedImage.photographer}</p>
                              <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>{selectedImage.alt || `Photo of ${name}`}</p>
                            </div>
                            <a
                              href={selectedImage.photographer_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', backgroundColor: 'rgba(255,255,255,0.2)', padding: '0.375rem 0.75rem', borderRadius: '9999px', color: 'inherit', textDecoration: 'none', transition: 'background-color 0.2s' }}
                            >
                              <ExternalLink style={{ height: 16, width: 16 }} />
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