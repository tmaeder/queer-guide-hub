import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs } from '@/components/ui/tabs';
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
  _categories,
  className
}: TagSelectorProps) => {
  const {
    allTags,
    tagsByCategory,
    searchTags
  } = useCentralizedTags();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CentralizedTag[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      const results = await searchTags(query, activeCategory === 'all' ? undefined : activeCategory);
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
  // Filter out the placeholder "none"/empty rows that leaked in from
  // legacy ingestion. They have no semantic value as a filter facet.
  const dropEmpty = <T extends { name?: string | null }>(tags: T[]): T[] =>
    tags.filter((t) => t.name && t.name.toLowerCase() !== 'none');

  const getTagsToShow = () => {
    if (searchQuery.trim() && searchResults.length > 0) {
      return dropEmpty(searchResults);
    }
    if (activeCategory === 'all') {
      return dropEmpty(allTags).slice(0, 50);
    }
    return dropEmpty(
      tagsByCategory.find(cat => cat.category === activeCategory)?.tags || [],
    );
  };
  return <div className={className}>
      <Label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Tags</Label>

      {/* Selected Tags */}
      {selectedTags.length > 0 && <div className="flex flex-wrap gap-2 mt-2 mb-3">
          {selectedTags.map(tagName => {
        const tag = allTags.find(t => t.name === tagName);
        return <Badge key={tagName} variant="secondary" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          paddingRight: 4,
          ...(tag ? {
            backgroundColor: `${tag.color}20`,
            borderColor: tag.color
          } : {})
        }}>
                <TagIcon style={{ height: 12, width: 12 }} />
                {tagName}
                <Button variant="ghost" size="sm" style={{ height: 16, width: 16, padding: 0 }} onClick={() => removeTag(tagName)}>
                  <X style={{ height: 12, width: 12 }} />
                </Button>
              </Badge>;
      })}
        </div>}

      {/* Tag Selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} style={{ width: '100%', justifyContent: 'space-between' }} disabled={selectedTags.length >= maxTags}>
            <span className="flex items-center gap-2">
              <Plus style={{ height: 16, width: 16 }} />
              {selectedTags.length >= maxTags ? `Maximum ${maxTags} tags selected` : placeholder}
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent style={{ width: '100%', padding: 0 }} align="start">
          <div className="p-4 flex flex-col gap-4">
            {/* Search */}
            <div className="relative">
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
              <Input placeholder="Search tags..." value={searchQuery} onChange={e => handleSearch(e.target.value)} style={{ paddingLeft: 36 }} />
            </div>

            {/* Category Tabs */}
            <Tabs value={activeCategory} onValueChange={setActiveCategory}>


              <ScrollArea style={{ height: 300, marginTop: 16 }}>
                <div className="flex flex-col gap-2">
                  {getTagsToShow().map(tag => <div
                    key={tag.id}
                    className={`flex items-center justify-between p-2 cursor-pointer transition-colors ${selectedTags.includes(tag.name) ? 'bg-primary/10' : 'hover:bg-muted'}`}
                    onClick={() => addTag(tag.name)}
                  >
                      <div className="flex items-center gap-2 flex-1">
                        <div style={{ width: 12, height: 12, backgroundColor: tag.color }} />
                        <div className="flex-1">
                          <p className="font-medium" style={{ fontSize: '0.875rem' }}>{tag.name}</p>
                          {tag.description && <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                              {tag.description}
                            </p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                        <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                          {tag.category}
                        </Badge>
                        {tag.usage_count > 0 && <span>({tag.usage_count})</span>}
                      </div>
                    </div>)}
                </div>
              </ScrollArea>
            </Tabs>

            {/* Custom Tag Input (if enabled) */}
            {allowCustomTags && <div className="pt-4">
                <Label style={{ fontSize: '0.875rem' }}>Create custom tag</Label>
                <div className="flex gap-2 mt-2">
                  <Input placeholder="Tag name..." onKeyPress={e => {
                if (e.key === 'Enter') {
                  const value = e.currentTarget.value.trim();
                  if (value && !selectedTags.includes(value)) {
                    addTag(value);
                    e.currentTarget.value = '';
                  }
                }
              }} />
                </div>
              </div>}
          </div>
        </PopoverContent>
      </Popover>

      {/* Tag Count Info */}
      <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: 4 }}>
        {selectedTags.length}/{maxTags} tags selected
      </p>
    </div>;
};
