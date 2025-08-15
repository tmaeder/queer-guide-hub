import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
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
                <Skeleton key={i} className="aspect-video" />
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
            
            <div className="flex items-center justify-between pt-4">
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
              {images.map((image, index) => (
                <div 
                  key={image.id} 
                  className="group relative cursor-pointer overflow-hidden rounded-lg border border-muted/50 hover:border-primary/50 transition-all duration-300"
                  onClick={() => openModal(index)}
                >
                  <div className="relative aspect-video overflow-hidden">
                    <img
                      src={image.thumbnail}
                      alt={image.alt || `Photo of ${name}`}
                      className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white transform translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                    <p className="text-xs font-medium truncate">
                      Photo by {image.photographer}
                    </p>
                  </div>
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="bg-background/90 backdrop-blur-sm rounded-full p-2 transform scale-0 group-hover:scale-100 transition-transform duration-300">
                      <ImageIcon className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 pt-4 border-t border-muted/30">
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
              <DialogContent className="max-w-5xl p-0 bg-black/95 border-none">
                {selectedImage && (
                  <div className="relative">
                    {/* Close button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
                      onClick={closeModal}
                    >
                      <X className="h-6 w-6" />
                    </Button>
                    
                    {/* Navigation buttons */}
                    {images.length > 1 && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
                          onClick={() => navigateImage('prev')}
                        >
                          <ChevronLeft className="h-8 w-8" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
                          onClick={() => navigateImage('next')}
                        >
                          <ChevronRight className="h-8 w-8" />
                        </Button>
                      </>
                    )}
                    
                    {/* Main image */}
                    <div className="relative">
                      <img
                        src={selectedImage.url}
                        alt={selectedImage.alt || `Photo of ${name}`}
                        className="w-full max-h-[80vh] object-contain animate-fade-in"
                      />
                      
                      {/* Image info overlay */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                        <div className="text-white space-y-2">
                          <p className="text-sm opacity-80">
                            {selectedImageIndex !== null && `${selectedImageIndex + 1} of ${images.length}`}
                          </p>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Photo by {selectedImage.photographer}</p>
                              <p className="text-sm opacity-80">{selectedImage.alt || `Photo of ${name}`}</p>
                            </div>
                            <a
                              href={selectedImage.photographer_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors"
                            >
                              <ExternalLink className="h-4 w-4" />
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
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};