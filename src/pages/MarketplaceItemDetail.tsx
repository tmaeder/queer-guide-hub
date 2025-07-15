import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Star, MapPin, Phone, Globe, Mail, Heart, ExternalLink, Share2, Eye, Shield, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useMarketplace } from '@/hooks/useMarketplace';
import { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
type MarketplaceReview = Database['public']['Tables']['marketplace_reviews']['Row'] & {
  profiles: { display_name: string; avatar_url: string | null } | null;
};

export default function MarketplaceItemDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { incrementViews } = useMarketplace();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchListing = async () => {
      try {
        setLoading(true);
        
        // Fetch listing details
        const { data: listingData, error: listingError } = await supabase
          .from('marketplace_listings')
          .select('*')
          .eq('id', id)
          .single();

        if (listingError) throw listingError;
        setListing(listingData);

        // Increment view count
        await incrementViews(id);

        // Fetch reviews with user profiles
        const { data: reviewsData, error: reviewsError } = await supabase
          .from('marketplace_reviews')
          .select(`
            *,
            profiles:user_id (
              display_name,
              avatar_url
            )
          `)
          .eq('listing_id', id)
          .order('created_at', { ascending: false });

        if (reviewsError) throw reviewsError;
        setReviews(reviewsData || []);

        // Check if favorited by current user
        if (user) {
          const { data: favoriteData } = await supabase
            .from('marketplace_favorites')
            .select('id')
            .eq('listing_id', id)
            .eq('user_id', user.id)
            .single();
          
          setIsFavorited(!!favoriteData);
        }

      } catch (error) {
        console.error('Error fetching listing:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [id, user, incrementViews]);

  const handleToggleFavorite = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to favorite items",
        variant: "destructive",
      });
      return;
    }

    if (!listing) return;

    try {
      if (isFavorited) {
        const { error } = await supabase
          .from('marketplace_favorites')
          .delete()
          .eq('listing_id', listing.id)
          .eq('user_id', user.id);
        
        if (error) throw error;
        setIsFavorited(false);
        toast({ title: "Removed from favorites" });
      } else {
        const { error } = await supabase
          .from('marketplace_favorites')
          .insert({ listing_id: listing.id, user_id: user.id });
        
        if (error) throw error;
        setIsFavorited(true);
        toast({ title: "Added to favorites" });
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast({
        title: "Error",
        description: "Failed to update favorites",
        variant: "destructive",
      });
    }
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

  const averageRating = reviews.length 
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      products: 'bg-primary/10 text-primary',
      services: 'bg-accent/10 text-accent',
      classes: 'bg-secondary/10 text-secondary',
      events: 'bg-destructive/10 text-destructive',
    };
    return colors[category] || 'bg-muted/10 text-muted-foreground';
  };

  const formatPrice = () => {
    if (!listing.price) {
      if (listing.price_type === 'free') return 'Free';
      return 'Price varies';
    }

    const price = `$${listing.price}`;
    
    switch (listing.price_type) {
      case 'starting_at':
        return `Starting at ${price}`;
      case 'negotiable':
        return `${price} (negotiable)`;
      case 'free':
        return 'Free';
      default:
        return price;
    }
  };

  const getBusinessTypeIcon = (type: string) => {
    switch (type) {
      case 'online':
        return <Globe className="h-4 w-4" />;
      case 'physical':
        return <MapPin className="h-4 w-4" />;
      case 'both':
        return (
          <div className="flex gap-1">
            <Globe className="h-4 w-4" />
            <MapPin className="h-4 w-4" />
          </div>
        );
      default:
        return null;
    }
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
            
            <div className="flex items-center gap-3 mb-3">
              <span className="text-lg font-medium">{listing.business_name}</span>
              {listing.business_type && getBusinessTypeIcon(listing.business_type)}
              {listing.location && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="text-sm">{listing.location}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Badge className={getCategoryColor(listing.category)}>
                {listing.category}
              </Badge>
              {listing.subcategory && (
                <Badge variant="outline">
                  {listing.subcategory}
                </Badge>
              )}
              {averageRating > 0 && (
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-current text-accent" />
                  <span className="font-medium">{averageRating.toFixed(1)}</span>
                  <span className="text-muted-foreground">({reviews.length} reviews)</span>
                </div>
              )}
              {listing.views_count && listing.views_count > 0 && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  <span>{listing.views_count} views</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleToggleFavorite}>
              <Heart className={`h-4 w-4 mr-2 ${isFavorited ? 'fill-current text-destructive' : ''}`} />
              {isFavorited ? 'Favorited' : 'Favorite'}
            </Button>
            <Button variant="outline" size="sm">
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                          e.currentTarget.style.display = 'none';
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

          {/* Shipping Info */}
          {listing.shipping_available && listing.shipping_info && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Shipping Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{listing.shipping_info}</p>
              </CardContent>
            </Card>
          )}

          {/* Reviews */}
          <Card>
            <CardHeader>
              <CardTitle>Reviews ({reviews.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {reviews.length > 0 ? (
                <div className="space-y-4">
                  {reviews.slice(0, 5).map((review) => (
                    <div key={review.id} className="border-b pb-4 last:border-b-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback>
                              {review.profiles?.display_name?.[0] || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{review.profiles?.display_name || 'Anonymous'}</p>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`h-3 w-3 ${
                                    i < review.rating ? 'fill-current text-accent' : 'text-muted'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {review.purchase_verified && (
                            <Badge variant="outline" className="text-xs">
                              <Shield className="h-3 w-3 mr-1" />
                              Verified Purchase
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(review.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {review.title && (
                        <h4 className="font-medium mb-1">{review.title}</h4>
                      )}
                      {review.content && (
                        <p className="text-sm text-muted-foreground">{review.content}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No reviews yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Price & Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Price & Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">
                  {formatPrice()}
                </div>
                {listing.currency && listing.currency !== 'USD' && (
                  <p className="text-sm text-muted-foreground">Currency: {listing.currency}</p>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                {listing.contact_email && (
                  <Button className="w-full" asChild>
                    <a href={`mailto:${listing.contact_email}`}>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Email
                    </a>
                  </Button>
                )}
                
                {listing.contact_phone && (
                  <Button variant="outline" className="w-full" asChild>
                    <a href={`tel:${listing.contact_phone}`}>
                      <Phone className="h-4 w-4 mr-2" />
                      Call {listing.contact_phone}
                    </a>
                  </Button>
                )}
                
                {listing.website && (
                  <Button variant="outline" className="w-full" asChild>
                    <a href={listing.website} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Visit Website
                    </a>
                  </Button>
                )}
              </div>

              {listing.shipping_available && (
                <div className="flex items-center gap-2 text-sm text-accent bg-accent/10 p-2 rounded">
                  <Truck className="h-4 w-4" />
                  Shipping available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Business Details */}
          <Card>
            <CardHeader>
              <CardTitle>Business Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <h4 className="font-medium text-sm mb-1">Business Type</h4>
                <div className="flex items-center gap-2">
                  {listing.business_type && getBusinessTypeIcon(listing.business_type)}
                  <span className="text-sm capitalize">{listing.business_type || 'Not specified'}</span>
                </div>
              </div>

              {listing.location && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Location</h4>
                  <p className="text-sm text-muted-foreground">{listing.location}</p>
                </div>
              )}

              <div>
                <h4 className="font-medium text-sm mb-1">Listed</h4>
                <p className="text-sm text-muted-foreground">
                  {new Date(listing.created_at).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Social Media */}
          {listing.social_media && (
            <Card>
              <CardHeader>
                <CardTitle>Social Media</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(listing.social_media as Record<string, string>).map(([platform, url]) => (
                  <Button
                    key={platform}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    asChild
                  >
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {platform.charAt(0).toUpperCase() + platform.slice(1)}
                    </a>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {listing.tags && listing.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {listing.tags.map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}