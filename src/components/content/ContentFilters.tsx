import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, X, Calendar, Tag, User } from "lucide-react";
import { ContentType, ContentStatus, ContentCategory, ContentTag } from "@/hooks/useContent";

interface ContentFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedType: string;
  onTypeChange: (type: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  selectedAuthor: string;
  onAuthorChange: (author: string) => void;
  categories: ContentCategory[];
  tags: ContentTag[];
  authors: Array<{ id: string; name: string }>;
  onClearFilters: () => void;
  resultsCount: number;
}

export const ContentFilters = ({
  searchQuery,
  onSearchChange,
  selectedType,
  onTypeChange,
  selectedStatus,
  onStatusChange,
  selectedCategory,
  onCategoryChange,
  selectedTags,
  onTagsChange,
  selectedAuthor,
  onAuthorChange,
  categories,
  tags,
  authors,
  onClearFilters,
  resultsCount
}: ContentFiltersProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeFiltersCount = [
    selectedType !== "all",
    selectedStatus !== "all",
    selectedCategory !== "all",
    selectedTags.length > 0,
    selectedAuthor !== "all",
    searchQuery.length > 0
  ].filter(Boolean).length;

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      onTagsChange(selectedTags.filter(id => id !== tagId));
    } else {
      onTagsChange([...selectedTags, tagId]);
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search content by title, content, or excerpt..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-4"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Select value={selectedType} onValueChange={onTypeChange}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="blog_post">Blog Posts</SelectItem>
                  <SelectItem value="page">Pages</SelectItem>
                  <SelectItem value="legal_document">Legal Documents</SelectItem>
                  <SelectItem value="press_release">Press Releases</SelectItem>
                  <SelectItem value="about_content">About Content</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedStatus} onValueChange={onStatusChange}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Advanced
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>

            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onClearFilters} className="gap-2">
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}

            <div className="ml-auto text-sm text-muted-foreground">
              {resultsCount} {resultsCount === 1 ? 'result' : 'results'}
            </div>
          </div>

          {/* Advanced Filters */}
          {showAdvanced && (
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Category Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Category
                  </label>
                  <Select value={selectedCategory} onValueChange={onCategoryChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: category.color || "#6366f1" }}
                            />
                            {category.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Author Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Author
                  </label>
                  <Select value={selectedAuthor} onValueChange={onAuthorChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Authors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Authors</SelectItem>
                      {authors.map((author) => (
                        <SelectItem key={author.id} value={author.id}>
                          {author.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tags Filter */}
              <div>
                <label className="text-sm font-medium mb-2 block">Tags</label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={selectedTags.includes(tag.id) ? "default" : "outline"}
                      className="cursor-pointer hover:shadow-sm transition-shadow"
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};