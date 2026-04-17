import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { useSimilarTags } from '@/hooks/useTagRelationships';
import { Badge } from '@/components/ui/badge';

interface RelatedTagsCardProps {
  tagId: string;
  onTagClick: (tag: { name: string; id: string }) => void;
}

export function RelatedTagsCard({ tagId, onTagClick }: RelatedTagsCardProps) {
  const { data: similarTags, isLoading } = useSimilarTags(tagId, 10);

  if (isLoading) {
    return (
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 2 }}>
          Related
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="rounded" width={70 + i * 12} height={32} sx={{ borderRadius: 4 }} />
          ))}
        </Box>
      </Box>
    );
  }

  if (!similarTags || similarTags.length === 0) return null;

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 2 }}>
        Related
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {similarTags.map((tag) => (
          <Badge
            key={tag.tag_id}
            variant="outline"

            onClick={() => onTagClick({ name: tag.name, id: tag.tag_id })}
          >
            {tag.name}
          </Badge>
        ))}
      </Box>
    </Box>
  );
}
