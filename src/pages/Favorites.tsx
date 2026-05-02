import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useToast } from '@/hooks/use-toast';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Heart,
  MapPin,
  Calendar,
  Star,
  ShoppingBag,
  Newspaper,
  ExternalLink,
  Grid,
  List,
  Download,
  Link as LinkIcon,
  CalendarDays,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchAllUserFavorites } from '@/hooks/usePageFetchers';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { useCalendarFeed } from '@/hooks/useCalendarFeed';
import { AuthGate } from '@/components/layout/AuthGate';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState } from '@/components/ui/EmptyState';

interface FavoriteItem {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  image_url?: string;
  location?: string;
  rating?: number;
  price?: number;
  date?: string;
  category?: string;
  type: 'venue' | 'event' | 'marketplace' | 'news';
}

export default function Favorites() {
  const { user } = useAuth();
  const { _t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { toast } = useToast();
  const {
    loading: calendarLoading,
    copyCalendarFeedUrl,
    downloadCalendarFile,
    getCalendarFeedUrl,
  } = useCalendarFeed();
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState<string>('');
  const [favorites, setFavorites] = useState<Record<string, FavoriteItem[]>>({
    venue: [],
    event: [],
    marketplace: [],
    news: [],
  });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (user) {
      fetchAllFavorites();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAllFavorites defined below, re-run on user change
  }, [user]);

  const fetchAllFavorites = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const {
        venues: venueData,
        events: eventData,
        marketplace: marketplaceData,
        news: newsData,
      } = await fetchAllUserFavorites(user.id);

      // Transform data
      const transformedFavorites = {
        venue:
          venueData?.map((venue) => ({
            id: venue.id,
            slug: venue.slug,
            title: venue.name || '',
            description: venue.description,
            image_url: venue.image_url,
            location: venue.location,
            rating: venue.rating,
            category: venue.category,
            type: 'venue' as const,
          })) || [],
        event:
          eventData?.map((event) => ({
            id: event.id,
            slug: event.slug,
            title: event.title || '',
            description: event.description,
            image_url: event.images?.[0],
            location: `${event.city}${event.state ? ', ' + event.state : ''}`,
            date: event.start_date,
            price: event.price_min,
            category: event.event_type,
            type: 'event' as const,
          })) || [],
        marketplace:
          marketplaceData?.map((listing) => ({
            id: listing.id,
            slug: listing.slug,
            title: listing.title || '',
            description: listing.description,
            image_url: listing.images?.[0],
            location: listing.location,
            price: listing.price,
            category: listing.category,
            type: 'marketplace' as const,
          })) || [],
        news:
          newsData?.map((article) => ({
            id: article.id,
            slug: article.slug,
            title: article.title || '',
            description: article.excerpt,
            image_url: article.image_url,
            date: article.published_at,
            category: article.category,
            type: 'news' as const,
          })) || [],
      };
      setFavorites(transformedFavorites);
    } catch (_error) {
      toast({ title: 'Error', description: 'Failed to load favorites. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getAllFavorites = () => {
    return Object.values(favorites).flat();
  };

  const getEventCount = () => {
    return favorites.event.length;
  };

  const handleCalendarSubscription = async () => {
    const url = await getCalendarFeedUrl();
    if (url) {
      setCalendarUrl(url);
      setCalendarDialogOpen(true);
    }
  };

  const getTotalCount = () => {
    return Object.values(favorites).reduce((total, items) => total + items.length, 0);
  };

  const getTabCount = (type: string) => {
    if (type === 'all') return getTotalCount();
    return favorites[type as keyof typeof favorites]?.length || 0;
  };

  const renderFavoriteCard = (item: FavoriteItem) => {
    const getItemUrl = () => {
      switch (item.type) {
        case 'venue':
          return `/venues/${item.slug || item.id}`;
        case 'event':
          return `/events/${item.slug || item.id}`;
        case 'marketplace':
          return `/marketplace/${item.slug || item.id}`;
        case 'news':
          return `/news/${item.slug || item.id}`;
        default:
          return '#';
      }
    };
    const getIcon = () => {
      switch (item.type) {
        case 'venue':
          return <MapPin style={{ height: 16, width: 16 }} />;
        case 'event':
          return <Calendar style={{ height: 16, width: 16 }} />;
        case 'marketplace':
          return <ShoppingBag style={{ height: 16, width: 16 }} />;
        case 'news':
          return <Newspaper style={{ height: 16, width: 16 }} />;
      }
    };
    if (viewMode === 'grid') {
      return (
        <Card
          key={`${item.type}-${item.id}`}

        >
          <Box sx={{ position: 'relative' }}>
            {item.image_url ? (
              <Box
                sx={{
                  aspectRatio: '16/9',
                  position: 'relative',
                  overflow: 'hidden',
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                }}
              >
                <Box
                  component="img"
                  src={item.image_url}
                  alt={item.title}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    '.group:hover &': { transform: 'scale(1.05)' },
                    transition: 'transform 200ms',
                  }}
                />
                <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                  <Badge
                    variant="secondary"

                  >
                    {getIcon()}
                    <Box component="span" sx={{ ml: 0.5, textTransform: 'capitalize' }}>
                      {item.type}
                    </Box>
                  </Badge>
                </Box>
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <FavoriteButton
                    itemId={item.id}
                    type={item.type}
                    variant="ghost"

                  />
                </Box>
              </Box>
            ) : (
              <Box
                sx={{
                  aspectRatio: '16/9',
                  bgcolor: 'action.hover',
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                {getIcon()}
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <FavoriteButton itemId={item.id} type={item.type} variant="ghost" />
                </Box>
              </Box>
            )}
          </Box>
          <CardContent>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                fontSize: '1.125rem',
                mb: 1,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                '.group:hover &': { color: 'primary.main' },
                transition: 'color 150ms',
              }}
            >
              {item.title}
            </Typography>
            {item.description && (
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  mb: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {item.description}
              </Typography>
            )}
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 1,
                fontSize: '0.75rem',
                color: 'text.secondary',
                mb: 1.5,
              }}
            >
              {item.location && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <MapPin style={{ height: 12, width: 12 }} />
                  {item.location}
                </Box>
              )}
              {item.rating && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Star style={{ height: 12, width: 12, fill: '#facc15', color: '#facc15' }} />
                  {item.rating}
                </Box>
              )}
              {item.category && (
                <Badge variant="outline">
                  {item.category}
                </Badge>
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {item.price ? (
                <Typography sx={{ fontWeight: 600, fontSize: '1.125rem', color: 'primary.main' }}>
                  ${item.price}
                </Typography>
              ) : (
                <Box />
              )}
              <Button
                asChild
                variant="outline"
                size="sm"

              >
                <LocalizedLink to={getItemUrl()}>
                  <ExternalLink style={{ height: 12, width: 12, marginRight: 4 }} />
                  View
                </LocalizedLink>
              </Button>
            </Box>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card
        key={`${item.type}-${item.id}`}

      >
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            {item.image_url && (
              <Box sx={{ flexShrink: 0 }}>
                <Box
                  component="img"
                  src={item.image_url}
                  alt={item.title}
                  sx={{
                    width: 80,
                    height: 80,
                    objectFit: 'cover',
                    borderRadius: 2,
                    '.group:hover &': { transform: 'scale(1.05)' },
                    transition: 'transform 200ms',
                  }}
                />
              </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 1,
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {getIcon()}
                    <Badge
                      variant="secondary"

                    >
                      {item.type}
                    </Badge>
                    {item.category && (
                      <Badge variant="outline">
                        {item.category}
                      </Badge>
                    )}
                  </Box>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 600,
                      fontSize: '1.25rem',
                      lineHeight: 'tight',
                      mb: 1,
                      '.group:hover &': { color: 'primary.main' },
                      transition: 'color 150ms',
                    }}
                  >
                    {item.title}
                  </Typography>
                  {item.description && (
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        mb: 1.5,
                      }}
                    >
                      {item.description}
                    </Typography>
                  )}
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 2,
                      fontSize: '0.875rem',
                      color: 'text.secondary',
                    }}
                  >
                    {item.location && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <MapPin style={{ height: 12, width: 12 }} />
                        {item.location}
                      </Box>
                    )}
                    {item.date && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Calendar style={{ height: 12, width: 12 }} />
                        {new Date(item.date).toLocaleDateString()}
                      </Box>
                    )}
                    {item.rating && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Star
                          style={{ height: 12, width: 12, fill: '#facc15', color: '#facc15' }}
                        />
                        {item.rating}
                      </Box>
                    )}
                  </Box>
                </Box>
                <Box
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}
                >
                  <FavoriteButton itemId={item.id} type={item.type} variant="ghost" />
                  {item.price && (
                    <Typography
                      sx={{ fontWeight: 600, fontSize: '1.25rem', color: 'primary.main' }}
                    >
                      ${item.price}
                    </Typography>
                  )}
                  <Button
                    asChild
                    variant="outline"
                    size="sm"

                  >
                    <LocalizedLink to={getItemUrl()}>
                      <ExternalLink style={{ height: 12, width: 12, marginRight: 4 }} />
                      View Details
                    </LocalizedLink>
                  </Button>
                </Box>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  };

  const headerSubtitle = loading
    ? 'Loading your favorites...'
    : `${getTotalCount()} items in your favorites`;

  const headerActions =
    !loading && getTotalCount() > 0 ? (
      <>
        {getEventCount() > 0 && (
          <Button
            variant="outline"
            onClick={handleCalendarSubscription}
            disabled={calendarLoading}

          >
            <CalendarDays style={{ height: 16, width: 16 }} />
            Subscribe to Events Calendar
          </Button>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>View:</Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              borderRadius: 2,
            }}
          >
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}

            >
              <List style={{ height: 16, width: 16 }} />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}

            >
              <Grid style={{ height: 16, width: 16 }} />
            </Button>
          </Box>
        </Box>
      </>
    ) : undefined;

  return (
    <AuthGate title="Favorites" description="Please sign in to view your favorites">
      <Container sx={{ py: 4 }}>
        <PageHeader title="Favorites" subtitle={headerSubtitle} actions={headerActions} />

        {/* Calendar Subscription Dialog */}
        <Dialog open={calendarDialogOpen} onOpenChange={setCalendarDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                <CalendarDays style={{ height: 20, width: 20 }} />
                Subscribe to Your Events Calendar
              </DialogTitle>
              <DialogDescription>
                Subscribe to your favorite events in any calendar application that supports iCal
                feeds.
              </DialogDescription>
            </DialogHeader>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 500, mb: 1 }}>Calendar Subscription URL:</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    component="code"
                    sx={{
                      flex: 1,
                      p: 1,
                      bgcolor: 'background.paper',
                      borderRadius: 1,
                      fontSize: '0.875rem',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    {calendarUrl}
                  </Box>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyCalendarFeedUrl}
                    disabled={calendarLoading}
                  >
                    <LinkIcon style={{ height: 16, width: 16 }} />
                  </Button>
                </Box>
              </Box>

              <Box
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Subscribe in Calendar App</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Copy the URL above and add it as a new calendar subscription in your preferred
                      calendar app.
                    </Typography>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        fontSize: '0.875rem',
                      }}
                    >
                      <Box>
                        <strong>Google Calendar:</strong> Settings &rarr; Add calendar &rarr; From
                        URL
                      </Box>
                      <Box>
                        <strong>Apple Calendar:</strong> File &rarr; New Calendar Subscription
                      </Box>
                      <Box>
                        <strong>Outlook:</strong> Add calendar &rarr; Subscribe from web
                      </Box>
                    </Box>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyCalendarFeedUrl}
                      disabled={calendarLoading}

                    >
                      <LinkIcon style={{ height: 16, width: 16, marginRight: 8 }} />
                      Copy Subscription URL
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Download Calendar File</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Download a one-time .ics file that you can import into any calendar
                      application.
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      Note: Downloaded files won't automatically update when you add new favorites.
                      Use the subscription URL for automatic updates.
                    </Typography>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadCalendarFile}
                      disabled={calendarLoading}

                    >
                      <Download style={{ height: 16, width: 16, marginRight: 8 }} />
                      Download .ics File
                    </Button>
                  </CardContent>
                </Card>
              </Box>

              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                <Typography sx={{ fontSize: 'inherit', color: 'inherit' }}>
                  &bull; Only future events from your favorites will appear in the calendar
                </Typography>
                <Typography sx={{ fontSize: 'inherit', color: 'inherit' }}>
                  &bull; The calendar updates automatically when you add or remove event favorites
                </Typography>
                <Typography sx={{ fontSize: 'inherit', color: 'inherit' }}>
                  &bull; Calendar subscriptions are cached for up to 1 hour for better performance
                </Typography>
              </Box>
            </Box>
          </DialogContent>
        </Dialog>

        {/* Content */}
        {loading ? (
          <PageLoadingState count={4} variant={viewMode === 'grid' ? 'card' : 'list'} />
        ) : getTotalCount() === 0 ? (
          <EmptyState
            icon={Heart}
            title="Nothing saved yet"
            description="Heart the things you love and find them here."
            mood="encouraging"
            primaryAction={{
              label: 'Browse Events',
              onClick: () => navigate('/events'),
            }}
            secondaryAction={{
              label: 'Browse Venues',
              onClick: () => navigate('/venues'),
              variant: 'outline',
            }}
          />
        ) : (
          <Paper elevation={0} sx={{ bgcolor: 'background.paper', borderRadius: 2, p: 3 }}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">
                  All ({getTabCount('all')})
                </TabsTrigger>
                <TabsTrigger value="venue">
                  <MapPin style={{ height: 12, width: 12 }} />
                  Venues ({getTabCount('venue')})
                </TabsTrigger>
                <TabsTrigger value="event">
                  <Calendar style={{ height: 12, width: 12 }} />
                  Events ({getTabCount('event')})
                </TabsTrigger>
                <TabsTrigger
                  value="marketplace"

                >
                  <ShoppingBag style={{ height: 12, width: 12 }} />
                  Marketplace ({getTabCount('marketplace')})
                </TabsTrigger>
                <TabsTrigger value="news">
                  <Newspaper style={{ height: 12, width: 12 }} />
                  News ({getTabCount('news')})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                <Box
                  sx={
                    viewMode === 'grid'
                      ? {
                          display: 'grid',
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: '1fr 1fr',
                            lg: 'repeat(3, 1fr)',
                            xl: 'repeat(4, 1fr)',
                          },
                          gap: 3,
                        }
                      : { display: 'flex', flexDirection: 'column', gap: 2 }
                  }
                >
                  {getAllFavorites().map(renderFavoriteCard)}
                </Box>
              </TabsContent>

              {Object.entries(favorites).map(([type, items]) => (
                <TabsContent key={type} value={type}>
                  <Box
                    sx={
                      viewMode === 'grid'
                        ? {
                            display: 'grid',
                            gridTemplateColumns: {
                              xs: '1fr',
                              md: '1fr 1fr',
                              lg: 'repeat(3, 1fr)',
                              xl: 'repeat(4, 1fr)',
                            },
                            gap: 3,
                          }
                        : { display: 'flex', flexDirection: 'column', gap: 2 }
                    }
                  >
                    {items.map(renderFavoriteCard)}
                  </Box>
                </TabsContent>
              ))}
            </Tabs>
          </Paper>
        )}
      </Container>
    </AuthGate>
  );
}
