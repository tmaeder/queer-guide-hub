import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useContent } from "@/hooks/useContent";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useCentralizedTags } from "@/hooks/useCentralizedTags";
import { useDirectory } from "@/hooks/useDirectory";
import { useVenues } from "@/hooks/useVenues";
import { useEvents } from "@/hooks/useEvents";
import { useMarketplace } from "@/hooks/useMarketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Plus, 
  Search, 
  Edit, 
  Eye, 
  Trash2, 
  Calendar,
  User,
  FileText,
  Archive,
  BarChart3,
  Tag,
  MapPin,
  Building,
  ShoppingBag,
  Globe,
  Flag
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function AdminContent() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { 
    content, 
    categories, 
    tags, 
    loading, 
    fetchContent, 
    deleteContent 
  } = useContent();
  
  // Hooks for other content types
  const { allTags: centralizedTags, loading: tagsLoading, createTag, updateTag, deleteTag } = useCentralizedTags();
  const { cities, countries, continents, loading: dirLoading } = useDirectory();
  const { venues, loading: venuesLoading, createVenue } = useVenues();
  const { events, loading: eventsLoading, createEvent } = useEvents();
  const { listings, loading: marketplaceLoading, createListing } = useMarketplace();
  const { toast } = useToast();

  // Content state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  
  // Dialog states
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [isCityDialogOpen, setIsCityDialogOpen] = useState(false);
  const [isVenueDialogOpen, setIsVenueDialogOpen] = useState(false);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [isListingDialogOpen, setIsListingDialogOpen] = useState(false);
  
  // Form states
  const [tagFormData, setTagFormData] = useState({
    name: "", category: "", description: "", color: "#6366f1"
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!rolesLoading && !canManageContent()) {
      navigate("/");
      return;
    }

    // Fetch all content including drafts for admin view
    fetchContent({ status: undefined });
  }, [user, rolesLoading, canManageContent]);

  const filteredContent = content.filter(item => {
    const matchesSearch = 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = selectedType === "all" || item.content_type === selectedType;
    const matchesStatus = selectedStatus === "all" || item.status === selectedStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this content?")) {
      try {
        await deleteContent(id);
      } catch (error) {
        console.error("Failed to delete content:", error);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published": return "bg-green-100 text-green-800";
      case "draft": return "bg-yellow-100 text-yellow-800";
      case "archived": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "blog_post": return "bg-blue-100 text-blue-800";
      case "page": return "bg-purple-100 text-purple-800";
      case "legal_document": return "bg-red-100 text-red-800";
      case "press_release": return "bg-green-100 text-green-800";
      case "about_content": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const stats = {
    total: content.length,
    published: content.filter(c => c.status === "published").length,
    drafts: content.filter(c => c.status === "draft").length,
    blog_posts: content.filter(c => c.content_type === "blog_post").length
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading content...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-3xl font-bold">Content Management System</h1>
        <p className="text-muted-foreground">Manage all your website content, tags, locations, venues, events, and marketplace</p>
      </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="content" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="content" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tags
          </TabsTrigger>
          <TabsTrigger value="locations" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Locations
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
        </TabsList>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-sm text-muted-foreground">Total Content</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">{stats.published}</p>
                    <p className="text-sm text-muted-foreground">Published</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Edit className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="text-2xl font-bold">{stats.drafts}</p>
                    <p className="text-sm text-muted-foreground">Drafts</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">{stats.blog_posts}</p>
                    <p className="text-sm text-muted-foreground">Blog Posts</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search content..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                >
                  <option value="all">All Types</option>
                  <option value="blog_post">Blog Posts</option>
                  <option value="page">Pages</option>
                  <option value="legal_document">Legal Documents</option>
                  <option value="press_release">Press Releases</option>
                  <option value="about_content">About Content</option>
                </select>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                >
                  <option value="all">All Status</option>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Content List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Content Items ({filteredContent.length})</CardTitle>
                <Button onClick={() => navigate("/admin/content/new")} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Content
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredContent.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold">{item.title}</h3>
                        <Badge className={getStatusColor(item.status)}>
                          {item.status}
                        </Badge>
                        <Badge className={getTypeColor(item.content_type)}>
                          {item.content_type.replace("_", " ")}
                        </Badge>
                      </div>
                      
                      {item.excerpt && (
                        <p className="text-sm text-muted-foreground mb-2">{item.excerpt}</p>
                      )}
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {item.published_at 
                            ? format(new Date(item.published_at), "MMM d, yyyy")
                            : format(new Date(item.created_at), "MMM d, yyyy")
                          }
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {item.author?.display_name || "Unknown"}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/admin/content/${item.id}`)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {item.status === "published" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const url = item.content_type === "blog_post" 
                              ? `/blog/${item.slug}` 
                              : `/${item.slug}`;
                            window.open(url, "_blank");
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {filteredContent.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No content found</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Tags Management</h2>
              <p className="text-muted-foreground">Create and manage content tags</p>
            </div>
            <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Tag
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Tag</DialogTitle>
                </DialogHeader>
                <form className="space-y-4">
                  <div>
                    <Label htmlFor="tag-name">Tag Name</Label>
                    <Input
                      id="tag-name"
                      value={tagFormData.name}
                      onChange={(e) => setTagFormData(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="tag-category">Category</Label>
                    <Select
                      value={tagFormData.category}
                      onValueChange={(value) => setTagFormData(prev => ({ ...prev, category: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="venue">Venue</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="marketplace">Marketplace</SelectItem>
                        <SelectItem value="content">Content</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="tag-description">Description</Label>
                    <Textarea
                      id="tag-description"
                      value={tagFormData.description}
                      onChange={(e) => setTagFormData(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="tag-color">Color</Label>
                    <Input
                      id="tag-color"
                      type="color"
                      value={tagFormData.color}
                      onChange={(e) => setTagFormData(prev => ({ ...prev, color: e.target.value }))}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Create Tag
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tags ({centralizedTags.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {centralizedTags.map((tag) => (
                  <div key={tag.id} className="border rounded-lg p-4 hover:bg-muted/50">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <h3 className="font-semibold">{tag.name}</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Badge variant="outline" className="mb-2">
                      {tag.category}
                    </Badge>
                    {tag.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {tag.description}
                      </p>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Used {tag.usage_count} times
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="space-y-6">
          {/* Locations Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{continents.length}</p>
                    <p className="text-sm text-muted-foreground">Continents</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Flag className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">{countries.length}</p>
                    <p className="text-sm text-muted-foreground">Countries</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">{cities.length}</p>
                    <p className="text-sm text-muted-foreground">Cities</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Add New City */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Manage Cities</h3>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add City
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New City</DialogTitle>
                </DialogHeader>
                <form className="space-y-4">
                  <div>
                    <Label htmlFor="city-name">City Name</Label>
                    <Input
                      id="city-name"
                      placeholder="Enter city name..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="city-country">Country</Label>
                    <select className="w-full px-3 py-2 border rounded-md">
                      <option value="">Select Country</option>
                      {countries.map((country) => (
                        <option key={country.id} value={country.id}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="city-population">Population</Label>
                      <Input
                        id="city-population"
                        type="number"
                        placeholder="Enter population..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="city-timezone">Timezone</Label>
                      <Input
                        id="city-timezone"
                        placeholder="e.g. America/New_York"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="city-lat">Latitude</Label>
                      <Input
                        id="city-lat"
                        type="number"
                        step="any"
                        placeholder="Enter latitude..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="city-lng">Longitude</Label>
                      <Input
                        id="city-lng"
                        type="number"
                        step="any"
                        placeholder="Enter longitude..."
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" />
                      <span className="text-sm">Is Capital</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" />
                      <span className="text-sm">Is Major City</span>
                    </label>
                  </div>
                  <Button type="submit" className="w-full">
                    Add City
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Cities Grid */}
          <Card>
            <CardHeader>
              <CardTitle>Cities ({cities.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cities.map((city) => (
                  <div key={city.id} className="border rounded-lg p-4 hover:bg-muted/50">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{city.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {city.countries?.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {city.population && (
                        <div>Population: {city.population.toLocaleString()}</div>
                      )}
                      {city.timezone && (
                        <div>Timezone: {city.timezone}</div>
                      )}
                      {(city.is_capital || city.is_major_city) && (
                        <div className="flex gap-1">
                          {city.is_capital && (
                            <Badge variant="outline" className="text-xs">Capital</Badge>
                          )}
                          {city.is_major_city && (
                            <Badge variant="outline" className="text-xs">Major City</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="venues" className="space-y-6">
          {/* Add New Venue */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Manage Venues</h3>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Venue
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Venue</DialogTitle>
                </DialogHeader>
                <form className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="venue-name">Venue Name</Label>
                      <Input id="venue-name" placeholder="Enter venue name..." />
                    </div>
                    <div>
                      <Label htmlFor="venue-category">Category</Label>
                      <Input id="venue-category" placeholder="e.g. Restaurant, Hotel..." />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="venue-description">Description</Label>
                    <Textarea id="venue-description" placeholder="Enter venue description..." />
                  </div>
                  <div>
                    <Label htmlFor="venue-address">Address</Label>
                    <Input id="venue-address" placeholder="Enter full address..." />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="venue-city">City</Label>
                      <Input id="venue-city" placeholder="Enter city..." />
                    </div>
                    <div>
                      <Label htmlFor="venue-state">State</Label>
                      <Input id="venue-state" placeholder="Enter state..." />
                    </div>
                    <div>
                      <Label htmlFor="venue-country">Country</Label>
                      <Input id="venue-country" placeholder="Enter country..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="venue-phone">Phone</Label>
                      <Input id="venue-phone" placeholder="Enter phone number..." />
                    </div>
                    <div>
                      <Label htmlFor="venue-website">Website</Label>
                      <Input id="venue-website" placeholder="Enter website URL..." />
                    </div>
                  </div>
                  <Button type="submit" className="w-full">
                    Add Venue
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Venues ({venues.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {venues.map((venue) => (
                  <div key={venue.id} className="border rounded-lg p-4 hover:bg-muted/50">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{venue.name}</h3>
                        <p className="text-sm text-muted-foreground">{venue.category}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div>{venue.city}, {venue.country}</div>
                      {venue.phone && <div>📞 {venue.phone}</div>}
                      {venue.website && <div>🌐 {venue.website}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-6">
          {/* Add New Event */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Manage Events</h3>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Event
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Event</DialogTitle>
                </DialogHeader>
                <form className="space-y-4">
                  <div>
                    <Label htmlFor="event-title">Event Title</Label>
                    <Input id="event-title" placeholder="Enter event title..." />
                  </div>
                  <div>
                    <Label htmlFor="event-description">Description</Label>
                    <Textarea id="event-description" placeholder="Enter event description..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="event-type">Event Type</Label>
                      <Input id="event-type" placeholder="e.g. Concert, Workshop..." />
                    </div>
                    <div>
                      <Label htmlFor="event-venue">Venue</Label>
                      <Input id="event-venue" placeholder="Enter venue name..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="event-start">Start Date & Time</Label>
                      <Input id="event-start" type="datetime-local" />
                    </div>
                    <div>
                      <Label htmlFor="event-end">End Date & Time</Label>
                      <Input id="event-end" type="datetime-local" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="event-city">City</Label>
                      <Input id="event-city" placeholder="Enter city..." />
                    </div>
                    <div>
                      <Label htmlFor="event-state">State</Label>
                      <Input id="event-state" placeholder="Enter state..." />
                    </div>
                    <div>
                      <Label htmlFor="event-country">Country</Label>
                      <Input id="event-country" placeholder="Enter country..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="event-price-min">Min Price</Label>
                      <Input id="event-price-min" type="number" placeholder="0" />
                    </div>
                    <div>
                      <Label htmlFor="event-price-max">Max Price</Label>
                      <Input id="event-price-max" type="number" placeholder="100" />
                    </div>
                  </div>
                  <Button type="submit" className="w-full">
                    Add Event
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Events ({events.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {events.map((event) => (
                  <div key={event.id} className="border rounded-lg p-4 hover:bg-muted/50">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{event.title}</h3>
                        <p className="text-sm text-muted-foreground">{event.event_type}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div>📍 {event.city}, {event.country}</div>
                      <div>📅 {format(new Date(event.start_date), "MMM d, yyyy")}</div>
                      {event.venue_name && <div>🏢 {event.venue_name}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketplace" className="space-y-6">
          {/* Add New Listing */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Manage Marketplace</h3>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Listing
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Marketplace Listing</DialogTitle>
                </DialogHeader>
                <form className="space-y-4">
                  <div>
                    <Label htmlFor="listing-title">Listing Title</Label>
                    <Input id="listing-title" placeholder="Enter listing title..." />
                  </div>
                  <div>
                    <Label htmlFor="listing-business">Business Name</Label>
                    <Input id="listing-business" placeholder="Enter business name..." />
                  </div>
                  <div>
                    <Label htmlFor="listing-description">Description</Label>
                    <Textarea id="listing-description" placeholder="Enter listing description..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="listing-category">Category</Label>
                      <Input id="listing-category" placeholder="e.g. Food, Services..." />
                    </div>
                    <div>
                      <Label htmlFor="listing-subcategory">Subcategory</Label>
                      <Input id="listing-subcategory" placeholder="Enter subcategory..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="listing-price">Price</Label>
                      <Input id="listing-price" type="number" placeholder="0.00" />
                    </div>
                    <div>
                      <Label htmlFor="listing-currency">Currency</Label>
                      <Input id="listing-currency" placeholder="USD" />
                    </div>
                    <div>
                      <Label htmlFor="listing-price-type">Price Type</Label>
                      <select className="w-full px-3 py-2 border rounded-md">
                        <option value="fixed">Fixed</option>
                        <option value="negotiable">Negotiable</option>
                        <option value="hourly">Hourly</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="listing-email">Contact Email</Label>
                      <Input id="listing-email" type="email" placeholder="contact@business.com" />
                    </div>
                    <div>
                      <Label htmlFor="listing-phone">Contact Phone</Label>
                      <Input id="listing-phone" placeholder="Enter phone number..." />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="listing-location">Location</Label>
                    <Input id="listing-location" placeholder="Enter location..." />
                  </div>
                  <Button type="submit" className="w-full">
                    Add Listing
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Marketplace Listings ({listings.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {listings.map((listing) => (
                  <div key={listing.id} className="border rounded-lg p-4 hover:bg-muted/50">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{listing.title}</h3>
                        <p className="text-sm text-muted-foreground">{listing.business_name}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div>📂 {listing.category}</div>
                      {listing.price && (
                        <div>💰 {listing.currency || 'USD'} {listing.price}</div>
                      )}
                      {listing.location && <div>📍 {listing.location}</div>}
                      <div>👁️ {listing.views_count || 0} views</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}