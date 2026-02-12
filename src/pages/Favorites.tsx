import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
  const {
    user
  } = useAuth();
  const {
    loading: calendarLoading,
    copyCalendarFeedUrl,
    downloadCalendarFile,
    getCalendarFeedUrl
  } = useCalendarFeed();
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
      const {
        data: venueFavorites
      } = await supabase.from('venue_favorites').select('venue_id').eq('user_id', user.id);
      const venueIds = venueFavorites?.map(f => f.venue_id) || [];
      const {
        data: venueData
      } = venueIds.length > 0 ? await supabase.from('venues').select('id, name, description, image_url, location, rating, category').in('id', venueIds) : {
        data: []
      };

      // Fetch event favorites
      const {
        data: eventFavorites
      } = await supabase.from('event_favorites').select('event_id').eq('user_id', user.id);
      const eventIds = eventFavorites?.map(f => f.event_id) || [];
      const {
        data: eventData
      } = eventIds.length > 0 ? await supabase.from('events').select('id, title, description, images, city, state, country, start_date, price_min, event_type').in('id', eventIds) : {
        data: []
      };

      // Fetch marketplace favorites
      const {
        data: marketplaceFavorites
      } = await supabase.from('marketplace_favorites').select('listing_id').eq('user_id', user.id);
      const listingIds = marketplaceFavorites?.map(f => f.listing_id) || [];
      const {
        data: marketplaceData
      } = listingIds.length > 0 ? await supabase.from('marketplace_listings').select('id, title, description, images, location, price, category, business_name').in('id', listingIds) : {
        data: []
      };

      // Fetch news favorites
      const {
        data: newsFavorites
      } = await supabase.from('news_favorites').select('article_id').eq('user_id', user.id);
      const articleIds = newsFavorites?.map(f => f.article_id) || [];
      const {
        data: newsData
      } = articleIds.length > 0 ? await supabase.from('news_articles').select('id, title, excerpt, image_url, category, published_at, views_count').in('id', articleIds) : {
        data: []
      };

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
      return <Card key={`${item.type}-${item.id}`} sx={{ '&:hover': { boxShadow: 6, transform: 'translateY(-4px)' }, transition: 'all 200ms' }}>
          <Box sx={{ position: 'relative' }}>
            {item.image_url ? <Box sx={{ aspectRatio: '16/9', position: 'relative', overflow: 'hidden', borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
                <Box component="img" src={item.image_url} alt={item.title} sx={{ width: '100%', height: '100%', objectFit: 'cover', '.group:hover &': { transform: 'scale(1.05)' }, transition: 'transform 200ms' }} />
                <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                  <Badge variant="secondary" sx={{ fontSize: '0.75rem', backdropFilter: 'blur(4px)', bgcolor: 'rgba(var(--background), 0.8)' }}>
                    {getIcon()}
                    <Box component="span" sx={{ ml: 0.5, textTransform: 'capitalize' }}>{item.type}</Box>
                  </Badge>
                </Box>
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <FavoriteButton itemId={item.id} type={item.type} variant="ghost" sx={{ bgcolor: 'rgba(var(--background), 0.8)', backdropFilter: 'blur(4px)', '&:hover': { bgcolor: 'var(--background)' } }} />
                </Box>
              </Box> : <Box sx={{ aspectRatio: '16/9', bgcolor: 'var(--muted)', borderTopLeftRadius: 8, borderTopRightRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {getIcon()}
                <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                  <FavoriteButton itemId={item.id} type={item.type} variant="ghost" />
                </Box>
              </Box>}
          </Box>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.125rem', mb: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', '.group:hover &': { color: 'primary.main' }, transition: 'color 150ms' }}>
              {item.title}
            </Typography>
            {item.description && <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', mb: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {item.description}
              </Typography>}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, fontSize: '0.75rem', color: 'var(--muted-foreground)', mb: 1.5 }}>
              {item.location && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <MapPin style={{ height: 12, width: 12 }} />
                  {item.location}
                </Box>}
              {item.rating && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Star style={{ height: 12, width: 12, fill: '#facc15', color: '#facc15' }} />
                  {item.rating}
                </Box>}
              {item.category && <Badge variant="outline" sx={{ fontSize: '0.75rem' }}>
                  {item.category}
                </Badge>}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {item.price ? <Typography sx={{ fontWeight: 600, fontSize: '1.125rem', color: 'primary.main' }}>
                  ${item.price}
                </Typography> : <Box />}
              <Button asChild variant="outline" size="sm" sx={{ '.group:hover &': { bgcolor: 'primary.main', color: 'primary.contrastText' }, transition: 'color 150ms, background-color 150ms' }}>
                <Link to={getItemUrl()}>
                  <ExternalLink style={{ height: 12, width: 12, marginRight: 4 }} />
                  View
                </Link>
              </Button>
            </Box>
          </CardContent>
        </Card>;
    }
    return <Card key={`${item.type}-${item.id}`} sx={{ '&:hover': { boxShadow: 3, borderColor: 'rgba(var(--primary), 0.5)' }, transition: 'all 200ms' }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            {item.image_url && <Box sx={{ flexShrink: 0 }}>
                <Box component="img" src={item.image_url} alt={item.title} sx={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 2, '.group:hover &': { transform: 'scale(1.05)' }, transition: 'transform 200ms' }} />
              </Box>}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {getIcon()}
                    <Badge variant="secondary" sx={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                      {item.type}
                    </Badge>
                    {item.category && <Badge variant="outline" sx={{ fontSize: '0.75rem' }}>
                        {item.category}
                      </Badge>}
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.25rem', lineHeight: 'tight', mb: 1, '.group:hover &': { color: 'primary.main' }, transition: 'color 150ms' }}>
                    {item.title}
                  </Typography>
                  {item.description && <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', mb: 1.5 }}>
                      {item.description}
                    </Typography>}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                    {item.location && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <MapPin style={{ height: 12, width: 12 }} />
                        {item.location}
                      </Box>}
                    {item.date && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Calendar style={{ height: 12, width: 12 }} />
                        {new Date(item.date).toLocaleDateString()}
                      </Box>}
                    {item.rating && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Star style={{ height: 12, width: 12, fill: '#facc15', color: '#facc15' }} />
                        {item.rating}
                      </Box>}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                  <FavoriteButton itemId={item.id} type={item.type} variant="ghost" />
                  {item.price && <Typography sx={{ fontWeight: 600, fontSize: '1.25rem', color: 'primary.main' }}>
                      ${item.price}
                    </Typography>}
                  <Button asChild variant="outline" size="sm" sx={{ '.group:hover &': { bgcolor: 'primary.main', color: 'primary.contrastText' }, transition: 'color 150ms, background-color 150ms' }}>
                    <Link to={getItemUrl()}>
                      <ExternalLink style={{ height: 12, width: 12, marginRight: 4 }} />
                      View Details
                    </Link>
                  </Button>
                </Box>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>;
  };
  if (!user) {
    return <Box sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6, textAlign: 'center' }}>
          <Heart style={{ height: 64, width: 64, color: 'var(--muted-foreground)', marginBottom: 16 }} />
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>Sign In Required</Typography>
          <Typography sx={{ color: 'var(--muted-foreground)', mb: 3 }}>
            Please sign in to view your favorites
          </Typography>
          <Button asChild>
            <Link to="/auth">Sign In</Link>
          </Button>
        </Box>
      </Box>;
  }
  return <Box sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, lg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, mb: 3 }}>
          <Box>

            <Typography sx={{ color: 'var(--muted-foreground)', fontSize: '1.125rem' }}>
              {loading ? <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ animation: 'spin 1s linear infinite', height: 16, width: 16, border: '2px solid', borderColor: 'primary.main', borderTopColor: 'transparent', borderRadius: '50%' }} />
                  Loading your favorites...
                </Box> : <>
                  <Box component="span" sx={{ fontWeight: 600, color: 'var(--foreground)' }}>{getTotalCount()}</Box> items in your favorites
                </>}
            </Typography>
          </Box>

          {!loading && getTotalCount() > 0 && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {getEventCount() > 0 && <Button variant="outline" onClick={handleCalendarSubscription} disabled={calendarLoading} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CalendarDays style={{ height: 16, width: 16 }} />
                  Subscribe to Events Calendar
                </Button>}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>View:</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2 }}>
                  <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} sx={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
                    <List style={{ height: 16, width: 16 }} />
                  </Button>
                  <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grid')} sx={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
                    <Grid style={{ height: 16, width: 16 }} />
                  </Button>
                </Box>
              </Box>
            </Box>}
        </Box>

        {/* Calendar Subscription Dialog */}
        <Dialog open={calendarDialogOpen} onOpenChange={setCalendarDialogOpen}>
          <DialogContent sx={{ maxWidth: { sm: 672 } }}>
            <DialogHeader>
              <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CalendarDays style={{ height: 20, width: 20 }} />
                Subscribe to Your Events Calendar
              </DialogTitle>
              <DialogDescription>
                Subscribe to your favorite events in any calendar application that supports iCal feeds.
              </DialogDescription>
            </DialogHeader>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ p: 2, bgcolor: 'var(--muted)', borderRadius: 2 }}>
                <Typography sx={{ fontWeight: 500, mb: 1 }}>Calendar Subscription URL:</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box component="code" sx={{ flex: 1, p: 1, bgcolor: 'var(--background)', borderRadius: 1, fontSize: '0.875rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {calendarUrl}
                  </Box>
                  <Button variant="outline" size="sm" onClick={copyCalendarFeedUrl} disabled={calendarLoading}>
                    <LinkIcon style={{ height: 16, width: 16 }} />
                  </Button>
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <Card>
                  <CardHeader sx={{ pb: 1.5 }}>
                    <CardTitle sx={{ fontSize: '1.125rem' }}>Subscribe in Calendar App</CardTitle>
                  </CardHeader>
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                      Copy the URL above and add it as a new calendar subscription in your preferred calendar app.
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: '0.875rem' }}>
                      <Box><strong>Google Calendar:</strong> Settings &rarr; Add calendar &rarr; From URL</Box>
                      <Box><strong>Apple Calendar:</strong> File &rarr; New Calendar Subscription</Box>
                      <Box><strong>Outlook:</strong> Add calendar &rarr; Subscribe from web</Box>
                    </Box>
                    <Button variant="outline" size="sm" onClick={copyCalendarFeedUrl} disabled={calendarLoading} sx={{ width: '100%' }}>
                      <LinkIcon style={{ height: 16, width: 16, marginRight: 8 }} />
                      Copy Subscription URL
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader sx={{ pb: 1.5 }}>
                    <CardTitle sx={{ fontSize: '1.125rem' }}>Download Calendar File</CardTitle>
                  </CardHeader>
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                      Download a one-time .ics file that you can import into any calendar application.
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                      Note: Downloaded files won't automatically update when you add new favorites. Use the subscription URL for automatic updates.
                    </Typography>
                    <Button variant="outline" size="sm" onClick={downloadCalendarFile} disabled={calendarLoading} sx={{ width: '100%' }}>
                      <Download style={{ height: 16, width: 16, marginRight: 8 }} />
                      Download .ics File
                    </Button>
                  </CardContent>
                </Card>
              </Box>

              <Box sx={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                <Typography sx={{ fontSize: 'inherit', color: 'inherit' }}>&bull; Only future events from your favorites will appear in the calendar</Typography>
                <Typography sx={{ fontSize: 'inherit', color: 'inherit' }}>&bull; The calendar updates automatically when you add or remove event favorites</Typography>
                <Typography sx={{ fontSize: 'inherit', color: 'inherit' }}>&bull; Calendar subscriptions are cached for up to 1 hour for better performance</Typography>
              </Box>
            </Box>
          </DialogContent>
        </Dialog>
      </Box>

      {/* Content */}
      {loading ? <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ animation: 'spin 1s linear infinite', height: 32, width: 32, border: '2px solid', borderColor: 'primary.main', borderTopColor: 'transparent', borderRadius: '50%' }} />
            <Typography sx={{ color: 'var(--muted-foreground)' }}>Loading your favorites...</Typography>
          </Box>
        </Box> : getTotalCount() === 0 ? <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6, textAlign: 'center' }}>
          <Heart style={{ height: 64, width: 64, color: 'var(--muted-foreground)', marginBottom: 16 }} />
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>No favorites yet</Typography>
          <Typography sx={{ color: 'var(--muted-foreground)', mb: 3, maxWidth: 448 }}>
            Start exploring and save your favorite venues, events, marketplace items, and news articles
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button asChild variant="outline">
              <Link to="/venues">Browse Venues</Link>
            </Button>
            <Button asChild>
              <Link to="/events">Browse Events</Link>
            </Button>
          </Box>
        </Box> : <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList sx={{ mb: 3 }}>
            <TabsTrigger value="all" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              All ({getTabCount('all')})
            </TabsTrigger>
            <TabsTrigger value="venue" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <MapPin style={{ height: 12, width: 12 }} />
              Venues ({getTabCount('venue')})
            </TabsTrigger>
            <TabsTrigger value="event" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Calendar style={{ height: 12, width: 12 }} />
              Events ({getTabCount('event')})
            </TabsTrigger>
            <TabsTrigger value="marketplace" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <ShoppingBag style={{ height: 12, width: 12 }} />
              Marketplace ({getTabCount('marketplace')})
            </TabsTrigger>
            <TabsTrigger value="news" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Newspaper style={{ height: 12, width: 12 }} />
              News ({getTabCount('news')})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <Box sx={viewMode === 'grid' ? { display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 3 } : { display: 'flex', flexDirection: 'column', gap: 2 }}>
              {getAllFavorites().map(renderFavoriteCard)}
            </Box>
          </TabsContent>

          {Object.entries(favorites).map(([type, items]) => <TabsContent key={type} value={type}>
              <Box sx={viewMode === 'grid' ? { display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 3 } : { display: 'flex', flexDirection: 'column', gap: 2 }}>
                {items.map(renderFavoriteCard)}
              </Box>
            </TabsContent>)}
        </Tabs>}
    </Box>;
}
