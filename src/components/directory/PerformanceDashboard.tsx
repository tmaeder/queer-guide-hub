import React, { useState } from "react";
import { useOptimizedDirectory } from "@/hooks/useOptimizedDirectory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Globe,
  MapPin,
  Building2,
  Users,
  Calendar,
  Heart,
  Search,
  TrendingUp,
  Clock,
  RefreshCw
} from "lucide-react";

export const PerformanceDashboard = () => {
  const {
    stats,
    loading,
    error,
    searchVenuesOptimized,
    searchEventsOptimized,
    searchAidRequestsOptimized,
    fetchTrendingContent,
    refreshDirectoryStats
  } = useOptimizedDirectory();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any>({
    venues: [],
    events: [],
    aidRequests: []
  });
  const [trendingContent, setTrendingContent] = useState<any>({
    venues: [],
    events: [],
    posts: []
  });
  const [searchPerformance, setSearchPerformance] = useState<{ [key: string]: number }>({});

  const handleSearch = async (type: 'venues' | 'events' | 'aid') => {
    const startTime = performance.now();
    
    try {
      let results;
      switch (type) {
        case 'venues':
          results = await searchVenuesOptimized(searchQuery);
          setSearchResults(prev => ({ ...prev, venues: results }));
          break;
        case 'events':
          results = await searchEventsOptimized(searchQuery);
          setSearchResults(prev => ({ ...prev, events: results }));
          break;
        case 'aid':
          results = await searchAidRequestsOptimized(searchQuery);
          setSearchResults(prev => ({ ...prev, aidRequests: results }));
          break;
      }
      
      const endTime = performance.now();
      setSearchPerformance(prev => ({
        ...prev,
        [type]: endTime - startTime
      }));
    } catch (err) {
      console.error(`Search failed for ${type}:`, err);
    }
  };

  const handleFetchTrending = async () => {
    const startTime = performance.now();
    const content = await fetchTrendingContent();
    const endTime = performance.now();
    
    setTrendingContent(content);
    setSearchPerformance(prev => ({
      ...prev,
      trending: endTime - startTime
    }));
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-destructive">
            Error: {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Performance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Globe className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats?.continent_count || 0}</p>
                <p className="text-sm text-muted-foreground">Continents</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <MapPin className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{stats?.country_count || 0}</p>
                <p className="text-sm text-muted-foreground">Countries</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{stats?.city_count || 0}</p>
                <p className="text-sm text-muted-foreground">Cities</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{stats?.major_city_count || 0}</p>
                <p className="text-sm text-muted-foreground">Major Cities</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Performance Testing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Performance Testing Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter search query..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={refreshDirectoryStats}
              variant="outline"
              size="icon"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={() => handleSearch('venues')}
              disabled={loading || !searchQuery}
              className="flex items-center gap-2"
            >
              <Building2 className="h-4 w-4" />
              Search Venues
              {searchPerformance.venues && (
                <Badge variant="secondary" className="ml-2">
                  {searchPerformance.venues.toFixed(0)}ms
                </Badge>
              )}
            </Button>

            <Button
              onClick={() => handleSearch('events')}
              disabled={loading || !searchQuery}
              className="flex items-center gap-2"
            >
              <Calendar className="h-4 w-4" />
              Search Events
              {searchPerformance.events && (
                <Badge variant="secondary" className="ml-2">
                  {searchPerformance.events.toFixed(0)}ms
                </Badge>
              )}
            </Button>

            <Button
              onClick={() => handleSearch('aid')}
              disabled={loading || !searchQuery}
              className="flex items-center gap-2"
            >
              <Heart className="h-4 w-4" />
              Search Aid Requests
              {searchPerformance.aid && (
                <Badge variant="secondary" className="ml-2">
                  {searchPerformance.aid.toFixed(0)}ms
                </Badge>
              )}
            </Button>
          </div>

          <Button
            onClick={handleFetchTrending}
            disabled={loading}
            variant="outline"
            className="w-full flex items-center gap-2"
          >
            <TrendingUp className="h-4 w-4" />
            Fetch Trending Content
            {searchPerformance.trending && (
              <Badge variant="secondary" className="ml-2">
                {searchPerformance.trending.toFixed(0)}ms
              </Badge>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Search Results */}
      <Tabs defaultValue="venues" className="space-y-4">
        <TabsList>
          <TabsTrigger value="venues" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Venues ({searchResults.venues.length})
          </TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Events ({searchResults.events.length})
          </TabsTrigger>
          <TabsTrigger value="aid" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Aid Requests ({searchResults.aidRequests.length})
          </TabsTrigger>
          <TabsTrigger value="trending" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Trending
          </TabsTrigger>
        </TabsList>

        <TabsContent value="venues" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {searchResults.venues.map((venue: any) => (
              <Card key={venue.id}>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{venue.name}</h3>
                      {venue.featured && <Badge>Featured</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{venue.category}</p>
                    <p className="text-sm">{venue.city}</p>
                    {venue.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {venue.description}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {searchResults.events.map((event: any) => (
              <Card key={event.id}>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{event.title}</h3>
                      {event.featured && <Badge>Featured</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{event.event_type}</p>
                    <p className="text-sm">{event.city}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(event.start_date).toLocaleDateString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="aid" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {searchResults.aidRequests.map((request: any) => (
              <Card key={request.id}>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{request.title}</h3>
                      <Badge variant={request.urgency === 'high' ? 'destructive' : 'secondary'}>
                        {request.urgency}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{request.request_type}</p>
                    <p className="text-sm">{request.location_text}</p>
                    {request.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {request.description}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="trending" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Trending Venues</h3>
              {trendingContent.venues.map((venue: any) => (
                <Card key={venue.id}>
                  <CardContent className="p-3">
                    <h4 className="font-medium">{venue.name}</h4>
                    <p className="text-sm text-muted-foreground">{venue.category}</p>
                    <p className="text-xs">{venue.city}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Upcoming Events</h3>
              {trendingContent.events.map((event: any) => (
                <Card key={event.id}>
                  <CardContent className="p-3">
                    <h4 className="font-medium">{event.title}</h4>
                    <p className="text-sm text-muted-foreground">{event.event_type}</p>
                    <p className="text-xs">{event.city}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Popular Posts</h3>
              {trendingContent.posts.map((post: any) => (
                <Card key={post.id}>
                  <CardContent className="p-3">
                    <p className="text-sm line-clamp-3">{post.content}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>{post.likes_count} likes</span>
                      <span>{post.comments_count} comments</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Performance Metrics Summary */}
      {Object.keys(searchPerformance).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(searchPerformance).map(([key, time]) => (
                <div key={key} className="text-center">
                  <p className="text-2xl font-bold">{time.toFixed(0)}ms</p>
                  <p className="text-sm text-muted-foreground capitalize">{key} Search</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};