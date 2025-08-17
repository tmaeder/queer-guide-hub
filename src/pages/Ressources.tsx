import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useCentralizedTags } from "@/hooks/useCentralizedTags";
import { DirectorySearch } from "@/components/directory/DirectorySearch";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Tag, Users, Calendar, MapPin, ShoppingBag, Heart, Brain, Upload, Search, Grid3X3, List, Filter, TrendingUp, Sparkles, Eye, Clock, BarChart3 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
type ViewMode = "overview" | "category" | "search" | "tag-detail";
type DisplayMode = "grid" | "list";
type SortOption = "alphabetical" | "usage" | "recent" | "popular";
export default function Ressources() {
  const {
    tagName
  } = useParams<{
    tagName: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    allTags,
    tagsByCategory,
    loading,
    error,
    searchTags
  } = useCentralizedTags();
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("grid");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("alphabetical");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [processingImages, setProcessingImages] = useState(false);
  const [categorizingTags, setCategorizingTags] = useState(false);
  const [tagUsageCounts, setTagUsageCounts] = useState<Record<string, number>>({});
  const [professions, setProfessions] = useState<string[]>([]);
  const [selectedProfession, setSelectedProfession] = useState<string>("");

  // Load professions from personalities
  useEffect(() => {
    const loadProfessions = async () => {
      try {
        const {
          data
        } = await supabase.from('personalities').select('profession').not('profession', 'is', null);
        if (data) {
          const uniqueProfessions = [...new Set(data.map(p => p.profession).filter(Boolean))].sort();
          setProfessions(uniqueProfessions);
        }
      } catch (error) {
        console.error('Error loading professions:', error);
      }
    };
    loadProfessions();
  }, []);

  // Handle profession filtering from URL params
  useEffect(() => {
    const profession = searchParams.get('profession');
    if (profession) {
      setSelectedProfession(profession);
      setViewMode("search");
      setSearchQuery(profession);
    }
  }, [searchParams]);

  // Calculate real usage counts for tags
  useEffect(() => {
    const calculateUsageCounts = async () => {
      if (allTags.length === 0) return;
      const usageCounts: Record<string, number> = {};
      try {
        const {
          data: venues
        } = await supabase.from('venues').select('tags').not('tags', 'is', null);
        const {
          data: groups
        } = await supabase.from('community_groups').select('tags').not('tags', 'is', null);
        const {
          data: events
        } = await supabase.from('events').select('target_groups').not('target_groups', 'is', null);
        for (const tag of allTags) {
          let count = 0;
          if (venues) {
            count += venues.filter(venue => venue.tags && venue.tags.includes(tag.name)).length;
          }
          if (groups) {
            count += groups.filter(group => group.tags && group.tags.includes(tag.name)).length;
          }
          if (events) {
            count += events.filter(event => event.target_groups && event.target_groups.includes(tag.name)).length;
          }
          usageCounts[tag.name] = count;
        }
        setTagUsageCounts(usageCounts);
      } catch (error) {
        console.error('Error calculating tag usage:', error);
      }
    };
    calculateUsageCounts();
  }, [allTags]);

  // Handle route parameter for individual tag pages
  useEffect(() => {
    if (tagName && allTags.length > 0) {
      const decodedTagName = decodeURIComponent(tagName);
      const foundTag = allTags.find(tag => tag.name.toLowerCase() === decodedTagName.toLowerCase());
      if (foundTag) {
        setSelectedTag(foundTag);
        setViewMode("tag-detail");
      }
    }
  }, [tagName, allTags]);

  // Memoized filtered and sorted tags
  const filteredAndSortedTags = useMemo(() => {
    // Ensure all dependencies are initialized
    if (!allTags || !Array.isArray(allTags)) return [];
    if (!Array.isArray(searchResults)) return [];
    if (!tagUsageCounts || typeof tagUsageCounts !== 'object') return [];
    
    let filtered = viewMode === "search" ? searchResults : allTags;

    // Filter by category
    if (filterCategory !== "all") {
      filtered = filtered.filter(tag => tag.category === filterCategory);
    }

    // Sort tags
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "usage":
          return (tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0);
        case "popular":
          return (tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0);
        case "recent":
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case "alphabetical":
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [allTags, searchResults, filterCategory, sortBy, tagUsageCounts, viewMode]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = [...new Set(allTags.map(tag => tag.category).filter(Boolean))];
    return cats.sort();
  }, [allTags]);
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      const results = await searchTags(query);
      setSearchResults(results);
      setViewMode("search");
    } else {
      setViewMode("overview");
      setSearchResults([]);
    }
  };
  const handleTagClick = (tag: any) => {
    setSelectedTag(tag);
    setViewMode("tag-detail");
    navigate(`/ressources/${encodeURIComponent(tag.name)}`);
  };
  const handleBack = () => {
    if (viewMode === "tag-detail") {
      setViewMode(selectedCategory ? "category" : "overview");
      navigate('/ressources');
    } else if (viewMode === "category") {
      setViewMode("overview");
    } else if (viewMode === "search") {
      setViewMode("overview");
      setSearchQuery("");
      setSearchResults([]);
    }
  };
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "events":
        return Calendar;
      case "venues":
        return MapPin;
      case "marketplace":
        return ShoppingBag;
      case "community":
        return Users;
      case "gender-identity":
        return Heart;
      case "health":
        return Brain;
      case "sexuality":
        return Heart;
      case "relationships":
        return Users;
      case "activism":
        return Tag;
      case "support":
        return Users;
      case "lifestyle":
        return Tag;
      case "dating":
        return Heart;
      case "family":
        return Users;
      case "workplace":
        return Tag;
      case "legal":
        return Tag;
      case "education":
        return Tag;
      case "arts":
        return Tag;
      case "sports":
        return Tag;
      case "technology":
        return Tag;
      case "travel":
        return MapPin;
      case "fashion":
        return Tag;
      case "content":
        return Tag;
      default:
        return Tag;
    }
  };
  const storeTagImages = async () => {
    if (allTags.length === 0) return;
    setProcessingImages(true);
    toast({
      title: "Processing Started",
      description: `Processing images for ${allTags.length} tags. This may take a while...`
    });
    try {
      let successCount = 0;
      let errorCount = 0;
      for (let i = 0; i < allTags.length; i++) {
        const tag = allTags[i];
        try {
          const {
            data,
            error
          } = await supabase.functions.invoke('store-tag-images', {
            body: {
              tagId: tag.id,
              tagName: tag.name
            }
          });
          if (error) {
            errorCount++;
          } else if (data?.success) {
            successCount++;
          } else {
            errorCount++;
          }
          if ((i + 1) % 10 === 0 || i === allTags.length - 1) {
            toast({
              title: "Processing Progress",
              description: `Processed ${i + 1}/${allTags.length} tags (${successCount} successful)`
            });
          }
        } catch (err) {
          errorCount++;
        }
      }
      toast({
        title: "Processing Complete",
        description: `Processed ${allTags.length} tags. ${successCount} successful, ${errorCount} failed.`,
        variant: errorCount > 0 ? "destructive" : "default"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Error processing tag images",
        variant: "destructive"
      });
    } finally {
      setProcessingImages(false);
    }
  };
  const categorizeAllTags = async () => {
    setCategorizingTags(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('categorize-tags');
      if (error) {
        toast({
          title: "Categorization failed",
          description: `Failed to categorize tags: ${error.message}`,
          variant: "destructive"
        });
      } else if (data?.success) {
        toast({
          title: "Tags categorized",
          description: `Successfully categorized ${data.categorized_count} tags! Refreshing...`
        });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        toast({
          title: "Unexpected response",
          description: "Received unexpected response from categorization service",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to categorize tags",
        variant: "destructive"
      });
    } finally {
      setCategorizingTags(false);
    }
  };
  if (loading) {
    return <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({
          length: 12
        }).map((_, i) => <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-[4/3] w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </Card>)}
        </div>
      </div>;
  }
  if (error) {
    return <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardContent className="p-6 text-center">
            <p className="text-destructive">Error loading ressources: {error}</p>
          </CardContent>
        </Card>
      </div>;
  }

  // Render Tag Detail View
  if (viewMode === "tag-detail" && selectedTag) {
    return <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full shrink-0" style={{
            backgroundColor: selectedTag.color
          }} />
            <h1 className="text-3xl font-bold">#{selectedTag.name}</h1>
            <Badge variant="secondary">
              {tagUsageCounts[selectedTag.name] || 0} uses
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {selectedTag.image_url && <Card className="overflow-hidden">
                <div className="aspect-video">
                  <img src={selectedTag.image_url} alt={`${selectedTag.name} themed image`} className="w-full h-full object-cover" />
                </div>
              </Card>}
            
            {selectedTag.description && <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Description
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{selectedTag.description}</p>
                </CardContent>
              </Card>}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Usage Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Total Usage</span>
                  <Badge variant="outline">{tagUsageCounts[selectedTag.name] || 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Category</span>
                  <Badge variant="secondary">{selectedTag.category || 'Uncategorized'}</Badge>
                </div>
                {selectedTag.created_at && <div className="flex items-center justify-between">
                    <span className="text-sm">Created</span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(selectedTag.created_at).toLocaleDateString()}
                    </span>
                  </div>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>;
  }
  return <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {viewMode !== "overview" && <Button variant="outline" onClick={handleBack} className="shrink-0">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>}
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              Ressources
            </h1>
            <p className="text-muted-foreground">
              Discover and explore LGBTQ+ community tags, resources, and professions
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          
        </div>
      </div>

      {/* Tabs for different resource types */}
      <Tabs defaultValue="tags" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tags">Tags & Categories</TabsTrigger>
          <TabsTrigger value="professions">Professions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="tags" className="space-y-4">
          {/* Search and Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search tags, categories, descriptions..." value={searchQuery} onChange={e => handleSearch(e.target.value)} className="pl-10" />
                </div>
                <div className="flex gap-2">
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-10 h-10 p-0 justify-center">
                      <Filter className="h-4 w-4" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(category => <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                  
                  <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
                    <SelectTrigger className="w-10 h-10 p-0 justify-center">
                      <TrendingUp className="h-4 w-4" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alphabetical">Alphabetical</SelectItem>
                      <SelectItem value="usage">Most Used</SelectItem>
                      <SelectItem value="popular">Popular</SelectItem>
                      <SelectItem value="recent">Recent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="professions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>LGBTQ+ Personalities by Profession</CardTitle>
              <p className="text-muted-foreground">
                Explore different professions represented by LGBTQ+ personalities in our directory
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {professions.map(profession => <Button key={profession} variant={selectedProfession === profession ? "default" : "outline"} className="h-auto p-3 text-left justify-start" onClick={() => {
                if (selectedProfession === profession) {
                  setSelectedProfession("");
                  navigate('/personalities');
                } else {
                  setSelectedProfession(profession);
                  navigate(`/personalities?profession=${encodeURIComponent(profession)}`);
                }
              }}>
                    <div className="truncate">{profession}</div>
                  </Button>)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Stats Overview */}
      

      {/* Admin Controls */}
      {viewMode === "overview" && <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Admin Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button onClick={storeTagImages} disabled={processingImages} variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                {processingImages ? 'Processing...' : 'Reimport All Images'}
              </Button>
              <Button onClick={categorizeAllTags} disabled={categorizingTags} variant="outline" size="sm">
                <Brain className="h-4 w-4 mr-2" />
                {categorizingTags ? 'Categorizing...' : 'AI Auto-Categorize'}
              </Button>
            </div>
          </CardContent>
        </Card>}

      {/* Results Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">
            {viewMode === "search" ? "Search Results" : "All Tags"}
          </h2>
          <Badge variant="secondary">{filteredAndSortedTags.length} tags</Badge>
        </div>
      </div>

      {/* Tags Display */}
      <div className={displayMode === "grid" ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4" : "space-y-2"}>
        {filteredAndSortedTags.map((tag, index) => <Card key={`${tag.id}-${index}`} className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 ${displayMode === "list" ? "flex items-center p-4" : "overflow-hidden"}`} onClick={() => handleTagClick(tag)}>
            {displayMode === "grid" ? <>
                <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                  {tag.image_url ? <img src={tag.image_url} alt={`${tag.name} themed image`} className="w-full h-full object-cover transition-transform duration-200 hover:scale-110" onError={e => {
              e.currentTarget.src = '/placeholder.svg';
            }} /> : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/80">
                      <Tag className="h-8 w-8 text-muted-foreground" />
                    </div>}
                </div>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{
                backgroundColor: tag.color
              }} />
                    <span className="text-sm font-medium truncate">{tag.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{tag.category || 'Uncategorized'}</span>
                    {tagUsageCounts[tag.name] > 0 && <Badge variant="outline" className="text-xs">
                        {tagUsageCounts[tag.name]} uses
                      </Badge>}
                  </div>
                </CardContent>
              </> : <div className="flex items-center gap-4 w-full">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  {tag.image_url ? <img src={tag.image_url} alt={`${tag.name} themed image`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">
                      <Tag className="h-6 w-6 text-muted-foreground" />
                    </div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{
                backgroundColor: tag.color
              }} />
                    <span className="font-medium truncate">{tag.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {tag.description || tag.category || 'No description'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs">
                    {tag.category || 'Uncategorized'}
                  </Badge>
                  {tagUsageCounts[tag.name] > 0 && <Badge variant="secondary" className="text-xs">
                      {tagUsageCounts[tag.name]} uses
                    </Badge>}
                </div>
              </div>}
          </Card>)}
      </div>

      {filteredAndSortedTags.length === 0 && <Card>
          <CardContent className="p-12 text-center">
            <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No tags found</h3>
            <p className="text-muted-foreground">
              {viewMode === "search" ? "Try adjusting your search terms or filters" : "No tags available yet"}
            </p>
          </CardContent>
        </Card>}
    </div>;
}