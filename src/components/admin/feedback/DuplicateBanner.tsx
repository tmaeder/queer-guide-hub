import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { Copy, ArrowRightLeft } from 'lucide-react';
import type { FeedbackSubmission } from './types';

interface Suggestion {
  partnerId: string;
  suggestionId: string;
  similarity: number;
}

interface Props {
  current: FeedbackSubmission;
  suggestions: Suggestion[];
  itemsById: Record<string, FeedbackSubmission>;
  onOpenPartner: (partnerId: string) => void;
  onMerge: (args: { duplicateId: string; canonicalId: string; suggestionId: string }) => void;
  onDismiss: (suggestionId: string) => void;
}

/**
 * Rendered at the top of the drawer when the current submission has one or
 * more open duplicate suggestions. The admin chooses which submission is the
 * canonical one; the other becomes `duplicate_of` the canonical.
 */
export function DuplicateBanner({
  current,
  suggestions,
  itemsById,
  onOpenPartner,
  onMerge,
  onDismiss,
}: Props) {
  if (suggestions.length === 0) return null;

  return (
    <Box
      sx={{
        mb: 2,
        p: 1.5,
        borderLeft: 3,
        borderColor: '#f59e0b',
        bgcolor: 'rgba(245, 158, 11, 0.08)',
        borderRadius: 1,
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}>
        <Copy size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
        {suggestions.length === 1
          ? 'Possible duplicate'
          : `${suggestions.length} possible duplicates`}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {suggestions.map((s) => {
          const partner = itemsById[s.partnerId];
          const pct = Math.round(s.similarity * 100);
          return (
            <Box
              key={s.suggestionId}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  onClick={() => onOpenPartner(s.partnerId)}
                  sx={{
                    cursor: 'pointer',
                    textDecoration: 'underline dotted',
                    textDecorationColor: 'var(--muted-foreground)',
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.8rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {partner?.data?.title ?? `#${s.partnerId.slice(0, 8)}`}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {pct}% match
                </Typography>
              </Box>

              <Button
                size="small"
                variant="outlined"
                onClick={() =>
                  onMerge({
                    duplicateId: current.id,
                    canonicalId: s.partnerId,
                    suggestionId: s.suggestionId,
                  })
                }
                sx={{ textTransform: 'none', fontSize: '0.7rem' }}
              >
                This is a dup of that
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<ArrowRightLeft size={12} />}
                onClick={() =>
                  onMerge({
                    duplicateId: s.partnerId,
                    canonicalId: current.id,
                    suggestionId: s.suggestionId,
                  })
                }
                sx={{ textTransform: 'none', fontSize: '0.7rem', bgcolor: '#f59e0b' }}
              >
                That's a dup of this
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={() => onDismiss(s.suggestionId)}
                sx={{ textTransform: 'none', fontSize: '0.7rem' }}
              >
                Not a dup
              </Button>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
