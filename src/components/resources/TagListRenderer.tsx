import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';
import { getCategoryShortName } from './categoryMeta';
import { TagChip } from '@/components/tags/TagChip';
import type { CentralizedTag } from '@/hooks/useCentralizedTags';
import { getFallbackImage } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

type DisplayMode = 'chips' | 'grid' | 'list';

interface TagListRendererProps {
  tags: CentralizedTag[];
  displayMode: DisplayMode;
  tagUsageCounts: Record<string, number>;
  onTagClick: (tag: CentralizedTag) => void;
}

function getPrimary(tag: CentralizedTag) {
  const cats = tag.categories || [];
  return cats.find((c) => c.is_primary) ?? cats[0];
}

function getTagCategoryLabel(tag: CentralizedTag): string {
  const primary = getPrimary(tag);
  return primary ? getCategoryShortName(primary.name) : '';
}

export function TagListRenderer({
  tags,
  displayMode,
  tagUsageCounts,
  onTagClick,
}: TagListRendererProps) {
  if (tags.length === 0) return null;

  if (displayMode === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {tags.map((tag) => {
          const uses = tagUsageCounts[tag.name] || 0;
          const fallback = getFallbackImage('default', tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onTagClick(tag)}
              className="flex flex-col overflow-hidden rounded-element bg-background border border-border cursor-pointer text-left p-0 transition-colors hover:border-primary hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline focus-visible:outline-primary focus-visible:outline-offset-2"
              style={{ font: 'inherit', color: 'inherit' }}
            >
              <div className="relative w-full bg-muted" style={{ aspectRatio: '4 / 3' }}>
                <img
                  src={isValidImageUrl(tag.image_url) ? tag.image_url : fallback}
                  alt={tag.name}
                  role="presentation"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    if ((e.target as HTMLImageElement).src !== fallback) (e.target as HTMLImageElement).src = fallback;
                  }}
                />
                {uses > 0 && (
                  <div
                    className="absolute top-1.5 right-1.5 rounded text-white font-semibold"
                    style={{
                      padding: '1px 6px',
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      fontSize: '0.65rem',
                    }}
                  >
                    {uses}
                  </div>
                )}
              </div>
              <div className="p-2.5 flex flex-col gap-0.5" style={{ minHeight: 56 }}>
                <span
                  className="font-semibold truncate"
                  style={{ fontSize: '0.825rem', lineHeight: 1.25 }}
                >
                  {tag.name}
                </span>
                <span className="text-muted-foreground truncate" style={{ fontSize: '0.7rem' }}>
                  {getTagCategoryLabel(tag)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  if (displayMode === 'list') {
    return (
      <div className="flex flex-col gap-1">
        {tags.map((tag) => {
          const uses = tagUsageCounts[tag.name] || 0;
          const fallback = getFallbackImage('default', tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onTagClick(tag)}
              className="flex items-center gap-4 px-4 py-2 rounded-element cursor-pointer bg-background border border-border text-left transition-all hover:border-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline focus-visible:outline-primary"
              style={{ minHeight: 44, font: 'inherit', color: 'inherit' }}
            >
              <div
                className="rounded-element overflow-hidden shrink-0 bg-muted"
                style={{ width: 40, height: 40 }}
              >
                <img
                  src={isValidImageUrl(tag.image_url) ? tag.image_url : fallback}
                  alt={tag.name}
                  role="presentation"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    if ((e.target as HTMLImageElement).src !== fallback) (e.target as HTMLImageElement).src = fallback;
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className="font-semibold block"
                  style={{ fontSize: '0.85rem', lineHeight: 1.25 }}
                >
                  {tag.name}
                </span>
                <span
                  className="block truncate text-muted-foreground"
                  style={{ fontSize: '0.7rem' }}
                >
                  {tag.description || getTagCategoryLabel(tag)}
                </span>
              </div>
              {uses > 0 && (
                <span
                  className="shrink-0 hidden sm:block text-muted-foreground"
                  style={{ fontSize: '0.7rem' }}
                >
                  {uses} uses
                </span>
              )}
              <Badge variant="secondary" className="shrink-0">
                {getTagCategoryLabel(tag)}
              </Badge>
              <ChevronRight size={14} style={{ opacity: 0.4 }} className="shrink-0" />
            </button>
          );
        })}
      </div>
    );
  }

  // Chips — TagChip renders as <a> so a single click navigates and
  // modifier-clicks (cmd/ctrl, middle-click) open in a new tab (P1-3).
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag.slug || tag.name}
          name={tag.name}
          count={tagUsageCounts[tag.name] || 0}
          icon
        />
      ))}
    </div>
  );
}
