import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Heart, MapPin, Calendar, Star, ShoppingBag, Newspaper, Users, Eye, ExternalLink, Grid, List, Download, Link as LinkIcon, CalendarDays } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { useCalendarFeed } from '@/hooks/useCalendarFeed';

interface FavoriteItem {
  id: string;
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
  const { loading: calendarLoading, copyCalendarFeedUrl, downloadCalendarFile, getCalendarFeedUrl } = useCalendarFeed();
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState<string>('');
  const [favorites, setFavorites] = useState<Record<string, FavoriteItem[]>>({
    venue: [],
    event: [],
    marketplace: [],
    news: []
  });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (user) {
      fetchAllFavorites();
    }
  }, [user]);

  const fetchAllFavorites = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Fetch venue favorites
      const { data: venueFavorites } = await supabase
        .from('venue_favorites')
        .select('venue_id')
        .eq('user_id', user.id);

      const venueIds = venueFavorites?.map(f => f.venue_id) || [];
      const { data: venueData } = venueIds.length > 0 ? await supabase
        .from('venues')
        .select('id, name, description, image_url, location, rating, category')
        .in('id', venueIds) : { data: [] };

      // Fetch event favorites
      const { data: eventFavorites } = await supabase
        .from('event_favorites')
        .select('event_id')
        .eq('user_id', user.id);

      const eventIds = eventFavorites?.map(f => f.event_id) || [];
      const { data: eventData } = eventIds.length > 0 ? await supabase
        .from('events')
        .select('id, title, description, images, city, state, country, start_date, price_min, event_type')
        .in('id', eventIds) : { data: [] };

      // Fetch marketplace favorites
      const { data: marketplaceFavorites } = await supabase
        .from('marketplace_favorites')
        .select('listing_id')
        .eq('user_id', user.id);

      const listingIds = marketplaceFavorites?.map(f => f.listing_id) || [];
      const { data: marketplaceData } = listingIds.length > 0 ? await supabase
        .from('marketplace_listings')
        .select('id, title, description, images, location, price, category, business_name')
        .in('id', listingIds) : { data: [] };

      // Fetch news favorites
      const { data: newsFavorites } = await supabase
        .from('news_favorites')
        .select('article_id')
        .eq('user_id', user.id);

      const articleIds = newsFavorites?.map(f => f.article_id) || [];
      const { data: newsData } = articleIds.length > 0 ? await supabase
        .from('news_articles')
        .select('id, title, excerpt, image_url, category, published_at, views_count')
        .in('id', articleIds) : { data: [] };

      // Transform data
      const transformedFavorites = {
        venue: venueData?.map(venue => ({
          id: venue.id,
          title: venue.name || '',
          description: venue.description,
          image_url: venue.image_url,
          location: venue.location,
          rating: venue.rating,
          category: venue.category,
          type: 'venue' as const
        })) || [],
        
        event: eventData?.map(event => ({
          id: event.id,
          title: event.title || '',
          description: event.description,
          image_url: event.images?.[0],
          location: `${event.city}${event.state ? ', ' + event.state : ''}`,
          date: event.start_date,
          price: event.price_min,
          category: event.event_type,
          type: 'event' as const
        })) || [],
        
        marketplace: marketplaceData?.map(listing => ({
          id: listing.id,
          title: listing.title || '',
          description: listing.description,
          image_url: listing.images?.[0],
          location: listing.location,
          price: listing.price,
          category: listing.category,
          type: 'marketplace' as const
        })) || [],
        
        news: newsData?.map(article => ({
          id: article.id,
          title: article.title || '',
          description: article.excerpt,
          image_url: article.image_url,
          date: article.published_at,
          category: article.category,
          type: 'news' as const
        })) || []
      };

      setFavorites(transformedFavorites);
    } catch (error) {
      console.error('Error fetching favorites:', error);
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
          return `/venues/${item.id}`;
        case 'event':
          return `/events/${item.id}`;
        case 'marketplace':
          return `/marketplace/${item.id}`;
        case 'news':
          return `/news/${item.id}`;
        default:
          return '#';
      }
    };

    const getIcon = () => {
      switch (item.type) {
        case 'venue':
          return <MapPin className="h-4 w-4" />;
        case 'event':
          return <Calendar className="h-4 w-4" />;
        case 'marketplace':
          return <ShoppingBag className="h-4 w-4" />;
        case 'news':
          return <Newspaper className="h-4 w-4" />;
      }
    };

    if (viewMode === 'grid') {
      return (
        <Card key={`${item.type}-${item.id}`} className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
          <div className="relative">
            {item.image_url ? (
              <div className="aspect-video relative overflow-hidden rounded-t-lg">
                <img 
                  src={item.image_url} 
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute top-2 left-2">
                  <Badge variant="secondary" className="text-xs backdrop-blur-sm bg-background/80">
                    {getIcon()}
                    <span className="ml-1 capitalize">{item.type}</span>
                  </Badge>
                </div>
                <div className="absolute top-2 right-2">
                  <FavoriteButton 
                    itemId={item.id} 
                    type={item.type} 
                    variant="ghost"
                    className="bg-background/80 backdrop-blur-sm hover:bg-background"
                  />
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-muted rounded-t-lg flex items-center justify-center relative">
                {getIcon()}
                <div className="absolute top-2 right-2">
                  <FavoriteButton 
                    itemId={item.id} 
                    type={item.type} 
                    variant="ghost"
                  />
                </div>
              </div>
            )}
          </div>
          <CardContent className="p-4">
            <h3 className="font-semibold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
              {item.title}
            </h3>
            {item.description && (
              <p className="text-muted-foreground text-sm line-clamp-2 mb-3">
                {item.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
              {item.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {item.location}
                </div>
              )}
              {item.rating && (
                <div className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {item.rating}
                </div>
              )}
              {item.category && (
                <Badge variant="outline" className="text-xs">
                  {item.category}
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              {item.price ? (
                <div className="font-semibold text-lg text-primary">
                  ${item.price}
                </div>
              ) : (
                <div />
              )}
              <Button asChild variant="outline" size="sm" className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Link to={getItemUrl()}>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  View
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card key={`${item.type}-${item.id}`} className="group hover:shadow-md transition-all duration-200 hover:border-primary/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {item.image_url && (
              <div className="flex-shrink-0">
                <img 
                  src={item.image_url} 
                  alt={item.title}
                  className="w-20 h-20 object-cover rounded-lg group-hover:scale-105 transition-transform duration-200"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getIcon()}
                    <Badge variant="secondary" className="text-xs capitalize">
                      {item.type}
                    </Badge>
                    {item.category && (
                      <Badge variant="outline" className="text-xs">
                        {item.category}
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-semibold text-xl leading-tight mb-2 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="text-muted-foreground text-sm line-clamp-2 mb-3">
                      {item.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    {item.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {item.location}
                      </div>
                    )}
                    {item.date && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(item.date).toLocaleDateString()}
                      </div>
                    )}
                    {item.rating && (
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {item.rating}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <FavoriteButton 
                    itemId={item.id} 
                    type={item.type} 
                    variant="ghost"
                  />
                  {item.price && (
                    <div className="font-semibold text-xl text-primary">
                      ${item.price}
                    </div>
                  )}
                  <Button asChild variant="outline" size="sm" className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Link to={getItemUrl()}>
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View Details
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Heart className="h-16 w-16 text-muted-foreground mb-4" />
          <h1 className="text-3xl font-bold mb-2">Sign In Required</h1>
          <p className="text-muted-foreground mb-6">
            Please sign in to view your favorites
          </p>
          <Button asChild>
            <Link to="/auth">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent flex items-center gap-3">
              <Heart className="h-10 w-10 text-primary fill-current" />
              My Favorites
            </h1>
            <p className="text-muted-foreground text-lg">
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                  Loading your favorites...
                </span>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{getTotalCount()}</span> items in your favorites
                </>
              )}
            </p>
          </div>
          
          {!loading && getTotalCount() > 0 && (
            <div className="flex items-center gap-3">
              {getEventCount() > 0 && (
                <Button
                  variant="outline"
                  onClick={handleCalendarSubscription}
                  disabled={calendarLoading}
                  className="flex items-center gap-2"
                >
                  <CalendarDays className="h-4 w-4" />
                  Subscribe to Events Calendar
                </Button>
              )}
              
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">View:</span>
                <div className="flex items-center border rounded-lg">
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="rounded-r-none"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="rounded-l-none"
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Calendar Subscription Dialog */}
        <Dialog open={calendarDialogOpen} onOpenChange={setCalendarDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Subscribe to Your Events Calendar
              </DialogTitle>
              <DialogDescription>
                Subscribe to your favorite events in any calendar application that supports iCal feeds.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Calendar Subscription URL:</h4>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-background rounded text-sm font-mono break-all">
                    {calendarUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyCalendarFeedUrl}
                    disabled={calendarLoading}
                  >
                    <LinkIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Subscribe in Calendar App</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Copy the URL above and add it as a new calendar subscription in your preferred calendar app.
                    </p>
                    <div className="space-y-2 text-sm">
                      <div><strong>Google Calendar:</strong> Settings → Add calendar → From URL</div>
                      <div><strong>Apple Calendar:</strong> File → New Calendar Subscription</div>
                      <div><strong>Outlook:</strong> Add calendar → Subscribe from web</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyCalendarFeedUrl}
                      disabled={calendarLoading}
                      className="w-full"
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Copy Subscription URL
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Download Calendar File</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Download a one-time .ics file that you can import into any calendar application.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Note: Downloaded files won't automatically update when you add new favorites. Use the subscription URL for automatic updates.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadCalendarFile}
                      disabled={calendarLoading}
                      className="w-full"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download .ics File
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="text-xs text-muted-foreground">
                <p>• Only future events from your favorites will appear in the calendar</p>
                <p>• The calendar updates automatically when you add or remove event favorites</p>
                <p>• Calendar subscriptions are cached for up to 1 hour for better performance</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
            <p className="text-muted-foreground">Loading your favorites...</p>
          </div>
        </div>
      ) : getTotalCount() === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Heart className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-2xl font-semibold mb-2">No favorites yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            Start exploring and save your favorite venues, events, marketplace items, and news articles
          </p>
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <Link to="/venues">Browse Venues</Link>
            </Button>
            <Button asChild>
              <Link to="/events">Browse Events</Link>
            </Button>
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="all" className="flex items-center gap-1">
              All ({getTabCount('all')})
            </TabsTrigger>
            <TabsTrigger value="venue" className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Venues ({getTabCount('venue')})
            </TabsTrigger>
            <TabsTrigger value="event" className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Events ({getTabCount('event')})
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="flex items-center gap-1">
              <ShoppingBag className="h-3 w-3" />
              Marketplace ({getTabCount('marketplace')})
            </TabsTrigger>
            <TabsTrigger value="news" className="flex items-center gap-1">
              <Newspaper className="h-3 w-3" />
              News ({getTabCount('news')})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <div className={viewMode === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' 
              : 'space-y-4'
            }>
              {getAllFavorites().map(renderFavoriteCard)}
            </div>
          </TabsContent>

          {Object.entries(favorites).map(([type, items]) => (
            <TabsContent key={type} value={type}>
              <div className={viewMode === 'grid' 
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' 
                : 'space-y-4'
              }>
                {items.map(renderFavoriteCard)}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}