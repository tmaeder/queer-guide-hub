import { useState } from "react";
import { useCentralizedTags } from "@/hooks/useCentralizedTags";
import { TagCard } from "@/components/directory/TagCard";
import { DirectorySearch } from "@/components/directory/DirectorySearch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Tag, Users, Calendar, MapPin, ShoppingBag, Heart, Brain } from "lucide-react";

type ViewMode = "overview" | "category" | "search" | "tag-detail";

export default function TagsDirectory() {
  const { 
    allTags, 
    tagsByCategory, 
    loading, 
    error, 
    searchTags
  } = useCentralizedTags();

  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);

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
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading tags directory...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-destructive">Error: {error}</div>
      </div>
    );
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "events": return Calendar;
      case "venues": return MapPin;
      case "marketplace": return ShoppingBag;
      case "community": return Users;
      case "gender-identity": return Heart;
      case "health": return Brain;
      default: return Tag;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {viewMode !== "overview" && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold">Tags Wiki</h1>
            {viewMode === "category" && (
              <p className="text-muted-foreground">Exploring {selectedCategory} tags</p>
            )}
            {viewMode === "tag-detail" && selectedTag && (
              <p className="text-muted-foreground">#{selectedTag.name}</p>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <DirectorySearch 
        onSearch={handleSearch} 
        placeholder="Search tags, categories, descriptions..."
      />

      {/* Breadcrumb */}
      {viewMode !== "overview" && viewMode !== "search" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => setViewMode("overview")} className="hover:text-foreground">
            Tags Wiki
          </button>
          {selectedCategory && (
            <>
              <span>/</span>
              <button 
                onClick={() => setViewMode("category")} 
                className="hover:text-foreground"
              >
                {selectedCategory}
              </button>
            </>
          )}
          {selectedTag && (
            <>
              <span>/</span>
              <span className="text-foreground">#{selectedTag.name}</span>
            </>
          )}
        </div>
      )}

      {/* Content based on view mode */}
      {viewMode === "overview" && (
        <div className="space-y-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card rounded-lg p-4 border">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{allTags.length}</p>
                  <p className="text-sm text-muted-foreground">Total Tags</p>
                </div>
              </div>
            </div>
            {tagsByCategory.map((categoryData) => {
              const IconComponent = getCategoryIcon(categoryData.category);
              return (
                <div key={categoryData.category} className="bg-card rounded-lg p-4 border">
                  <div className="flex items-center gap-2">
                    <IconComponent className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">{categoryData.count}</p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {categoryData.category.replace('-', ' ')}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Categories */}
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList>
              <TabsTrigger value="all" className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                All Tags
              </TabsTrigger>
              {tagsByCategory.map((categoryData) => {
                const IconComponent = getCategoryIcon(categoryData.category);
                return (
                  <TabsTrigger key={categoryData.category} value={categoryData.category} className="flex items-center gap-2">
                    <IconComponent className="h-4 w-4" />
                    {categoryData.category.charAt(0).toUpperCase() + categoryData.category.slice(1).replace('-', ' ')}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">All Tags</h2>
                <Badge variant="secondary">{allTags.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allTags.map((tag, index) => (
                  <div
                    key={`${tag.id}-${index}`}
                    className="p-4 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => handleTagClick(tag)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="font-medium">{tag.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {tag.category}
                      </Badge>
                    </div>
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
            </TabsContent>

            {tagsByCategory.map(({ category, tags, count }) => (
              <TabsContent key={category} value={category} className="space-y-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold capitalize">
                    {category.replace('-', ' ')} Tags
                  </h2>
                  <Badge variant="secondary">{count}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tags.map((tag, index) => (
                    <div
                      key={`${tag.id}-${index}`}
                      className="p-4 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => handleTagClick(tag)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="font-medium">{tag.name}</span>
                      </div>
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
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      {viewMode === "search" && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Search Results</h2>
          
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((tag, index) => (
                <TagCard
                  key={`${tag.name}-${index}`}
                  tag={tag}
                  onClick={() => handleTagClick(tag)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No tags found. Try a different search term.
            </div>
          )}
        </div>
      )}

      {viewMode === "tag-detail" && selectedTag && (
        <div className="space-y-6">
          <div className="bg-card rounded-lg p-6 border">
            <div className="flex items-center gap-3 mb-4">
              <Badge variant="outline" className="text-lg px-3 py-1">
                #{selectedTag.name}
              </Badge>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{selectedTag.total_count} uses</span>
                <span>{selectedTag.categories?.length || 1} categories</span>
              </div>
            </div>
            
            {selectedTag.description && (
              <p className="text-muted-foreground mb-4">{selectedTag.description}</p>
            )}

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Usage by Category</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedTag.usage_by_category?.map((usage: any) => {
                  const IconComponent = getCategoryIcon(usage.category);
                  return (
                    <div key={usage.category} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4" />
                        <span className="capitalize">{usage.category}</span>
                      </div>
                      <Badge variant="secondary">{usage.count}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedTag?.related_tags && selectedTag.related_tags.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Related Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedTag.related_tags.map((relatedTag: string) => (
                    <Button
                      key={relatedTag}
                      variant="outline"
                      size="sm"
                      onClick={() => handleTagClick({ name: relatedTag })}
                    >
                      #{relatedTag}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}