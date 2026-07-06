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
  Luggage,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchAllUserFavorites } from '@/hooks/usePageFetchers';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { SavedToTripCard } from '@/components/trips/SavedToTripCard';
import { useCalendarFeed } from '@/hooks/useCalendarFeed';
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

/**
 * "Add to trip" affordance for saved venues/events. Bridges Saved → Trips so a
 * saved place can flow into a plan. Marketplace/news aren't trip-addable, so this
 * self-guards and renders nothing for them.
 */
function AddSavedToTripButton({ item }: { item: FavoriteItem }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (item.type !== 'venue' && item.type !== 'event') return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Luggage size={12} className="mr-1" />
        {t('trips.quietAdd.add', 'Add to a trip')}
      </Button>
      {open && (
        <AddToTripDialog
          open={open}
          onClose={() => setOpen(false)}
          entity={{ type: item.type, id: item.id, name: item.title, category: item.category ?? null }}
        />
      )}
    </>
  );
}

/**
 * The user's saved items (venues, events, marketplace, news) across all types.
 * Rendered as the "Saved" tab of the /me hub — own-profile only. Folds in what
 * used to be the standalone /favorites page.
 */
export function SavedTab() {
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
      // eslint-disable-next-line react-hooks/immutability -- fetchAllFavorites is declared below; effect fires after render so binding is initialized.
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
      toast({ title: 'Error', description: 'Failed to load saved items. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getAllFavorites = () => Object.values(favorites).flat();
  const getEventCount = () => favorites.event.length;
  const getTotalCount = () =>
    Object.values(favorites).reduce((total, items) => total + items.length, 0);
  const getTabCount = (type: string) => {
    if (type === 'all') return getTotalCount();
    return favorites[type as keyof typeof favorites]?.length || 0;
  };

  const handleCalendarSubscription = async () => {
    const url = await getCalendarFeedUrl();
    if (url) {
      setCalendarUrl(url);
      setCalendarDialogOpen(true);
    }
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
          return <MapPin size={16} />;
        case 'event':
          return <Calendar size={16} />;
        case 'marketplace':
          return <ShoppingBag size={16} />;
        case 'news':
          return <Newspaper size={16} />;
      }
    };
    if (viewMode === 'grid') {
      return (
        <Card key={`${item.type}-${item.id}`}>
          <div className="relative">
            {item.image_url ? (
              <div className="aspect-video relative overflow-hidden rounded-t-container">
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
              <div className="aspect-video bg-accent rounded-t-container flex items-center justify-center relative">
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
                  <MapPin size={12} />
                  {item.location}
                </div>
              )}
              {item.rating && (
                <div className="flex items-center gap-1">
                  <Star size={12} style={{ fill: 'currentColor' }} />
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
              <div className="flex items-center gap-2">
                <AddSavedToTripButton item={item} />
                <Button asChild variant="outline" size="sm">
                  <LocalizedLink to={getItemUrl()}>
                    <ExternalLink size={12} className="mr-1" />
                    View
                  </LocalizedLink>
                </Button>
              </div>
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
                  className="w-20 h-20 object-cover rounded-element transition-transform duration-200 group-hover:scale-105"
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
                        <MapPin size={12} />
                        {item.location}
                      </div>
                    )}
                    {item.date && (
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(item.date).toLocaleDateString()}
                      </div>
                    )}
                    {item.rating && (
                      <div className="flex items-center gap-1">
                        <Star size={12} style={{ fill: 'currentColor' }} />
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
                      <ExternalLink size={12} className="mr-1" />
                      View Details
                    </LocalizedLink>
                  </Button>
                  <AddSavedToTripButton item={item} />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const gridClass =
    viewMode === 'grid'
      ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
      : 'flex flex-col gap-4';

  return (
    <div className="flex flex-col gap-6 pt-4">
      {/* Saves → trips bridge: turn clusters of saved places into a plan.
          Self-hides until there are ≥2 saves in one city. */}
      {!loading && getTotalCount() > 0 && <SavedToTripCard />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading your saved items…' : `${getTotalCount()} saved items`}
        </p>
        {!loading && getTotalCount() > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/hub/plans')}>
              <CalendarDays size={16} className="mr-1.5" />
              My calendar
            </Button>
            {getEventCount() > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCalendarSubscription}
                disabled={calendarLoading}
              >
                <CalendarDays size={16} className="mr-1.5" />
                Subscribe to Events Calendar
              </Button>
            )}
            <div className="flex items-center rounded-element">
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                aria-label="List view"
              >
                <List size={16} />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
              >
                <Grid size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Calendar Subscription Dialog */}
      <Dialog open={calendarDialogOpen} onOpenChange={setCalendarDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <CalendarDays size={20} />
              Subscribe to Your Events Calendar
            </DialogTitle>
            <DialogDescription>
              Subscribe to your saved events in any calendar application that supports iCal feeds.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="p-4 bg-accent rounded-element">
              <p className="font-medium mb-2">Calendar Subscription URL:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-background rounded-badge text-sm font-mono break-all">
                  {calendarUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyCalendarFeedUrl}
                  disabled={calendarLoading}
                >
                  <LinkIcon size={16} />
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
                    <LinkIcon size={16} className="mr-2" />
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
                    Download a one-time .ics file that you can import into any calendar application.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Note: Downloaded files won't automatically update when you save new events. Use
                    the subscription URL for automatic updates.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadCalendarFile}
                    disabled={calendarLoading}
                  >
                    <Download size={16} className="mr-2" />
                    Download .ics File
                  </Button>
                </CardContent>
              </Card>
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto gap-0 rounded-none border-0 border-b border-border bg-transparent p-0 backdrop-blur-none w-full justify-start overflow-x-auto">
            {(() => {
              const lineTab =
                'h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-foreground data-[state=active]:shadow-none flex items-center gap-2';
              return (
                <>
                  <TabsTrigger value="all" className={lineTab}>
                    All ({getTabCount('all')})
                  </TabsTrigger>
                  <TabsTrigger value="venue" className={lineTab}>
                    <MapPin size={12} />
                    Venues ({getTabCount('venue')})
                  </TabsTrigger>
                  <TabsTrigger value="event" className={lineTab}>
                    <Calendar size={12} />
                    Events ({getTabCount('event')})
                  </TabsTrigger>
                  <TabsTrigger value="marketplace" className={lineTab}>
                    <ShoppingBag size={12} />
                    Marketplace ({getTabCount('marketplace')})
                  </TabsTrigger>
                  <TabsTrigger value="news" className={lineTab}>
                    <Newspaper size={12} />
                    News ({getTabCount('news')})
                  </TabsTrigger>
                </>
              );
            })()}
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
                    <LinkIcon size={14} className="mr-1.5" aria-hidden="true" />
                    Share list
                  </Button>
                </div>
              )}
              <div className={gridClass}>{items.map(renderFavoriteCard)}</div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
