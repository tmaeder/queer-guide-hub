import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useContent } from "@/hooks/useContent";
import { useVenues } from "@/hooks/useVenues";
import { useEvents } from "@/hooks/useEvents";
import { useMarketplace } from "@/hooks/useMarketplace";
import { useCentralizedTags } from "@/hooks/useCentralizedTags";
import { useNews } from "@/hooks/useNews";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, 
  Search, 
  Filter,
  FileText,
  Building,
  Calendar,
  ShoppingBag,
  Tags,
  MapPin,
  Newspaper,
  Globe,
  BookOpen,
  Info,
  Mail,
  HelpCircle,
  Heart,
  Edit2,
  Trash2,
  Eye,
  Star,
  Settings,
  BarChart3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ContentCard } from "@/components/content/ContentCard";
import { VenueCard } from "@/components/venues/VenueCard";
import { EventCard } from "@/components/events/EventCard";
import { MarketplaceCard } from "@/components/marketplace/MarketplaceCard";
import { TagCard } from "@/components/directory/TagCard";
import { NewsCard } from "@/components/news/NewsCard";

export default function UnifiedCMS() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { toast } = useToast();
  
  // Data hooks
  const { content, loading: contentLoading } = useContent();
  const { venues, loading: venuesLoading } = useVenues();
  const { events, loading: eventsLoading } = useEvents();
  const { listings, loading: marketplaceLoading } = useMarketplace();
  const { allTags, loading: tagsLoading } = useCentralizedTags();
  const { articles, loading: newsLoading } = useNews();

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!rolesLoading && !canManageContent()) {
      navigate("/");
      return;
    }
  }, [user, rolesLoading, canManageContent]);

  // Filter functions
  const filterBySearch = (items: any[], searchFields: string[]) => {
    if (!searchQuery) return items;
    return items.filter(item => 
      searchFields.some(field => 
        item[field]?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  };

  const filterByStatus = (items: any[]) => {
    if (selectedStatus === "all") return items;
    return items.filter(item => item.status === selectedStatus);
  };

  // Filtered data
  const filteredContent = filterByStatus(filterBySearch(content, ['title', 'content', 'excerpt']));
  const filteredVenues = filterBySearch(venues, ['name', 'description', 'city']);
  const filteredEvents = filterBySearch(events, ['title', 'description', 'city']);
  const filteredListings = filterBySearch(listings, ['title', 'business_name', 'description']);
  const filteredTags = filterBySearch(allTags, ['name', 'description']);
  const filteredNews = filterBySearch(articles, ['title', 'content', 'excerpt']);

  // Stats
  const totalStats = {
    content: content.length,
    venues: venues.length,
    events: events.length,
    marketplace: listings.length,
    tags: allTags.length,
    news: articles.length
  };

  const loading = contentLoading || venuesLoading || eventsLoading || marketplaceLoading || tagsLoading || newsLoading || rolesLoading;

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading Unified CMS...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!canManageContent()) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to access the CMS.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderContentGrid = (items: any[], renderCard: (item: any) => React.ReactNode) => (
    <div className={
      viewMode === "grid" 
        ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" 
        : "space-y-4"
    }>
      {items.map(renderCard)}
    </div>
  );

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Unified Content Management System
          </h1>
          <p className="text-muted-foreground mt-2">Manage all your content, venues, events, and more in one place</p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <Settings className="h-4 w-4 mr-2" />
            Admin Dashboard
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        <Card className="hover-scale">
          <CardContent className="p-4 text-center">
            <FileText className="h-6 w-6 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{totalStats.content}</div>
            <div className="text-xs text-muted-foreground">Content</div>
          </CardContent>
        </Card>
        <Card className="hover-scale">
          <CardContent className="p-4 text-center">
            <Building className="h-6 w-6 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{totalStats.venues}</div>
            <div className="text-xs text-muted-foreground">Venues</div>
          </CardContent>
        </Card>
        <Card className="hover-scale">
          <CardContent className="p-4 text-center">
            <Calendar className="h-6 w-6 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{totalStats.events}</div>
            <div className="text-xs text-muted-foreground">Events</div>
          </CardContent>
        </Card>
        <Card className="hover-scale">
          <CardContent className="p-4 text-center">
            <ShoppingBag className="h-6 w-6 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{totalStats.marketplace}</div>
            <div className="text-xs text-muted-foreground">Marketplace</div>
          </CardContent>
        </Card>
        <Card className="hover-scale">
          <CardContent className="p-4 text-center">
            <Tags className="h-6 w-6 text-pink-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{totalStats.tags}</div>
            <div className="text-xs text-muted-foreground">Tags</div>
          </CardContent>
        </Card>
        <Card className="hover-scale">
          <CardContent className="p-4 text-center">
            <Newspaper className="h-6 w-6 text-red-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{totalStats.news}</div>
            <div className="text-xs text-muted-foreground">News</div>
          </CardContent>
        </Card>
      </div>

      {/* Global Filters */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search across all content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                Grid
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                List
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="venues" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Venues
          </TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Events
          </TabsTrigger>
          <TabsTrigger value="marketplace" className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Marketplace
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-2">
            <Tags className="h-4 w-4" />
            Tags
          </TabsTrigger>
          <TabsTrigger value="news" className="flex items-center gap-2">
            <Newspaper className="h-4 w-4" />
            News
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">5 new content pieces this week</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-orange-600" />
                    <span className="text-sm">3 upcoming events</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ShoppingBag className="h-4 w-4 text-purple-600" />
                    <span className="text-sm">2 new marketplace listings</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={() => navigate("/admin/content/new")} className="justify-start">
                    <Plus className="h-4 w-4 mr-2" />
                    New Page
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/admin/venues")} className="justify-start">
                    <Building className="h-4 w-4 mr-2" />
                    Add Venue
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/admin/events")} className="justify-start">
                    <Calendar className="h-4 w-4 mr-2" />
                    Create Event
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/admin/marketplace")} className="justify-start">
                    <ShoppingBag className="h-4 w-4 mr-2" />
                    New Listing
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Content ({filteredContent.length})</h2>
            <Button onClick={() => navigate("/admin/content/new")} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Content
            </Button>
          </div>
          {renderContentGrid(filteredContent, (item) => (
            <ContentCard
              key={item.id}
              content={item}
              onDelete={() => {}}
              onEdit={(id) => navigate(`/admin/content/${id}`)}
              compact={viewMode === "list"}
            />
          ))}
        </TabsContent>

        {/* Venues Tab */}
        <TabsContent value="venues" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Venues ({filteredVenues.length})</h2>
            <Button onClick={() => navigate("/admin/venues")} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Venue
            </Button>
          </div>
          {renderContentGrid(filteredVenues, (venue) => (
            <VenueCard key={venue.id} venue={venue} />
          ))}
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Events ({filteredEvents.length})</h2>
            <Button onClick={() => navigate("/admin/events")} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Event
            </Button>
          </div>
          {renderContentGrid(filteredEvents, (event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </TabsContent>

        {/* Marketplace Tab */}
        <TabsContent value="marketplace" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Marketplace ({filteredListings.length})</h2>
            <Button onClick={() => navigate("/admin/marketplace")} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Listing
            </Button>
          </div>
          {renderContentGrid(filteredListings, (listing) => (
            <MarketplaceCard key={listing.id} listing={listing} />
          ))}
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Tags ({filteredTags.length})</h2>
            <Button onClick={() => navigate("/admin/tags")} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Tag
            </Button>
          </div>
          {renderContentGrid(filteredTags, (tag) => (
            <TagCard key={tag.id} tag={tag} />
          ))}
        </TabsContent>

        {/* News Tab */}
        <TabsContent value="news" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">News Articles ({filteredNews.length})</h2>
            <Button onClick={() => navigate("/news")} className="gap-2">
              <Eye className="h-4 w-4" />
              View News
            </Button>
          </div>
          {renderContentGrid(filteredNews, (article) => (
            <NewsCard key={article.id} article={article} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}