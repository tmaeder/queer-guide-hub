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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {tags.map((tag) => {
          const CatIcon = getCategoryIcon(getTagCategoryName(tag));
          const uses = tagUsageCounts[tag.name] || 0;
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onTagClick(tag)}
              className="flex flex-col overflow-hidden rounded-lg bg-background border border-border cursor-pointer text-left p-0 transition-all hover:border-primary hover:-translate-y-0.5 hover:shadow focus-visible:outline-2 focus-visible:outline focus-visible:outline-primary focus-visible:outline-offset-2"
              style={{ font: 'inherit', color: 'inherit' }}
            >
              <div className="relative w-full bg-muted" style={{ aspectRatio: '4 / 3' }}>
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
                <span
                  className="text-muted-foreground truncate"
                  style={{ fontSize: '0.7rem' }}
                >
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
              type="button"
              onClick={() => onTagClick(tag)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer bg-background border border-border text-left transition-all hover:border-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline focus-visible:outline-primary"
              style={{ minHeight: 44, font: 'inherit', color: 'inherit' }}
            >
              {tag.image_url && (
                <div className="rounded-md overflow-hidden shrink-0 bg-muted" style={{ width: 40, height: 40 }}>
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
                <span className="font-semibold block" style={{ fontSize: '0.85rem', lineHeight: 1.25 }}>
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
            type="button"
            onClick={() => onTagClick(tag)}
            className="inline-flex items-center gap-1.5 rounded-full cursor-pointer bg-background border border-border transition-all hover:border-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline focus-visible:outline-primary"
            style={{ minHeight: 36, padding: '6px 12px', font: 'inherit', color: 'inherit' }}
          >
            <Tag style={{ width: 12, height: 12, opacity: 0.55 }} />
            <span style={{ fontWeight: 500, fontSize: '0.78rem' }}>{tag.name}</span>
            {uses > 0 && (
              <span className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>
                {uses}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
