import {
  Star,
  MapPin,
  Phone,
  Globe,
  Mail,
  Heart,
  ExternalLink,
  Share2,
  Eye,
  Shield,
  Truck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import type { Database } from '@/integrations/supabase/types';
import { formatCurrency } from '@/lib/currency';

export type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
export type MarketplaceReview = Database['public']['Tables']['marketplace_reviews']['Row'] & {
  profiles: { display_name: string; avatar_url: string | null } | null;
};

export function formatPrice(listing: MarketplaceListing) {
  if (!listing.price) {
    if (listing.price_type === 'free') return 'Free';
    return 'Price varies';
  }
  const price = formatCurrency(listing.price, listing.currency || 'USD');
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
}

export function getBusinessTypeIcon(type: string | null | undefined) {
  switch (type) {
    case 'online':
      return <Globe style={{ width: 16, height: 16 }} />;
    case 'physical':
      return <MapPin style={{ width: 16, height: 16 }} />;
    case 'both':
      return (
        <div className="flex gap-1">
          <Globe style={{ width: 16, height: 16 }} />
          <MapPin style={{ width: 16, height: 16 }} />
        </div>
      );
    default:
      return null;
  }
}

interface HeroProps {
  listing: MarketplaceListing;
  reviewsCount: number;
  averageRating: number;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  heroImage: string | null;
}

export function MarketplaceHero({
  listing,
  reviewsCount,
  averageRating,
  isFavorited,
  onToggleFavorite,
  onShare,
  heroImage,
}: HeroProps) {
  return (
    <>
      {heroImage && (
        <div className="w-full h-64 md:h-80 rounded-xl overflow-hidden mb-6 bg-muted flex items-center justify-center">
          <img
            src={heroImage}
            alt={listing.title}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h4 className="text-2xl font-bold">{listing.title}</h4>
              {listing.featured && <Badge>Featured</Badge>}
            </div>

            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <p className="text-base font-medium">{listing.business_name}</p>
              {listing.business_type && getBusinessTypeIcon(listing.business_type)}
              {listing.location && (
                <div className="flex items-center gap-1">
                  <MapPin style={{ width: 12, height: 12, color: 'hsl(var(--muted-foreground))' }} />
                  <p className="text-sm text-muted-foreground">{listing.location}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="secondary">{listing.category}</Badge>
              {listing.subcategory && <Badge variant="outline">{listing.subcategory}</Badge>}
              {averageRating > 0 && (
                <div className="flex items-center gap-1">
                  <Star style={{ width: 16, height: 16, fill: 'currentColor', color: 'inherit' }} />
                  <p className="text-sm font-medium">{averageRating.toFixed(1)}</p>
                  <p className="text-sm text-muted-foreground">({reviewsCount} reviews)</p>
                </div>
              )}
              {listing.views_count && listing.views_count > 0 && (
                <div className="flex items-center gap-1">
                  <Eye style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
                  <p className="text-sm text-muted-foreground">{listing.views_count} views</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <ReportButton
              contentType="marketplace_listings"
              contentId={listing.id}
              contentName={listing.title}
            />
            <AdminEditButton
              contentType="marketplace_listings"
              contentId={listing.id}
              contentName={listing.title}
              currentData={listing as Record<string, unknown>}
              onSaved={() => window.location.reload()}
            />
            <Button variant="outline" size="sm" onClick={onToggleFavorite}>
              <Heart
                style={{
                  width: 16,
                  height: 16,
                  marginRight: 8,
                  fill: isFavorited ? 'currentColor' : 'none',
                  color: isFavorited ? '#d32f2f' : 'inherit',
                }}
              />
              {isFavorited ? 'Favorited' : 'Favorite'}
            </Button>
            <Button variant="outline" size="sm" onClick={onShare}>
              <Share2 style={{ width: 16, height: 16, marginRight: 8 }} />
              Share
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

interface OverviewProps {
  listing: MarketplaceListing;
  reviews: MarketplaceReview[];
  t: (k: string, d?: string) => string;
}

export function MarketplaceOverview({ listing, reviews, t }: OverviewProps) {
  const remainingImages =
    listing.images && listing.images.length > 1 ? listing.images.slice(1) : [];

  return (
    <div className="flex flex-col gap-6">
      {remainingImages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('pages.marketplaceDetail.photos', 'Photos')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {remainingImages.map((image, index) => (
                <div key={index} className="bg-muted rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <img
                    src={image}
                    alt={`${listing.title} - Image ${index + 2}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      cursor: 'pointer',
                      transition: 'transform 300ms',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLImageElement).style.transform = '';
                    }}
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    onClick={() => window.open(image, '_blank')}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {listing.description && (
        <Card>
          <CardHeader>
            <CardTitle>{t('pages.marketplaceDetail.description', 'Description')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{listing.description}</p>
          </CardContent>
        </Card>
      )}

      {listing.shipping_available && listing.shipping_info && (
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Truck style={{ width: 16, height: 16 }} />
                Shipping Information
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{listing.shipping_info}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Reviews ({reviews.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reviews.length > 0 ? (
            <div className="flex flex-col gap-4">
              {reviews.slice(0, 5).map((review) => (
                <div key={review.id} className="pb-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Avatar style={{ width: 32, height: 32 }}>
                        <AvatarFallback>
                          {review.profiles?.display_name?.[0] || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {review.profiles?.display_name || 'Anonymous'}
                        </p>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              style={{
                                width: 12,
                                height: 12,
                                fill: i < review.rating ? 'currentColor' : 'none',
                                color: i < review.rating ? 'inherit' : '#e0e0e0',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {review.purchase_verified && (
                        <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                          <Shield style={{ width: 12, height: 12, marginRight: 4 }} />
                          Verified Purchase
                        </Badge>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {review.title && (
                    <p className="text-sm font-medium mb-1">{review.title}</p>
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
  );
}

interface SidebarProps {
  listing: MarketplaceListing;
  t: (k: string, d?: string) => string;
}

export function MarketplaceSidebar({ listing, t }: SidebarProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('pages.marketplaceDetail.priceContact', 'Price & Contact')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <h4 className="text-2xl font-bold mb-2 text-primary">{formatPrice(listing)}</h4>
            {listing.currency && listing.currency !== 'USD' && (
              <p className="text-sm text-muted-foreground">Currency: {listing.currency}</p>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            {listing.contact_email && (
              <Button style={{ width: '100%' }} asChild>
                <a href={`mailto:${listing.contact_email}`}>
                  <Mail style={{ width: 16, height: 16, marginRight: 8 }} />
                  Send Email
                </a>
              </Button>
            )}
            {listing.contact_phone && (
              <Button variant="outline" style={{ width: '100%' }} asChild>
                <a href={`tel:${listing.contact_phone}`}>
                  <Phone style={{ width: 16, height: 16, marginRight: 8 }} />
                  Call {listing.contact_phone}
                </a>
              </Button>
            )}
            {listing.website && (
              <Button variant="outline" style={{ width: '100%' }} asChild>
                <a href={listing.website} target="_blank" rel="noopener noreferrer">
                  <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                  Visit Website
                </a>
              </Button>
            )}
          </div>

          {listing.shipping_available && (
            <div className="flex items-center gap-2 bg-muted rounded p-2 text-sm">
              <Truck style={{ width: 16, height: 16 }} />
              Shipping available
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('pages.marketplaceDetail.businessDetails', 'Business Details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <p className="text-sm font-medium mb-1">Business Type</p>
            <div className="flex items-center gap-2">
              {listing.business_type && getBusinessTypeIcon(listing.business_type)}
              <p className="text-sm capitalize">
                {listing.business_type || 'Not specified'}
              </p>
            </div>
          </div>

          {listing.location && (
            <div>
              <p className="text-sm font-medium mb-1">Location</p>
              <p className="text-sm text-muted-foreground">{listing.location}</p>
            </div>
          )}

          <div>
            <p className="text-sm font-medium mb-1">Listed</p>
            <p className="text-sm text-muted-foreground">
              {new Date(listing.created_at).toLocaleDateString()}
            </p>
          </div>
        </CardContent>
      </Card>

      {listing.social_media && (
        <Card>
          <CardHeader>
            <CardTitle>{t('pages.marketplaceDetail.socialMedia', 'Social Media')}</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(listing.social_media as Record<string, string>).map(
              ([platform, url]) => (
                <Button
                  key={platform}
                  variant="outline"
                  size="sm"
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                  asChild
                >
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                    {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </a>
                </Button>
              ),
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
