import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { useSimilarTags } from '@/hooks/useTagRelationships';
import { ArrowRight } from 'lucide-react';

interface RelatedTagsCardProps {
  tagId: string;
  onTagClick: (tag: { name: string; id: string }) => void;
}

export function RelatedTagsCard({ tagId, onTagClick }: RelatedTagsCardProps) {
  const { data: similarTags, isLoading } = useSimilarTags(tagId, 10);

  if (isLoading) {
    return (
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 1.5 }}>Related</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rounded" width={80 + i * 10} height={30} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      </Box>
    );
  }

  if (!similarTags || similarTags.length === 0) return null;

  return (
    <Box>
      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 1.5 }}>Related</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {similarTags.map((tag) => (
          <Box
            key={tag.tag_id}
            component="button"
            onClick={() => onTagClick({ name: tag.name, id: tag.tag_id })}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.25,
              py: 0.75,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              background: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              bgcolor: 'background.paper',
              transition: 'all 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'action.hover',
              },
            }}
          >
            <Typography
              sx={{
                flex: 1,
                fontWeight: 500,
                fontSize: '0.8rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {tag.name}
            </Typography>
            <ArrowRight style={{ width: 14, height: 14, opacity: 0.25, flexShrink: 0 }} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
