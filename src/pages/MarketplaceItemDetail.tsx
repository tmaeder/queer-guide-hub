import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { formatCurrency } from '@/lib/currency';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
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
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useMarketplace } from '@/hooks/useMarketplace';
import { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';import { useTranslation } from 'react-i18next';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
type MarketplaceReview = Database['public']['Tables']['marketplace_reviews']['Row'] & {
  profiles: { display_name: string; avatar_url: string | null } | null;
};

export default function MarketplaceItemDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { incrementViews } = useMarketplace();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    const fetchListing = async () => {
      try {
        setLoading(true);

        let { data: listingData, error: listingError } = await supabase
          .from('marketplace_listings')
          .select('*')
          .eq('slug', slug)
          .single();

        if (listingError && /uuid|invalid|no rows/i.test(listingError.message || '')) {
          const fallback = await supabase.from('marketplace_listings').select('*').eq('id', slug).single();
          listingData = fallback.data;
          listingError = fallback.error;
        }

        if (listingError) throw listingError;
        setListing(listingData);

        await incrementViews(listingData.id);

        const { data: reviewsData, error: reviewsError } = await supabase
          .from('marketplace_reviews')
          .select(
            `
            *,
            profiles:user_id (
              display_name,
              avatar_url
            )
          `,
          )
          .eq('listing_id', listingData.id)
          .order('created_at', { ascending: false });

        if (reviewsError) throw reviewsError;
        setReviews(reviewsData || []);

        if (user) {
          const { data: favoriteData } = await supabase
            .from('marketplace_favorites')
            .select('id')
            .eq('listing_id', listingData.id)
            .eq('user_id', user.id)
            .single();

          setIsFavorited(!!favoriteData);
        }
      } catch (_error) {
        toast({ title: t('common.error', 'Error'), description: t('pages.marketplaceDetail.loadFailed', 'Failed to load listing details.'), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user]);

  const handleToggleFavorite = async () => {
    if (!user) {
      toast({
        title: t('pages.marketplaceDetail.authRequired', 'Authentication required'),
        description: 'Please sign in to favorite items',
        variant: 'destructive',
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
        toast({ title: 'Removed from favorites' });
      } else {
        const { error } = await supabase
          .from('marketplace_favorites')
          .insert({ listing_id: listing.id, user_id: user.id });

        if (error) throw error;
        setIsFavorited(true);
        toast({ title: 'Added to favorites' });
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast({
        title: 'Error',
        description: 'Failed to update favorites',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <Container sx={{ py: 4 }}>
        <Box
          sx={{
            '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        >
          <Box sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '33%', mb: 3 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ height: 256, bgcolor: 'action.hover', borderRadius: 1 }} />
              <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 1 }} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ height: 128, bgcolor: 'action.hover', borderRadius: 1 }} />
              <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 1 }} />
            </Box>
          </Box>
        </Box>
      </Container>
    );
  }

  if (!listing) {
    return (
      <Container sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Item Not Found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          The marketplace item you're looking for doesn't exist.
        </Typography>
        <LocalizedLink to="/marketplace">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Marketplace
          </Button>
        </LocalizedLink>
      </Container>
    );
  }

  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;
  const formatPrice = () => {
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
  };

  const getBusinessTypeIcon = (type: string) => {
    switch (type) {
      case 'online':
        return <Globe style={{ width: 16, height: 16 }} />;
      case 'physical':
        return <MapPin style={{ width: 16, height: 16 }} />;
      case 'both':
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Globe style={{ width: 16, height: 16 }} />
            <MapPin style={{ width: 16, height: 16 }} />
          </Box>
        );
      default:
        return null;
    }
  };

  const heroImage = listing.images && listing.images.length > 0 ? listing.images[0] : null;
  const remainingImages =
    listing.images && listing.images.length > 1 ? listing.images.slice(1) : [];

  const handleShare = async () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: listing.title, url: shareUrl });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: t('pages.marketplaceDetail.linkCopied', 'Link copied'), description: t('pages.marketplaceDetail.linkCopiedDesc', 'Listing link copied to clipboard') });
    }
  };

  return (
    <Container sx={{ py: 4 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
        <LocalizedLink
          to="/marketplace"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14, marginRight: 4 }} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ '&:hover': { color: 'primary.main' } }}
          >
            Marketplace
          </Typography>
        </LocalizedLink>
        {listing.category && (
          <>
            <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
            <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
              {listing.category}
            </Typography>
          </>
        )}
        <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {listing.title}
        </Typography>
      </Box>

      {/* Hero Image */}
      {heroImage && (
        <Box
          sx={{
            width: '100%',
            height: { xs: 160, md: 192 },
            borderRadius: 3,
            overflow: 'hidden',
            mb: 3,
          }}
        >
          <Box
            component="img"
            src={heroImage}
            alt={listing.title}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </Box>
      )}

      {/* Title Row */}
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { md: 'flex-start' },
            justifyContent: { md: 'space-between' },
            gap: 2,
          }}
        >
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, flexWrap: 'wrap' }}>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {listing.title}
              </Typography>
              {listing.featured && <Badge>Featured</Badge>}
            </Box>

            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                {listing.business_name}
              </Typography>
              {listing.business_type && getBusinessTypeIcon(listing.business_type)}
              {listing.location && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <MapPin style={{ width: 12, height: 12, color: 'hsl(var(--muted-foreground))' }} />
                  <Typography variant="body2" color="text.secondary">
                    {listing.location}
                  </Typography>
                </Box>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Badge variant="secondary">{listing.category}</Badge>
              {listing.subcategory && <Badge variant="outline">{listing.subcategory}</Badge>}
              {averageRating > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Star style={{ width: 16, height: 16, fill: 'currentColor', color: 'inherit' }} />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {averageRating.toFixed(1)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    ({reviews.length} reviews)
                  </Typography>
                </Box>
              )}
              {listing.views_count && listing.views_count > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Eye style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
                  <Typography variant="body2" color="text.secondary">
                    {listing.views_count} views
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
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
            <Button variant="outline" size="sm" onClick={handleToggleFavorite}>
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
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 style={{ width: 16, height: 16, marginRight: 8 }} />
              Share
            </Button>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
        {/* Main Content */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Additional Images */}
          {remainingImages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.marketplaceDetail.photos', 'Photos')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: 2,
                  }}
                >
                  {remainingImages.map((image, index) => (
                    <Box
                      key={index}
                      sx={{
                        aspectRatio: '16/9',
                        bgcolor: 'action.hover',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        component="img"
                        src={image}
                        alt={`${listing.title} - Image ${index + 2}`}
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          cursor: 'pointer',
                          '&:hover': { transform: 'scale(1.05)' },
                          transition: 'transform 300ms',
                        }}
                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        onClick={() => window.open(image, '_blank')}
                      />
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Description */}
          {listing.description && (
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.marketplaceDetail.description', 'Description')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                  {listing.description}
                </Typography>
              </CardContent>
            </Card>
          )}

          {/* Shipping Info */}
          {listing.shipping_available && listing.shipping_info && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Truck style={{ width: 16, height: 16 }} />
                    Shipping Information
                  </Box>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Typography color="text.secondary">{listing.shipping_info}</Typography>
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
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {reviews.slice(0, 5).map((review) => (
                    <Box
                      key={review.id}
                      sx={{
                        pb: 2,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          mb: 1,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar style={{ width: 32, height: 32 }}>
                            <AvatarFallback>
                              {review.profiles?.display_name?.[0] || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {review.profiles?.display_name || 'Anonymous'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
                            </Box>
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {review.purchase_verified && (
                            <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                              <Shield style={{ width: 12, height: 12, marginRight: 4 }} />
                              Verified Purchase
                            </Badge>
                          )}
                          <Typography variant="caption" color="text.secondary">
                            {new Date(review.created_at).toLocaleDateString()}
                          </Typography>
                        </Box>
                      </Box>
                      {review.title && (
                        <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                          {review.title}
                        </Typography>
                      )}
                      {review.content && (
                        <Typography variant="body2" color="text.secondary">
                          {review.content}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No reviews yet
                </Typography>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* Sidebar */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Price & Contact */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.marketplaceDetail.priceContact', 'Price & Contact')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="primary" sx={{ fontWeight: 700, mb: 1 }}>
                  {formatPrice()}
                </Typography>
                {listing.currency && listing.currency !== 'USD' && (
                  <Typography variant="body2" color="text.secondary">
                    Currency: {listing.currency}
                  </Typography>
                )}
              </Box>

              <Separator />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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
              </Box>

              {listing.shipping_available && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    fontSize: 14,
                    bgcolor: 'action.hover',
                    p: 1,
                    borderRadius: 1,
                  }}
                >
                  <Truck style={{ width: 16, height: 16 }} />
                  Shipping available
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Business Details */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.marketplaceDetail.businessDetails', 'Business Details')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                  Business Type
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {listing.business_type && getBusinessTypeIcon(listing.business_type)}
                  <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                    {listing.business_type || 'Not specified'}
                  </Typography>
                </Box>
              </Box>

              {listing.location && (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                    Location
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {listing.location}
                  </Typography>
                </Box>
              )}

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                  Listed
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(listing.created_at).toLocaleDateString()}
                </Typography>
              </Box>
            </CardContent>
          </Card>

          {/* Social Media */}
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
        </Box>
      </Box>
    </Container>
  );
}
