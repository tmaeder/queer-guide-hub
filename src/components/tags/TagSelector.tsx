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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
  const getTagsToShow = () => {
    if (searchQuery.trim() && searchResults.length > 0) {
      return searchResults;
    }
    if (activeCategory === 'all') {
      return allTags.slice(0, 50); // Limit for performance
    }
    return tagsByCategory.find(cat => cat.category === activeCategory)?.tags || [];
  };
  return <Box className={className}>
      <Label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Tags</Label>

      {/* Selected Tags */}
      {selectedTags.length > 0 && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1, mb: 1.5 }}>
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
        </Box>}

      {/* Tag Selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} style={{ width: '100%', justifyContent: 'space-between' }} disabled={selectedTags.length >= maxTags}>
            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Plus style={{ height: 16, width: 16 }} />
              {selectedTags.length >= maxTags ? `Maximum ${maxTags} tags selected` : placeholder}
            </Box>
          </Button>
        </PopoverTrigger>

        <PopoverContent style={{ width: '100%', padding: 0 }} align="start">
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Search */}
            <Box sx={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
              <Input placeholder="Search tags..." value={searchQuery} onChange={e => handleSearch(e.target.value)} style={{ paddingLeft: 36 }} />
            </Box>

            {/* Category Tabs */}
            <Tabs value={activeCategory} onValueChange={setActiveCategory}>


              <ScrollArea style={{ height: 300, marginTop: 16 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {getTagsToShow().map(tag => <Box key={tag.id} sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1,
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    ...(selectedTags.includes(tag.name)
                      ? { bgcolor: 'rgba(var(--primary-rgb, 59, 130, 246), 0.1)' }
                      : { '&:hover': { bgcolor: 'var(--muted)' } })
                  }} onClick={() => addTag(tag.name)}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <Box style={{ width: 12, height: 12, backgroundColor: tag.color }} />
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontWeight: 500, fontSize: '0.875rem' }}>{tag.name}</Typography>
                          {tag.description && <Typography sx={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                              {tag.description}
                            </Typography>}
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                        <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                          {tag.category}
                        </Badge>
                        {tag.usage_count > 0 && <span>({tag.usage_count})</span>}
                      </Box>
                    </Box>)}
                </Box>
              </ScrollArea>
            </Tabs>

            {/* Custom Tag Input (if enabled) */}
            {allowCustomTags && <Box sx={{ pt: 2 }}>
                <Label style={{ fontSize: '0.875rem' }}>Create custom tag</Label>
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Input placeholder="Tag name..." onKeyPress={e => {
                if (e.key === 'Enter') {
                  const value = e.currentTarget.value.trim();
                  if (value && !selectedTags.includes(value)) {
                    addTag(value);
                    e.currentTarget.value = '';
                  }
                }
              }} />
                </Box>
              </Box>}
          </Box>
        </PopoverContent>
      </Popover>

      {/* Tag Count Info */}
      <Typography sx={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', mt: 1 }}>
        {selectedTags.length}/{maxTags} tags selected
      </Typography>
    </Box>;
};
