import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Badge } from '@/components/ui/badge';
import { Tag, ChevronRight } from 'lucide-react';
import { getCategoryShortName } from './categoryMeta';
import type { CentralizedTag } from '@/hooks/useCentralizedTags';

type DisplayMode = 'chips' | 'grid' | 'list';

interface TagListRendererProps {
  tags: CentralizedTag[];
  displayMode: DisplayMode;
  tagUsageCounts: Record<string, number>;
  onTagClick: (tag: CentralizedTag) => void;
}

function getTagCategoryLabel(tag: CentralizedTag): string {
  return getCategoryShortName(tag.categories?.[0]?.name || tag.category || '');
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
          gap: 2,
        }}
      >
        {tags.map((tag) => (
          <Box
            key={tag.id}
            onClick={() => onTagClick(tag)}
            sx={{
              borderRadius: 2,
              cursor: 'pointer',
              overflow: 'hidden',
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': {
                borderColor: 'primary.main',
                transform: 'translateY(-2px)',
                boxShadow: 2,
              },
              transition: 'all 0.2s',
            }}
          >
            <Box
              sx={{ width: '100%', height: 120, bgcolor: 'secondary.main', position: 'relative' }}
            >
              {tag.image_url ? (
                <Box
                  component="img"
                  src={tag.image_url}
                  alt={tag.name}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                  }}
                >
                  <Tag style={{ width: 32, height: 32, opacity: 0.2 }} />
                </Box>
              )}
            </Box>
            <Box sx={{ p: 1.5 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tag.name}
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mt: 0.5,
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: '0.7rem', textTransform: 'capitalize' }}
                >
                  {getTagCategoryLabel(tag)}
                </Typography>
                {(tagUsageCounts[tag.name] || 0) > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    {tagUsageCounts[tag.name]} uses
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  if (displayMode === 'list') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {tags.map((tag) => (
          <Box
            key={tag.id}
            onClick={() => onTagClick(tag)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 2,
              py: 1.25,
              borderRadius: 2,
              cursor: 'pointer',
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'secondary.main' },
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
                  bgcolor: 'secondary.main',
                }}
              >
                <Box
                  component="img"
                  src={tag.image_url}
                  alt={tag.name}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                {tag.name}
              </Typography>
              {tag.description && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    fontSize: '0.75rem',
                  }}
                >
                  {tag.description}
                </Typography>
              )}
            </Box>
            <Badge variant="secondary" style={{ textTransform: 'capitalize', flexShrink: 0 }}>
              {getTagCategoryLabel(tag)}
            </Badge>
            {(tagUsageCounts[tag.name] || 0) > 0 && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ flexShrink: 0, fontSize: '0.75rem' }}
              >
                {tagUsageCounts[tag.name]} uses
              </Typography>
            )}
            <ChevronRight style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.4 }} />
          </Box>
        ))}
      </Box>
    );
  }

  // Default: chips view
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {tags.map((tag) => (
        <Box
          key={tag.id}
          onClick={() => onTagClick(tag)}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.5,
            py: 0.75,
            borderRadius: 2,
            cursor: 'pointer',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'secondary.main' },
            transition: 'all 0.15s',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
            {tag.name}
          </Typography>
          {(tagUsageCounts[tag.name] || 0) > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              {tagUsageCounts[tag.name]}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}
