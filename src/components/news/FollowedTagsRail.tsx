import { useState } from 'react';
import { useFollowedTags } from '@/hooks/useFollowedTags';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Rss, X, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatNewsTag } from '@/lib/newsTags';
import { useAuth } from '@/hooks/useAuth';

interface TagOption {
  id: string;
  name: string;
  slug: string | null;
}

interface FollowedTagsRailProps {
  onFilterByTag?: (tag: string) => void;
}

export function FollowedTagsRail({ onFilterByTag }: FollowedTagsRailProps) {
  const { user } = useAuth();
  const { followedTags, toggleFollow } = useFollowedTags();
  const [searchOpen, setSearchOpen] = useState(false);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const handleSearchTags = async (q: string) => {
    if (!q.trim()) {
      setTagOptions([]);
      return;
    }
    setSearchLoading(true);
    try {
      const { data } = await supabase
        .from('unified_tags')
        .select('id, name, slug')
        .ilike('name', `%${q}%`)
        .eq('is_active', true)
        .limit(10);
      setTagOptions((data as TagOption[]) ?? []);
    } catch {
      /* best-effort */
    } finally {
      setSearchLoading(false);
    }
  };

  if (!user) return null;
  if (followedTags.length === 0 && !searchOpen) {
    return (
      <div className="flex flex-col gap-2 mt-4">
        <p className="text-xs text-muted-foreground">Follow tags to build your feed.</p>
        <FollowTagButton
          open={searchOpen}
          onOpenChange={setSearchOpen}
          tagOptions={tagOptions}
          searchLoading={searchLoading}
          onSearchTags={handleSearchTags}
          onFollow={(tag) => toggleFollow(tag)}
          followedIds={followedTags.map((t) => t.tagId)}
        />
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Rss size={14} />
          Followed Topics
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {followedTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {followedTags.map((tag) => (
              <Badge
                key={tag.tagId}
                variant="default"
                style={{ fontSize: '0.7rem' }}
                className="flex items-center gap-1 cursor-pointer"
                onClick={() => onFilterByTag?.(tag.slug || tag.name)}
              >
                {formatNewsTag(tag.name)}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFollow({ tagId: tag.tagId, name: tag.name, slug: tag.slug });
                  }}
                  className="ml-0.5 opacity-70 hover:opacity-100"
                  aria-label={`Unfollow ${tag.name}`}
                >
                  <X size={10} />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {followedTags.length > 0 && onFilterByTag && (
          <Button
            variant="outline"
            size="sm"
            style={{ width: '100%', fontSize: '0.75rem' }}
            onClick={() => {
              const slugs = followedTags.map((t) => t.slug || t.name);
              if (slugs.length > 0) onFilterByTag(slugs[0]);
            }}
          >
            <Rss size={12} className="mr-1" />
            Your tag feed
          </Button>
        )}

        <FollowTagButton
          open={searchOpen}
          onOpenChange={setSearchOpen}
          tagOptions={tagOptions}
          searchLoading={searchLoading}
          onSearchTags={handleSearchTags}
          onFollow={(tag) => toggleFollow(tag)}
          followedIds={followedTags.map((t) => t.tagId)}
        />
      </CardContent>
    </Card>
  );
}

function FollowTagButton({
  open,
  onOpenChange,
  tagOptions,
  searchLoading,
  onSearchTags,
  onFollow,
  followedIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tagOptions: TagOption[];
  searchLoading: boolean;
  onSearchTags: (q: string) => void;
  onFollow: (tag: { tagId: string; name: string; slug: string | null }) => void;
  followedIds: string[];
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" style={{ fontSize: '0.75rem', justifyContent: 'flex-start', padding: '0 4px' }}>
          <Plus size={12} className="mr-1" />
          Follow a topic
        </Button>
      </PopoverTrigger>
      <PopoverContent style={{ padding: 0, width: 240 }} align="start">
        <Command>
          <CommandInput
            placeholder="Search topics…"
            onValueChange={onSearchTags}
          />
          <CommandList>
            {searchLoading && (
              <CommandEmpty>Searching…</CommandEmpty>
            )}
            {!searchLoading && tagOptions.length === 0 && (
              <CommandEmpty>No topics found.</CommandEmpty>
            )}
            {tagOptions.map((tag) => (
              <CommandItem
                key={tag.id}
                value={tag.name}
                onSelect={() => {
                  onFollow({ tagId: tag.id, name: tag.name, slug: tag.slug });
                  onOpenChange(false);
                }}
                className="flex items-center justify-between"
              >
                <span>{formatNewsTag(tag.name)}</span>
                {followedIds.includes(tag.id) && (
                  <span className="text-xs text-muted-foreground">Following</span>
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
