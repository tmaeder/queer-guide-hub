import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Globe, ExternalLink, Share2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { useMedusaMarketplace, MedusaListing } from '@/hooks/useMedusaMarketplace';
import { toast } from '@/hooks/use-toast';

export default function MarketplaceItemDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { getProductById } = useMedusaMarketplace();
  const [listing, setListing] = useState<MedusaListing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchListing = async () => {
      try {
        setLoading(true);
        const product = await getProductById(id);
        setListing(product);
      } catch (error) {
        console.error('Error fetching product:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [id, getProductById]);

  const handleShare = () => {
    try {
      const shareData = {
        title: listing?.title || 'Marketplace Item',
        text: listing?.description?.slice(0, 120) || '',
        url: window.location.href,
      };
      if (navigator.share) {
        navigator.share(shareData);
      } else {
        navigator.clipboard.writeText(shareData.url);
        toast({ title: 'Link copied to clipboard' });
      }
    } catch {}
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-64 bg-muted rounded"></div>
              <div className="h-48 bg-muted rounded"></div>
            </div>
            <div className="space-y-6">
              <div className="h-32 bg-muted rounded"></div>
              <div className="h-48 bg-muted rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Item Not Found</h1>
        <p className="text-muted-foreground mb-6">The marketplace item you're looking for doesn't exist.</p>
        <Link to="/marketplace">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Marketplace
          </Button>
        </Link>
      </div>
    );
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      products: 'bg-primary/10 text-primary',
      services: 'bg-accent/10 text-accent',
    };
    return colors[category] || 'bg-muted/10 text-muted-foreground';
  };

  return (
    <div className="w-full px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link to="/marketplace" className="inline-flex items-center text-muted-foreground hover:text-primary mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Marketplace
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{listing.title}</h1>
              {listing.featured && (
                <Badge className="bg-accent/10 text-accent">Featured</Badge>
              )}
            </div>
            {listing.business_name && (
              <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <Globe className="h-4 w-4" />
                <span className="text-sm">{listing.business_name}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Badge className={getCategoryColor(listing.category || 'products')}>
                {listing.category || 'products'}
              </Badge>
              {listing.subcategory && (
                <Badge variant="outline">
                  {listing.subcategory}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Images */}
            {listing.images && listing.images.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {listing.images.slice(0, 4).map((image, index) => (
                      <div key={index} className="aspect-video bg-muted rounded-lg overflow-hidden">
                        <img 
                          src={image} 
                          alt={`${listing.title} - Image ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Description */}
            {listing.description && (
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">{listing.description}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Price & Website */}
            <Card>
              <CardHeader>
                <CardTitle>Price & Website</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    {listing.price != null ? `$${listing.price}` : 'Price varies'}
                  </div>
                  {listing.currency && listing.currency !== 'USD' && (
                    <p className="text-sm text-muted-foreground">Currency: {listing.currency}</p>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  {listing.website && (
                    <Button variant="outline" className="w-full" asChild>
                      <a href={listing.website} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Visit Website
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
