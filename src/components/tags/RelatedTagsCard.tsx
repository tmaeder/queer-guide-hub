import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSimilarTags } from '@/hooks/useTagRelationships';
import { Network } from 'lucide-react';

interface RelatedTagsCardProps {
  tagId: string;
  onTagClick: (tag: { name: string; id: string }) => void;
}

export function RelatedTagsCard({ tagId, onTagClick }: RelatedTagsCardProps) {
  const { data: similarTags, isLoading } = useSimilarTags(tagId, 10);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Network style={{ width: 18, height: 18 }} />
              Related Tags
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: 28 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: 'action.hover',
                    flexShrink: 0,
                  }}
                />
                <Box sx={{ flex: 1, height: 12, borderRadius: 1, bgcolor: 'action.hover' }} />
                <Box sx={{ width: 36, height: 12, borderRadius: 1, bgcolor: 'action.hover' }} />
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (!similarTags || similarTags.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Network style={{ width: 18, height: 18 }} />
              Related Tags
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            No related tags found yet.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const maxScore = Math.max(...similarTags.map((t) => t.similarity_score));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Network style={{ width: 18, height: 18 }} />
            Related Tags
          </Box>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {similarTags.map((tag) => {
            const pct = maxScore > 0 ? (tag.similarity_score / maxScore) * 100 : 0;

            return (
              <Box
                key={tag.tag_id}
                component="button"
                onClick={() => onTagClick({ name: tag.name, id: tag.tag_id })}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 0,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  borderRadius: 1,
                  py: 0.5,
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <Box
                  sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }}
                  style={{ backgroundColor: '#6366f1' }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: '0.8rem',
                      '&:hover': { color: 'primary.main' },
                    }}
                  >
                    {tag.name}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    sx={{
                      height: 3,
                      borderRadius: 1,
                      mt: 0.25,
                      bgcolor: 'action.hover',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: '#6366f1',
                        borderRadius: 1,
                      },
                    }}
                  />
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ flexShrink: 0, fontSize: '0.7rem', minWidth: 32, textAlign: 'right' }}
                >
                  {Math.round(tag.similarity_score * 100)}%
                </Typography>
              </Box>
            );
          })}
        </Box>
        {similarTags.length > 0 && similarTags[0].relationship_type !== 'category' && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1.5, fontSize: '0.7rem' }}
          >
            Based on semantic similarity
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
