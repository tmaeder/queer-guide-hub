import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Plus, Search, Tag as TagIcon } from 'lucide-react';
import { useCentralizedTags, CentralizedTag } from '@/hooks/useCentralizedTags';

interface TagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  allowCustomTags?: boolean;
  categories?: string[];
  className?: string;
}

export const TagSelector = ({
  selectedTags,
  onTagsChange,
  placeholder = "Select tags...",
  maxTags = 10,
  allowCustomTags = false,
  categories,
  className
}: TagSelectorProps) => {
  const { allTags, tagsByCategory, searchTags } = useCentralizedTags();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CentralizedTag[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      const results = await searchTags(
        query,
        activeCategory === 'all' ? undefined : activeCategory
      );
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const addTag = (tagName: string) => {
    if (!selectedTags.includes(tagName) && selectedTags.length < maxTags) {
      onTagsChange([...selectedTags, tagName]);
    }
  };

  const removeTag = (tagName: string) => {
    onTagsChange(selectedTags.filter(tag => tag !== tagName));
  };

  const getTagsToShow = () => {
    if (searchQuery.trim() && searchResults.length > 0) {
      return searchResults;
    }
    
    if (activeCategory === 'all') {
      return allTags.slice(0, 50); // Limit for performance
    }
    
    return tagsByCategory
      .find(cat => cat.category === activeCategory)?.tags || [];
  };

  const availableCategories = categories || 
    tagsByCategory.map(cat => cat.category);

  return (
    <div className={className}>
      <Label className="text-sm font-medium">Tags</Label>
      
      {/* Selected Tags */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 mb-3">
          {selectedTags.map((tagName) => {
            const tag = allTags.find(t => t.name === tagName);
            return (
              <Badge
                key={tagName}
                variant="secondary"
                className="flex items-center gap-1 pr-1"
                style={tag ? { backgroundColor: `${tag.color}20`, borderColor: tag.color } : undefined}
              >
                <TagIcon className="h-3 w-3" />
                {tagName}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => removeTag(tagName)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Tag Selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={selectedTags.length >= maxTags}
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {selectedTags.length >= maxTags 
                ? `Maximum ${maxTags} tags selected`
                : placeholder
              }
            </span>
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-full p-0" align="start">
          <div className="p-4 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tags..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Category Tabs */}
            <Tabs value={activeCategory} onValueChange={setActiveCategory}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="gender-identity">Gender</TabsTrigger>
                <TabsTrigger value="community">Community</TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[300px] mt-4">
                <div className="space-y-2">
                  {getTagsToShow().map((tag) => (
                    <div
                      key={tag.id}
                      className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                        selectedTags.includes(tag.name)
                          ? 'bg-primary/10 border-primary'
                          : 'hover:bg-muted border-transparent'
                      }`}
                      onClick={() => addTag(tag.name)}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm">{tag.name}</div>
                          {tag.description && (
                            <div className="text-xs text-muted-foreground">
                              {tag.description}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {tag.category}
                        </Badge>
                        {tag.usage_count > 0 && (
                          <span>({tag.usage_count})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Tabs>

            {/* Custom Tag Input (if enabled) */}
            {allowCustomTags && (
              <div className="border-t pt-4">
                <Label className="text-sm">Create custom tag</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Tag name..."
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const value = e.currentTarget.value.trim();
                        if (value && !selectedTags.includes(value)) {
                          addTag(value);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Tag Count Info */}
      <div className="text-xs text-muted-foreground mt-2">
        {selectedTags.length}/{maxTags} tags selected
      </div>
    </div>
  );
};