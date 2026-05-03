import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tag, ChevronRight } from 'lucide-react';
import { getCategoryIcon, getCategoryShortName } from './categoryMeta';
import type { CentralizedTag } from '@/hooks/useCentralizedTags';

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

function getTagCategoryName(tag: CentralizedTag): string {
  return getPrimary(tag)?.name || '';
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
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {tags.map((tag) => {
          const CatIcon = getCategoryIcon(getTagCategoryName(tag));
          const uses = tagUsageCounts[tag.name] || 0;
          return (
            <button
              key={tag.id}
              onClick={() => onTagClick(tag)}
              className="flex flex-col overflow-hidden rounded-lg bg-background border border-border cursor-pointer text-left p-0 transition-all hover:[@media(hover:hover)]:border-primary hover:[@media(hover:hover)]:-translate-y-0.5 hover:[@media(hover:hover)]:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            >
              <div className="relative w-full aspect-[4/3] bg-muted">
                {tag.image_url ? (
                  <img
                    src={tag.image_url}
                    alt={tag.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <CatIcon style={{ width: 28, height: 28, opacity: 0.3 }} />
                  </div>
                )}
                {uses > 0 && (
                  <div className="absolute top-1.5 right-1.5 px-1.5 py-px rounded bg-black/60 text-white text-[0.65rem] font-semibold">
                    {uses}
                  </div>
                )}
              </div>
              <div className="p-2.5 min-h-[56px] flex flex-col gap-0.5">
                <p className="font-semibold text-[0.825rem] leading-tight overflow-hidden text-ellipsis whitespace-nowrap">
                  {tag.name}
                </p>
                <span className="text-[0.7rem] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
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
          return (
            <button
              key={tag.id}
              onClick={() => onTagClick(tag)}
              className="flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg cursor-pointer bg-background border border-border text-left transition-all hover:border-primary hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {tag.image_url && (
                <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                  <img
                    src={tag.image_url}
                    alt={tag.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[0.85rem] leading-tight">{tag.name}</p>
                <span className="block text-[0.7rem] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                  {tag.description || getTagCategoryLabel(tag)}
                </span>
              </div>
              {uses > 0 && (
                <span className="hidden sm:block flex-shrink-0 text-[0.7rem] text-muted-foreground">
                  {uses} uses
                </span>
              )}
              <Badge variant="secondary" style={{ flexShrink: 0 }}>
                {getTagCategoryLabel(tag)}
              </Badge>
              <ChevronRight style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.4 }} />
            </button>
          );
        })}
      </div>
    );
  }

  // Chips
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const uses = tagUsageCounts[tag.name] || 0;
        return (
          <button
            key={tag.id}
            onClick={() => onTagClick(tag)}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-full cursor-pointer bg-background border border-border transition-all hover:border-primary hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Tag style={{ width: 12, height: 12, opacity: 0.55 }} />
            <span className="font-medium text-[0.78rem]">{tag.name}</span>
            {uses > 0 && (
              <span className="text-[0.65rem] text-muted-foreground">{uses}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
