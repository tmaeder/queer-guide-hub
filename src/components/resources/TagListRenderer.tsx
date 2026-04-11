import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(3, 1fr)',
            md: 'repeat(4, 1fr)',
            lg: 'repeat(5, 1fr)',
          },
          gap: 1.5,
        }}
      >
        {tags.map((tag) => {
          const CatIcon = getCategoryIcon(getTagCategoryName(tag));
          const uses = tagUsageCounts[tag.name] || 0;
          return (
            <Box
              key={tag.id}
              component="button"
              onClick={() => onTagClick(tag)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: 2,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                textAlign: 'left',
                p: 0,
                font: 'inherit',
                color: 'inherit',
                transition: 'all 0.2s',
                '@media (hover: hover)': {
                  '&:hover': {
                    borderColor: 'primary.main',
                    transform: 'translateY(-2px)',
                    boxShadow: 2,
                  },
                },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 2,
                },
              }}
            >
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '4 / 3',
                  bgcolor: 'action.hover',
                }}
              >
                {tag.image_url ? (
                  <Box
                    component="img"
                    src={tag.image_url}
                    alt={tag.name}
                    loading="lazy"
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CatIcon style={{ width: 28, height: 28, opacity: 0.3 }} />
                  </Box>
                )}
                {uses > 0 && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      px: 0.75,
                      py: 0.125,
                      borderRadius: 1,
                      bgcolor: 'rgba(0,0,0,0.6)',
                      color: 'white',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                    }}
                  >
                    {uses}
                  </Box>
                )}
              </Box>
              <Box sx={{ p: 1.25, minHeight: 56, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                <Typography
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.825rem',
                    lineHeight: 1.25,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontSize: '0.7rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {getTagCategoryLabel(tag)}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  }

  if (displayMode === 'list') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {tags.map((tag) => {
          const uses = tagUsageCounts[tag.name] || 0;
          return (
            <Box
              key={tag.id}
              component="button"
              onClick={() => onTagClick(tag)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                minHeight: 44,
                px: 1.5,
                py: 1,
                borderRadius: 2,
                cursor: 'pointer',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                textAlign: 'left',
                font: 'inherit',
                color: 'inherit',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                transition: 'all 0.15s',
              }}
            >
              {tag.image_url && (
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1.5,
                    overflow: 'hidden',
                    flexShrink: 0,
                    bgcolor: 'action.hover',
                  }}
                >
                  <Box
                    component="img"
                    src={tag.image_url}
                    alt={tag.name}
                    loading="lazy"
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </Box>
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.25 }}>
                  {tag.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: 'block',
                    fontSize: '0.7rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag.description || getTagCategoryLabel(tag)}
                </Typography>
              </Box>
              {uses > 0 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    flexShrink: 0,
                    fontSize: '0.7rem',
                    display: { xs: 'none', sm: 'block' },
                  }}
                >
                  {uses} uses
                </Typography>
              )}
              <Badge variant="secondary" style={{ flexShrink: 0 }}>
                {getTagCategoryLabel(tag)}
              </Badge>
              <ChevronRight style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.4 }} />
            </Box>
          );
        })}
      </Box>
    );
  }

  // Chips
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {tags.map((tag) => {
        const uses = tagUsageCounts[tag.name] || 0;
        return (
          <Box
            key={tag.id}
            component="button"
            onClick={() => onTagClick(tag)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              minHeight: 36,
              px: 1.5,
              py: 0.75,
              borderRadius: 999,
              cursor: 'pointer',
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              font: 'inherit',
              color: 'inherit',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
              transition: 'all 0.15s',
            }}
          >
            <Tag style={{ width: 12, height: 12, opacity: 0.55 }} />
            <Typography sx={{ fontWeight: 500, fontSize: '0.78rem' }}>{tag.name}</Typography>
            {uses > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                {uses}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
