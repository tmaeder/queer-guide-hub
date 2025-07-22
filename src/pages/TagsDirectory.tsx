import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useCentralizedTags } from "@/hooks/useCentralizedTags";
import { TagCard } from "@/components/directory/TagCard";
import { DirectorySearch } from "@/components/directory/DirectorySearch";
import { TagGraphView } from "@/components/directory/TagGraphView";
import { useTagRelationships } from "@/hooks/useTagRelationships";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Tag, Users, Calendar, MapPin, ShoppingBag, Heart, Brain, Upload, Network, Cpu } from "lucide-react";
import { toast } from "@/hooks/use-toast";
type ViewMode = "overview" | "category" | "search" | "tag-detail";
export default function TagsDirectory() {
  const {
    tagName
  } = useParams<{
    tagName: string;
  }>();
  const {
    allTags,
    tagsByCategory,
    loading,
    error,
    searchTags
  } = useCentralizedTags();
  const { computeRelationships, computing } = useTagRelationships();
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [tagImages, setTagImages] = useState<Record<string, string>>({});
  const [processingImages, setProcessingImages] = useState(false);
  const [categorizingTags, setCategorizingTags] = useState(false);
  const [tagUsageCounts, setTagUsageCounts] = useState<Record<string, number>>({});

  // Calculate real usage counts for tags
  useEffect(() => {
    const calculateUsageCounts = async () => {
      if (allTags.length === 0) return;
      
      const usageCounts: Record<string, number> = {};
      
      try {
        // Get venue tag usage
        const { data: venues } = await supabase
          .from('venues')
          .select('tags')
          .not('tags', 'is', null);
        
        // Get community group tag usage  
        const { data: groups } = await supabase
          .from('community_groups')
          .select('tags')
          .not('tags', 'is', null);
          
        // Count usage across all content types
        for (const tag of allTags) {
          let count = 0;
          
          // Count in venues
          if (venues) {
            count += venues.filter(venue => 
              venue.tags && venue.tags.includes(tag.name)
            ).length;
          }
          
          // Count in groups
          if (groups) {
            count += groups.filter(group => 
              group.tags && group.tags.includes(tag.name)
            ).length;
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

  // Store images for all tags (reimport all)
  const storeTagImages = async () => {
    if (allTags.length === 0) return;
    setProcessingImages(true);
    try {
      console.log(`Processing ${allTags.length} tags (reimporting all images)`);

      for (const tag of allTags) {
        try {
          console.log(`Calling store-tag-images for tag: ${tag.name}`);
          const { data, error } = await supabase.functions.invoke('store-tag-images', {
            body: {
              tagId: tag.id,
              tagName: tag.name
            }
          });
          
          console.log(`Response for ${tag.name}:`, { data, error });
          
          if (error) {
            console.error(`Error for tag ${tag.name}:`, error);
            toast({
              title: "Image fetch failed",
              description: `Failed to fetch image for ${tag.name}: ${error.message}`,
              variant: "destructive",
            });
          } else if (data?.success) {
            console.log(`Successfully stored image for tag: ${tag.name}`);
            toast({
              title: "Image stored",
              description: `Image stored for ${tag.name}`,
            });
          } else {
            console.log(`No success flag for tag ${tag.name}:`, data);
            toast({
              title: "Unexpected response",
              description: `Unexpected response for ${tag.name}`,
              variant: "destructive",
            });
          }
        } catch (err) {
          console.error(`Failed to store image for tag ${tag.name}:`, err);
          toast({
            title: "Error",
            description: `Failed to store image for ${tag.name}`,
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Processing complete",
        description: "Image processing complete! Refreshing page...",
      });
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Error processing tag images:', error);
      toast({
        title: "Error",
        description: "Error processing tag images",
        variant: "destructive",
      });
    } finally {
      setProcessingImages(false);
    }
  };

  // Auto-categorize tags using AI
  const categorizeAllTags = async () => {
    setCategorizingTags(true);
    try {
      console.log('Starting AI tag categorization...');
      
      const { data, error } = await supabase.functions.invoke('categorize-tags');
      
      if (error) {
        console.error('Error categorizing tags:', error);
        toast({
          title: "Categorization failed",
          description: `Failed to categorize tags: ${error.message}`,
          variant: "destructive",
        });
      } else if (data?.success) {
        console.log('Successfully categorized tags:', data);
        toast({
          title: "Tags categorized",
          description: `Successfully categorized ${data.categorized_count} tags! Refreshing...`,
        });
        // Refresh the page to show updated categories
        setTimeout(() => window.location.reload(), 2000);
      } else {
        console.log('Unexpected response:', data);
        toast({
          title: "Unexpected response",
          description: "Received unexpected response from categorization service",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error in categorizeAllTags:', error);
      toast({
        title: "Error",
        description: "Failed to categorize tags",
        variant: "destructive",
      });
    } finally {
      setCategorizingTags(false);
    }
  };

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
  const handleCategoryClick = (category: string) => {
    setSelectedCategory(category);
    setViewMode("category");
  };
  const handleTagClick = (tag: any) => {
    setSelectedTag(tag);
    setViewMode("tag-detail");
  };
  const handleSearch = async (query: string) => {
    if (query.trim()) {
      const results = await searchTags(query);
      setSearchResults(results);
      setViewMode("search");
    } else {
      setViewMode("overview");
      setSearchResults([]);
    }
  };

  const handleFiltersChange = (filters: any) => {
    // For now, just a placeholder since tags don't use these specific filters
    console.log('Filters changed:', filters);
  };
  const handleBack = () => {
    if (viewMode === "tag-detail") {
      setViewMode(selectedCategory ? "category" : "overview");
    } else if (viewMode === "category") {
      setViewMode("overview");
    } else if (viewMode === "search") {
      setViewMode("overview");
    }
  };
  if (loading) {
    return <div className="container mx-auto p-6">
        <div className="text-center">Loading tags directory...</div>
      </div>;
  }
  if (error) {
    return <div className="container mx-auto p-6">
        <div className="text-center text-destructive">Error: {error}</div>
      </div>;
  }
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
  return <div className="w-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {viewMode !== "overview" && <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>}
          <div>
            <h1 className="text-3xl font-bold">Tags Wiki</h1>
            {viewMode === "category" && <p className="text-muted-foreground">Exploring {selectedCategory} tags</p>}
            {viewMode === "tag-detail" && selectedTag && <p className="text-muted-foreground">#{selectedTag.name}</p>}
          </div>
        </div>
      </div>

      {/* Search */}
      <DirectorySearch onSearch={handleSearch} onFiltersChange={handleFiltersChange} placeholder="Search tags, categories, descriptions..." />

      {/* Breadcrumb */}
      {viewMode !== "overview" && viewMode !== "search" && <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => setViewMode("overview")} className="hover:text-foreground">
            Tags Wiki
          </button>
          {selectedCategory && <>
              <span>/</span>
              <button onClick={() => setViewMode("category")} className="hover:text-foreground">
                {selectedCategory}
              </button>
            </>}
          {selectedTag && <>
              <span>/</span>
              <span className="text-foreground">#{selectedTag.name}</span>
            </>}
        </div>}

      {/* Content based on view mode */}
      {viewMode === "overview" && <div className="space-y-6">
          {/* Categories */}
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all" className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                All Tags
              </TabsTrigger>
              <TabsTrigger value="graph" className="flex items-center gap-2">
                <Network className="h-4 w-4" />
                Graph View
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Categories
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">All Tags</h2>
                  <Badge variant="secondary">{allTags.length} tags</Badge>
                  <Badge variant="outline">
                    {Object.values(tagUsageCounts).reduce((total, count) => total + count, 0)} total uses
                  </Badge>
                </div>
                <Button onClick={storeTagImages} disabled={processingImages} variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  {processingImages ? 'Processing...' : 'Reimport All Images'}
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {allTags.map((tag, index) => (
                  <div 
                    key={`${tag.id}-${index}`} 
                    className="cursor-pointer transition-all hover:shadow-md hover:scale-105"
                    onClick={() => handleTagClick(tag)}
                  >
                    <div className="bg-card rounded-lg border overflow-hidden">
                      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                        {tag.image_url ? (
                          <img 
                            src={tag.image_url} 
                            alt={`${tag.name} themed image`} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = '/placeholder.svg';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Tag className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
                          <span className="text-sm font-medium truncate">{tag.name}</span>
                        </div>
                        {tagUsageCounts[tag.name] > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {tagUsageCounts[tag.name]} {tagUsageCounts[tag.name] === 1 ? 'use' : 'uses'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="graph" className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">Tag Relationship Graph</h2>
                  <Badge variant="secondary">{allTags.length} nodes</Badge>
                </div>
                <Button 
                  onClick={computeRelationships} 
                  disabled={computing} 
                  variant="outline" 
                  size="sm"
                >
                  <Cpu className="h-4 w-4 mr-2" />
                  {computing ? 'Computing...' : 'Compute AI Relationships'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Interactive graph showing AI-computed semantic relationships between tags based on their names and descriptions. Thicker lines indicate stronger similarity.
              </p>
              <TagGraphView 
                tags={allTags} 
                onTagClick={handleTagClick}
                selectedTag={selectedTag}
              />
            </TabsContent>

            <TabsContent value="categories" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">Browse by Category</h2>
                  <Badge variant="secondary">{tagsByCategory.length} categories</Badge>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={categorizeAllTags} 
                    disabled={categorizingTags} 
                    variant="outline" 
                    size="sm"
                  >
                    <Brain className="h-4 w-4 mr-2" />
                    {categorizingTags ? 'Categorizing...' : 'AI Auto-Categorize'}
                  </Button>
                </div>
              </div>
              
              {categorizingTags && (
                <div className="bg-muted/50 rounded-lg p-4 border">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                    <div>
                      <p className="font-medium">AI Categorization in Progress</p>
                      <p className="text-sm text-muted-foreground">
                        Using advanced AI to analyze and categorize tags based on LGBTQ+ community context...
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Category Stats Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-4 border">
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Categories</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{tagsByCategory.length}</p>
                </div>
                
                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg p-4 border">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">Total Tags</span>
                  </div>
                  <p className="text-2xl font-bold text-green-900 dark:text-green-100">{allTags.length}</p>
                </div>
                
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg p-4 border">
                  <div className="flex items-center gap-2 mb-1">
                    <Heart className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Active Usage</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                    {Object.values(tagUsageCounts).reduce((total, count) => total + count, 0)}
                  </p>
                </div>
                
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 rounded-lg p-4 border">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <span className="text-sm font-medium text-orange-700 dark:text-orange-300">Avg per Category</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                    {Math.round(allTags.length / Math.max(tagsByCategory.length, 1))}
                  </p>
                </div>
              </div>

              {/* Categories Grid */}
              <div className="space-y-8">
                {/* Group categories by theme */}
                {[
                  {
                    title: "Identity & Expression",
                    description: "Core aspects of LGBTQ+ identity and self-expression",
                    categories: tagsByCategory.filter(({ category }) => 
                      ['gender-identity', 'sexual-orientation', 'romantic-orientation', 'expression', 'community-terms'].includes(category)
                    ),
                    color: "from-pink-500 to-rose-500"
                  },
                  {
                    title: "Relationships & Dynamics", 
                    description: "Connection, intimacy, and relationship structures",
                    categories: tagsByCategory.filter(({ category }) => 
                      ['relationship-structure', 'relationship-roles', 'power-dynamics', 'communication'].includes(category)
                    ),
                    color: "from-purple-500 to-violet-500"
                  },
                  {
                    title: "Activities & Practices",
                    description: "Intimate practices, activities, and expressions of connection",
                    categories: tagsByCategory.filter(({ category }) => 
                      ['intimacy', 'kink-practice', 'sexual-activity', 'roleplay'].includes(category)
                    ),
                    color: "from-red-500 to-pink-500"
                  },
                  {
                    title: "Community & Culture",
                    description: "Events, subcultures, and community spaces",
                    categories: tagsByCategory.filter(({ category }) => 
                      ['subculture', 'events-gatherings', 'celebrations', 'venues', 'online-spaces'].includes(category)
                    ),
                    color: "from-blue-500 to-cyan-500"
                  },
                  {
                    title: "Health & Wellness",
                    description: "Physical health, mental wellness, and safety resources",
                    categories: tagsByCategory.filter(({ category }) => 
                      ['physical-health', 'mental-wellness', 'safety-practices', 'support-resources'].includes(category)
                    ),
                    color: "from-green-500 to-emerald-500"
                  },
                  {
                    title: "Lifestyle & Interests",
                    description: "Personal interests, lifestyle choices, and general topics",
                    categories: tagsByCategory.filter(({ category }) => 
                      !['gender-identity', 'sexual-orientation', 'romantic-orientation', 'expression', 'community-terms',
                        'relationship-structure', 'relationship-roles', 'power-dynamics', 'communication',
                        'intimacy', 'kink-practice', 'sexual-activity', 'roleplay',
                        'subculture', 'events-gatherings', 'celebrations', 'venues', 'online-spaces',
                        'physical-health', 'mental-wellness', 'safety-practices', 'support-resources'].includes(category)
                    ),
                    color: "from-amber-500 to-orange-500"
                  }
                ].filter(group => group.categories.length > 0).map((group, groupIndex) => (
                  <div key={group.title} className="animate-fade-in" style={{ animationDelay: `${groupIndex * 100}ms` }}>
                    <div className="mb-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`h-1 w-12 bg-gradient-to-r ${group.color} rounded-full`} />
                        <h3 className="text-lg font-semibold text-foreground">{group.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground ml-15">{group.description}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {group.categories
                        .sort((a, b) => b.count - a.count)
                        .map(({ category, tags, count }, index) => {
                        const IconComponent = getCategoryIcon(category);
                        const usageCount = tags.reduce((total, tag) => total + (tagUsageCounts[tag.name] || 0), 0);
                        
                        return (
                          <div 
                            key={category} 
                            className="group bg-card border rounded-xl p-5 cursor-pointer hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1 animate-scale-in"
                            style={{ animationDelay: `${(groupIndex * 100) + (index * 50)}ms` }}
                            onClick={() => handleCategoryClick(category)}
                          >
                            <div className="flex items-start gap-4 mb-4">
                              <div className={`p-3 bg-gradient-to-br ${group.color} rounded-lg shadow-sm group-hover:shadow-md transition-shadow`}>
                                <IconComponent className="h-5 w-5 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-foreground capitalize group-hover:text-primary transition-colors line-clamp-1">
                                  {category.replace(/[-_]/g, ' ')}
                                </h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="secondary" className="text-xs font-medium">
                                    {count} tags
                                  </Badge>
                                  {usageCount > 0 && (
                                    <Badge variant="outline" className="text-xs">
                                      {usageCount} uses
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Tag Preview */}
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1">
                                {tags.slice(0, 3).map((tag) => (
                                  <div 
                                    key={tag.id} 
                                    className="flex items-center gap-1.5 text-xs bg-muted/50 group-hover:bg-muted px-2 py-1 rounded-md transition-colors"
                                  >
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                                    <span className="font-medium truncate max-w-[80px]">{tag.name}</span>
                                    {tagUsageCounts[tag.name] > 0 && (
                                      <span className="text-muted-foreground">({tagUsageCounts[tag.name]})</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {count > 3 && (
                                <div className="text-xs text-muted-foreground font-medium">
                                  +{count - 3} more tags
                                </div>
                              )}
                            </div>
                            
                            {/* Hover indicator */}
                            <div className="mt-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-xs text-muted-foreground">Click to explore</span>
                              <div className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform">
                                →
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                   </div>
                 ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>}

      {viewMode === "search" && <div className="space-y-6">
          <h2 className="text-xl font-semibold">Search Results</h2>
          
          {searchResults.length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((tag, index) => <TagCard key={`${tag.name}-${index}`} tag={tag} onClick={() => handleTagClick(tag)} />)}
            </div> : <div className="text-center text-muted-foreground py-8">
              No tags found. Try a different search term.
            </div>}
        </div>}

      {viewMode === "tag-detail" && selectedTag && <div className="space-y-6">
          <div className="bg-card rounded-lg p-6 border">
            <div className="flex flex-col lg:flex-row gap-6 mb-6">
              {/* Tag Image */}
              {selectedTag.image_url && (
                <div className="lg:w-64 lg:flex-shrink-0">
                  <img 
                    src={selectedTag.image_url} 
                    alt={`${selectedTag.name} tag`}
                    className="w-full h-48 lg:h-64 object-cover rounded-lg border"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
              
              {/* Tag Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <Badge variant="outline" className="text-2xl px-4 py-2">
                    #{selectedTag.name}
                  </Badge>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Category: {selectedTag.category || 'Uncategorized'}</span>
                  </div>
                </div>
                
                {selectedTag.description && <p className="text-muted-foreground mb-4">{selectedTag.description}</p>}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Usage by Category</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedTag.usage_by_category?.map((usage: any) => {
              const IconComponent = getCategoryIcon(usage.category);
              return <div key={usage.category} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4" />
                        <span className="capitalize">{usage.category}</span>
                      </div>
                      <Badge variant="secondary">{usage.count}</Badge>
                    </div>;
            })}
              </div>
            </div>

            {selectedTag?.related_tags && selectedTag.related_tags.length > 0 && <div className="space-y-4">
                <h3 className="text-lg font-semibold">Related Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedTag.related_tags.map((relatedTag: string) => <Button key={relatedTag} variant="outline" size="sm" onClick={() => handleTagClick({
              name: relatedTag
            })}>
                      #{relatedTag}
                    </Button>)}
                </div>
              </div>}
          </div>
        </div>}
    </div>;
}