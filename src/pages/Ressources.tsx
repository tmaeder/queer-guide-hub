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
import { ArrowLeft, Tag, Users, Calendar, MapPin, ShoppingBag, Heart, Brain, Upload, Search, Grid3X3, List, Filter, TrendingUp, Sparkles, Eye, Clock, BarChart3, Briefcase } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
type ViewMode = "overview" | "category" | "subcategory" | "search" | "tag-detail" | "professions";
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
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");
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

  // Define subcategories for better organization
  const subcategories = useMemo(() => {
    const subCats: Record<string, Record<string, string[]>> = {};
    
    categories.forEach(category => {
      const categoryTags = allTags.filter(tag => tag.category === category);
      subCats[category] = {};
      
      // Create semantic subcategories based on tag names
      categoryTags.forEach(tag => {
        const name = tag.name.toLowerCase();
        let subCategory = 'Other';
        
        // Define subcategory rules based on category
        switch (category) {
          case 'Identity':
            if (name.includes('gay') || name.includes('lesbian') || name.includes('bisexual') || name.includes('heterosexual') || name.includes('pansexual') || name.includes('asexual') || name.includes('demisexual') || name.includes('queer') || name.includes('questioning')) {
              subCategory = 'Sexual Orientation';
            } else if (name.includes('trans') || name.includes('non-binary') || name.includes('gender') || name.includes('agender') || name.includes('genderfluid') || name.includes('bigender')) {
              subCategory = 'Gender Identity';
            } else if (name.includes('pronoun') || name.includes('he/') || name.includes('she/') || name.includes('they/')) {
              subCategory = 'Pronouns';
            } else if (name.includes('relationship') || name.includes('polyamor') || name.includes('monogam') || name.includes('aromantic')) {
              subCategory = 'Relationship Style';
            }
            break;
            
          case 'Health':
            if (name.includes('mental') || name.includes('therapy') || name.includes('depression') || name.includes('anxiety') || name.includes('counseling')) {
              subCategory = 'Mental Health';
            } else if (name.includes('sexual') || name.includes('std') || name.includes('hiv') || name.includes('prep') || name.includes('reproductive')) {
              subCategory = 'Sexual Health';
            } else if (name.includes('hormone') || name.includes('transition') || name.includes('surgery') || name.includes('medical')) {
              subCategory = 'Medical Care';
            }
            break;
            
          case 'Events':
            if (name.includes('pride') || name.includes('parade') || name.includes('march') || name.includes('rally')) {
              subCategory = 'Pride & Activism';
            } else if (name.includes('party') || name.includes('club') || name.includes('dance') || name.includes('music')) {
              subCategory = 'Social & Entertainment';
            } else if (name.includes('workshop') || name.includes('education') || name.includes('seminar') || name.includes('conference')) {
              subCategory = 'Educational';
            } else if (name.includes('support') || name.includes('group') || name.includes('meeting')) {
              subCategory = 'Support Groups';
            }
            break;
            
          case 'Venues':
            if (name.includes('bar') || name.includes('club') || name.includes('pub') || name.includes('nightlife')) {
              subCategory = 'Nightlife';
            } else if (name.includes('restaurant') || name.includes('cafe') || name.includes('food') || name.includes('dining')) {
              subCategory = 'Food & Dining';
            } else if (name.includes('shop') || name.includes('store') || name.includes('retail') || name.includes('market')) {
              subCategory = 'Shopping';
            } else if (name.includes('gym') || name.includes('sport') || name.includes('fitness') || name.includes('recreation')) {
              subCategory = 'Recreation & Sports';
            } else if (name.includes('hotel') || name.includes('accommodation') || name.includes('lodging')) {
              subCategory = 'Accommodation';
            }
            break;
            
          case 'Community':
            if (name.includes('advocacy') || name.includes('activism') || name.includes('rights') || name.includes('political')) {
              subCategory = 'Advocacy & Rights';
            } else if (name.includes('support') || name.includes('help') || name.includes('crisis') || name.includes('counseling')) {
              subCategory = 'Support Services';
            } else if (name.includes('youth') || name.includes('teen') || name.includes('young') || name.includes('student')) {
              subCategory = 'Youth & Students';
            } else if (name.includes('senior') || name.includes('elder') || name.includes('older')) {
              subCategory = 'Seniors';
            }
            break;
            
          default:
            // Group alphabetically for other categories
            const firstChar = name.charAt(0).toUpperCase();
            if (firstChar >= 'A' && firstChar <= 'F') subCategory = 'A-F';
            else if (firstChar >= 'G' && firstChar <= 'L') subCategory = 'G-L';
            else if (firstChar >= 'M' && firstChar <= 'R') subCategory = 'M-R';
            else if (firstChar >= 'S' && firstChar <= 'Z') subCategory = 'S-Z';
            break;
        }
        
        if (!subCats[category][subCategory]) {
          subCats[category][subCategory] = [];
        }
        subCats[category][subCategory].push(tag.name);
      });
    });
    
    return subCats;
  }, [allTags, categories]);
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
      setViewMode(selectedSubcategory ? "subcategory" : selectedCategory ? "category" : "overview");
      navigate('/ressources');
    } else if (viewMode === "subcategory") {
      setViewMode("category");
      setSelectedSubcategory("");
    } else if (viewMode === "category") {
      setViewMode("overview");
      setSelectedCategory("");
    } else if (viewMode === "professions") {
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
  return <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <Card className="mb-8">
          <CardContent className="p-8 text-center">
            <h1 className="text-5xl font-bold text-foreground mb-4 animate-fade-in">
              Resources
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Discover and explore LGBTQ+ community tags, resources, and professions
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <Badge variant="outline">
                {allTags.length} Total Tags
              </Badge>
              <Badge variant="outline">
                {categories.length} Categories
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        <div className="w-full">
            <div className="space-y-6 animate-fade-in">
            {/* Categories Overview */}
            {viewMode === "overview" && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <Grid3X3 className="h-6 w-6 text-primary" />
                    Browse by Category
                  </CardTitle>
                  <p className="text-muted-foreground text-base">
                    Explore tags organized by different categories
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    {categories.map((category, index) => {
                      const Icon = getCategoryIcon(category);
                      const categoryTags = allTags.filter(tag => tag.category === category);
                      return (
                        <Card 
                          key={category} 
                          className="group cursor-pointer transition-all duration-200 hover:bg-accent/10"
                          onClick={() => {
                            setFilterCategory(category);
                            setViewMode("category");
                            setSelectedCategory(category);
                          }}
                        >
                          <CardContent className="p-6 text-center">
                            <div className="mb-4">
                              <Icon className="h-12 w-12 mx-auto text-primary" />
                            </div>
                            <h3 className="font-semibold text-base mb-2 capitalize group-hover:text-primary transition-colors duration-200">
                              {category}
                            </h3>
                            <Badge variant="secondary" className="text-sm px-3 py-1">
                              {categoryTags.length} tags
                            </Badge>
                          </CardContent>
                        </Card>
                      );
                    })}
                    
                    {/* Professions Category */}
                    <Card 
                      className="group cursor-pointer transition-all duration-200 hover:bg-accent/10"
                      onClick={() => {
                        setViewMode("professions");
                      }}
                    >
                      <CardContent className="p-6 text-center">
                        <div className="mb-4">
                          <Briefcase className="h-12 w-12 mx-auto text-primary" />
                        </div>
                        <h3 className="font-semibold text-base mb-2 capitalize group-hover:text-primary transition-colors duration-200">
                          Professions
                        </h3>
                        <Badge variant="secondary" className="text-sm px-3 py-1">
                          {professions.length} professions
                        </Badge>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Category View with Subcategories */}
            {viewMode === "category" && selectedCategory && (
              <Card className="mb-8">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={handleBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <div>
                      <CardTitle className="text-2xl flex items-center gap-2 capitalize">
                        {(() => {
                          const IconComponent = getCategoryIcon(selectedCategory);
                          return <IconComponent className="h-6 w-6 text-primary" />;
                        })()}
                        {selectedCategory} Subcategories
                      </CardTitle>
                      <p className="text-muted-foreground text-base">
                        Browse subcategories within {selectedCategory}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(subcategories[selectedCategory] || {}).map(([subCategory, tagNames]) => (
                      <Card 
                        key={subCategory}
                        className="group cursor-pointer transition-all duration-200 hover:bg-accent/10 hover:shadow-lg"
                        onClick={() => {
                          setSelectedSubcategory(subCategory);
                          setViewMode("subcategory");
                        }}
                      >
                        <CardContent className="p-6">
                          <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors duration-200">
                            {subCategory}
                          </h3>
                          <div className="space-y-2">
                            <Badge variant="secondary" className="text-sm px-3 py-1">
                              {tagNames.length} tags
                            </Badge>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {tagNames.slice(0, 3).join(", ")}
                              {tagNames.length > 3 && ` and ${tagNames.length - 3} more...`}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Subcategory View */}
            {viewMode === "subcategory" && selectedCategory && selectedSubcategory && (
              <Card className="mb-8">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={handleBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <div>
                      <CardTitle className="text-2xl flex items-center gap-2">
                        <Tag className="h-6 w-6 text-primary" />
                        {selectedSubcategory}
                      </CardTitle>
                      <p className="text-muted-foreground text-base">
                        Tags in {selectedCategory} → {selectedSubcategory}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    {(subcategories[selectedCategory]?.[selectedSubcategory] || []).map((tagName) => {
                      const tag = allTags.find(t => t.name === tagName);
                      if (!tag) return null;
                      
                      return (
                        <Card 
                          key={tag.id} 
                          className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 hover:border-primary/20 overflow-hidden bg-gradient-to-br from-card to-muted/10"
                          onClick={() => handleTagClick(tag)}
                        >
                          <div className="aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-muted to-muted/50 relative">
                            {tag.image_url ? (
                              <img 
                                src={tag.image_url} 
                                alt={`${tag.name} themed image`} 
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                                onError={e => {
                                  e.currentTarget.src = '/placeholder.svg';
                                }} 
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted via-muted/80 to-muted/60">
                                <Tag className="h-12 w-12 text-muted-foreground/60 transition-transform duration-300 group-hover:scale-125" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          </div>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <div 
                                className="w-4 h-4 rounded-full shrink-0 ring-2 ring-white/20 transition-transform duration-200 group-hover:scale-125" 
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="text-sm font-semibold truncate group-hover:text-primary transition-colors duration-200">
                                {tag.name}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground font-medium">
                                {selectedSubcategory}
                              </span>
                              {tagUsageCounts[tag.name] > 0 && (
                                <Badge variant="outline" className="text-xs px-2 py-1 group-hover:bg-primary/10 group-hover:text-primary transition-colors duration-200">
                                  {tagUsageCounts[tag.name]} uses
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Professions View */}
            {viewMode === "professions" && (
              <Card className="mb-8">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={handleBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <div>
                      <CardTitle className="text-2xl flex items-center gap-2">
                        <Briefcase className="h-6 w-6 text-primary" />
                        LGBTQ+ Personalities by Profession
                      </CardTitle>
                      <p className="text-muted-foreground text-base">
                        Explore different professions represented by LGBTQ+ personalities in our directory
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {professions.map((profession, index) => (
                      <Button 
                        key={profession} 
                        variant={selectedProfession === profession ? "default" : "outline"} 
                        className="h-auto p-4 text-left justify-start transition-all duration-300 hover:scale-105 hover:shadow-lg group"
                        style={{ animationDelay: `${index * 30}ms` }}
                        onClick={() => {
                          if (selectedProfession === profession) {
                            setSelectedProfession("");
                            navigate('/personalities');
                          } else {
                            setSelectedProfession(profession);
                            navigate(`/personalities?profession=${encodeURIComponent(profession)}`);
                          }
                        }}
                      >
                        <div className="truncate font-medium group-hover:text-primary transition-colors duration-200">
                          {profession}
                        </div>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Search and Filters */}
            <Card className="mb-8">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input 
                      placeholder="Search tags, categories, descriptions..." 
                      value={searchQuery} 
                      onChange={e => handleSearch(e.target.value)} 
                      className="pl-12 h-12 text-base" 
                    />
                  </div>
                  <div className="flex gap-3">
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                      <SelectTrigger className="w-48 h-12">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Filter by category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map(category => (
                          <SelectItem key={category} value={category} className="capitalize">
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
                      <SelectTrigger className="w-48 h-12">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Sort by" />
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
            </div>
        </div>

        {/* Admin Controls with enhanced design */}
        {viewMode === "overview" && (
          <Card className="border-0 shadow-lg bg-gradient-to-r from-card to-muted/20 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Brain className="h-6 w-6 text-primary" />
                Admin Controls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={storeTagImages} 
                  disabled={processingImages} 
                  variant="outline" 
                  size="lg"
                  className="hover-scale transition-all duration-200"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {processingImages ? 'Processing...' : 'Reimport All Images'}
                </Button>
                <Button 
                  onClick={categorizeAllTags} 
                  disabled={categorizingTags} 
                  variant="outline" 
                  size="lg"
                  className="hover-scale transition-all duration-200"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  {categorizingTags ? 'Categorizing...' : 'AI Auto-Categorize'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Enhanced Results Info */}
        {(viewMode === "search" || (viewMode === "overview" && (searchQuery || filterCategory !== "all"))) && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold">
                {viewMode === "search" ? "Search Results" : filterCategory !== "all" ? `${filterCategory} Tags` : "All Tags"}
              </h2>
              <Badge variant="secondary" className="px-3 py-1 text-sm">
                {filteredAndSortedTags.length} tags
              </Badge>
            </div>
          </div>
        )}

        {/* Enhanced Tags Display */}
        <div className={displayMode === "grid" ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6" : "space-y-3"}>
          {filteredAndSortedTags.map((tag, index) => (
            <Card 
              key={`${tag.id}-${index}`} 
              className={`group cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-105 hover:-translate-y-2 border-2 hover:border-primary/20 ${displayMode === "list" ? "flex items-center p-4" : "overflow-hidden bg-gradient-to-br from-card to-muted/10"}`} 
              style={{ animationDelay: `${index * 20}ms` }}
              onClick={() => handleTagClick(tag)}
            >
              {displayMode === "grid" ? (
                <>
                  <div className="aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-muted to-muted/50 relative">
                    {tag.image_url ? (
                      <img 
                        src={tag.image_url} 
                        alt={`${tag.name} themed image`} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                        onError={e => {
                          e.currentTarget.src = '/placeholder.svg';
                        }} 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted via-muted/80 to-muted/60">
                        <Tag className="h-12 w-12 text-muted-foreground/60 transition-transform duration-300 group-hover:scale-125" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div 
                        className="w-4 h-4 rounded-full shrink-0 ring-2 ring-white/20 transition-transform duration-200 group-hover:scale-125" 
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm font-semibold truncate group-hover:text-primary transition-colors duration-200">
                        {tag.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground capitalize font-medium">
                        {tag.category || 'Uncategorized'}
                      </span>
                      {tagUsageCounts[tag.name] > 0 && (
                        <Badge variant="outline" className="text-xs px-2 py-1 group-hover:bg-primary/10 group-hover:text-primary transition-colors duration-200">
                          {tagUsageCounts[tag.name]} uses
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </>
              ) : (
                <div className="flex items-center gap-4 w-full">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-muted to-muted/50 shrink-0 transition-transform duration-300 group-hover:scale-110">
                    {tag.image_url ? (
                      <img 
                        src={tag.image_url} 
                        alt={`${tag.name} themed image`} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Tag className="h-8 w-8 text-muted-foreground/60" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full shrink-0 ring-2 ring-white/20" 
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="font-semibold truncate text-base group-hover:text-primary transition-colors duration-200">
                        {tag.name}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {tag.description || tag.category || 'No description'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs capitalize">
                      {tag.category || 'Uncategorized'}
                    </Badge>
                    {tagUsageCounts[tag.name] > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {tagUsageCounts[tag.name]} uses
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>

        {filteredAndSortedTags.length === 0 && (
          <Card className="border-2 border-dashed border-muted-foreground/20">
            <CardContent className="p-16 text-center">
              <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center">
                <Tag className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-2xl font-semibold mb-3 text-muted-foreground">No tags found</h3>
              <p className="text-muted-foreground text-base max-w-md mx-auto">
                {viewMode === "search" 
                  ? "Try adjusting your search terms or filters to find what you're looking for" 
                  : "No tags are available yet. Check back later or contact support if this seems incorrect"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>;
}