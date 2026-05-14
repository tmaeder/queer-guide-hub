import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useToast } from '@/hooks/use-toast';
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
        <Card key={`${item.type}-${item.id}`}>
          <div className="relative">
            {item.image_url ? (
              <div className="aspect-video relative overflow-hidden rounded-t-md">
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                <div className="absolute top-2 left-2">
                  <Badge variant="secondary">
                    {getIcon()}
                    <span className="ml-1 capitalize">{item.type}</span>
                  </Badge>
                </div>
                <div className="absolute top-2 right-2">
                  <FavoriteButton itemId={item.id} type={item.type} variant="ghost" />
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-accent rounded-t-md flex items-center justify-center relative">
                {getIcon()}
                <div className="absolute top-2 right-2">
                  <FavoriteButton itemId={item.id} type={item.type} variant="ghost" />
                </div>
              </div>
            )}
          </div>
          <CardContent>
            <h6 className="font-semibold text-lg mb-2 overflow-hidden transition-colors duration-150 group-hover:text-primary [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
              {item.title}
            </h6>
            {item.description && (
              <p className="text-sm text-muted-foreground mb-2 overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                {item.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
              {item.location && (
                <div className="flex items-center gap-1">
                  <MapPin style={{ height: 12, width: 12 }} />
                  {item.location}
                </div>
              )}
              {item.rating && (
                <div className="flex items-center gap-1">
                  <Star style={{ height: 12, width: 12, fill: 'currentColor' }} />
                  {item.rating}
                </div>
              )}
              {item.category && <Badge variant="outline">{item.category}</Badge>}
            </div>
            <div className="flex items-center justify-between">
              {item.price ? (
                <span className="font-semibold text-lg text-primary">${item.price}</span>
              ) : (
                <div />
              )}
              <Button asChild variant="outline" size="sm">
                <LocalizedLink to={getItemUrl()}>
                  <ExternalLink style={{ height: 12, width: 12, marginRight: 4 }} />
                  View
                </LocalizedLink>
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card key={`${item.type}-${item.id}`}>
        <CardContent>
          <div className="flex items-start gap-4">
            {item.image_url && (
              <div className="flex-shrink-0">
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="w-20 h-20 object-cover rounded-md transition-transform duration-200 group-hover:scale-105"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getIcon()}
                    <Badge variant="secondary">{item.type}</Badge>
                    {item.category && <Badge variant="outline">{item.category}</Badge>}
                  </div>
                  <h6 className="font-semibold text-xl leading-tight mb-2 transition-colors duration-150 group-hover:text-primary">
                    {item.title}
                  </h6>
                  {item.description && (
                    <p className="text-sm text-muted-foreground overflow-hidden mb-2 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                      {item.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    {item.location && (
                      <div className="flex items-center gap-1">
                        <MapPin style={{ height: 12, width: 12 }} />
                        {item.location}
                      </div>
                    )}
                    {item.date && (
                      <div className="flex items-center gap-1">
                        <Calendar style={{ height: 12, width: 12 }} />
                        {new Date(item.date).toLocaleDateString()}
                      </div>
                    )}
                    {item.rating && (
                      <div className="flex items-center gap-1">
                        <Star style={{ height: 12, width: 12, fill: 'currentColor' }} />
                        {item.rating}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <FavoriteButton itemId={item.id} type={item.type} variant="ghost" />
                  {item.price && (
                    <span className="font-semibold text-xl text-primary">${item.price}</span>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <LocalizedLink to={getItemUrl()}>
                      <ExternalLink style={{ height: 12, width: 12, marginRight: 4 }} />
                      View Details
                    </LocalizedLink>
                  </Button>
                </div>
              </div>
            </div>
          </div>
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
          <Button variant="outline" onClick={handleCalendarSubscription} disabled={calendarLoading}>
            <CalendarDays style={{ height: 16, width: 16 }} />
            Subscribe to Events Calendar
          </Button>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">View:</span>
          <div className="flex items-center rounded-md">
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
          </div>
        </div>
      </>
    ) : undefined;

  const gridClass =
    viewMode === 'grid'
      ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
      : 'flex flex-col gap-4';

  return (
    <AuthGate title="Favorites" description="Please sign in to view your favorites">
      <div className="container mx-auto py-8 px-4">
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

            <div className="flex flex-col gap-4">
              <div className="p-4 bg-accent rounded-md">
                <p className="font-medium mb-2">Calendar Subscription URL:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-background rounded-sm text-sm font-mono break-all">
                    {calendarUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyCalendarFeedUrl}
                    disabled={calendarLoading}
                  >
                    <LinkIcon style={{ height: 16, width: 16 }} />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Subscribe in Calendar App</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Copy the URL above and add it as a new calendar subscription in your preferred
                      calendar app.
                    </p>
                    <div className="flex flex-col gap-2 text-sm">
                      <div>
                        <strong>Google Calendar:</strong> Settings &rarr; Add calendar &rarr; From URL
                      </div>
                      <div>
                        <strong>Apple Calendar:</strong> File &rarr; New Calendar Subscription
                      </div>
                      <div>
                        <strong>Outlook:</strong> Add calendar &rarr; Subscribe from web
                      </div>
                    </div>
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
                    <p className="text-sm text-muted-foreground">
                      Download a one-time .ics file that you can import into any calendar
                      application.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Note: Downloaded files won't automatically update when you add new favorites.
                      Use the subscription URL for automatic updates.
                    </p>
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
              </div>

              <div className="text-xs text-muted-foreground">
                <p>&bull; Only future events from your favorites will appear in the calendar</p>
                <p>&bull; The calendar updates automatically when you add or remove event favorites</p>
                <p>&bull; Calendar subscriptions are cached for up to 1 hour for better performance</p>
              </div>
            </div>
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
          <div className="bg-background rounded-md p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">All ({getTabCount('all')})</TabsTrigger>
                <TabsTrigger value="venue">
                  <MapPin style={{ height: 12, width: 12 }} />
                  Venues ({getTabCount('venue')})
                </TabsTrigger>
                <TabsTrigger value="event">
                  <Calendar style={{ height: 12, width: 12 }} />
                  Events ({getTabCount('event')})
                </TabsTrigger>
                <TabsTrigger value="marketplace">
                  <ShoppingBag style={{ height: 12, width: 12 }} />
                  Marketplace ({getTabCount('marketplace')})
                </TabsTrigger>
                <TabsTrigger value="news">
                  <Newspaper style={{ height: 12, width: 12 }} />
                  News ({getTabCount('news')})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                <div className={gridClass}>{getAllFavorites().map(renderFavoriteCard)}</div>
              </TabsContent>

              {Object.entries(favorites).map(([type, items]) => (
                <TabsContent key={type} value={type}>
                  {type === 'marketplace' && items.length > 0 && (
                    <div className="mb-4 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const ids = items.map((i) => i.id).join(',');
                          const params = new URLSearchParams({ ids, title: 'My favorites' });
                          const url = `${window.location.origin}/marketplace/share?${params.toString()}`;
                          try {
                            if (navigator.share) {
                              await navigator.share({ title: 'My marketplace favorites', url });
                            } else {
                              await navigator.clipboard.writeText(url);
                              toast({ title: 'Link copied', description: 'Share link copied to clipboard.' });
                            }
                          } catch {
                            /* user cancelled */
                          }
                        }}
                      >
                        <LinkIcon style={{ width: 14, height: 14, marginRight: 6 }} aria-hidden="true" />
                        Share list
                      </Button>
                    </div>
                  )}
                  <div className={gridClass}>{items.map(renderFavoriteCard)}</div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </div>
    </AuthGate>
  );
}
