import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Sparkles, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  useTripSafetyBriefing,
  useGenerateTripSafetyBriefing,
} from '@/hooks/useTripSafetyNarrative';

interface Props {
  tripId: string;
  /** When true, the generate CTA is shown (owner/members only). */
  canGenerate?: boolean;
}

/**
 * AI narrative safety briefing — 3-4 sentence synthesis of country
 * equality data + recent LGBTQ+-relevant news. Cached per trip for
 * 7 days; refresh forces regeneration.
 */
export function AiSafetyNarrativeCard({ tripId, canGenerate }: Props) {
  const { data: briefing, isLoading } = useTripSafetyBriefing(tripId);
  const generate = useGenerateTripSafetyBriefing();

  const handleGenerate = (refresh: boolean) => {
    generate.mutate({ tripId, refresh });
  };

  if (isLoading) return null;

  if (!briefing) {
    if (!canGenerate) return null;
    return (
      <Box
        sx={{
          p: 2.5,
          mb: 3,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
        }}
      >
        <Sparkles style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            AI safety briefing
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
            Generate a plain-language summary synthesizing country data and recent news for this trip.
          </Typography>
          <Button
            size="sm"
            onClick={() => handleGenerate(false)}
            disabled={generate.isPending}
          >
            {generate.isPending ? 'Generating…' : 'Generate briefing'}
          </Button>
          {generate.isError && (
            <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.75 }}>
              Could not generate briefing.
            </Typography>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 2.5,
        mb: 3,
        bgcolor: 'action.hover',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
      }}
    >
      <Sparkles style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            AI safety briefing
          </Typography>
          {canGenerate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleGenerate(true)}
              disabled={generate.isPending}
              className="h-7 px-2 text-xs gap-1"
              aria-label="Regenerate briefing"
            >
              <RefreshCw size={12} />
              {generate.isPending ? '…' : 'Refresh'}
            </Button>
          )}
        </Box>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
          {briefing.narrative}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Synthesized from {briefing.article_count} recent article{briefing.article_count === 1 ? '' : 's'} • generated{' '}
          {formatDistanceToNow(new Date(briefing.generated_at), { addSuffix: true })}
        </Typography>
      </Box>
    </Box>
  );
}
