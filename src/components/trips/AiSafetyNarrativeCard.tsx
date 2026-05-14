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
      <div className="p-5 mb-6 bg-muted flex items-start gap-3">
        <Sparkles style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold mb-1">AI safety briefing</p>
          <span className="block text-xs text-muted-foreground mb-3">
            Generate a plain-language summary synthesizing country data and recent news for this trip.
          </span>
          <Button
            size="sm"
            onClick={() => handleGenerate(false)}
            disabled={generate.isPending}
          >
            {generate.isPending ? 'Generating…' : 'Generate briefing'}
          </Button>
          {generate.isError && (
            <span className="block mt-2 text-xs text-destructive">
              Could not generate briefing.
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 mb-6 bg-muted flex items-start gap-3">
      <Sparkles style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1 gap-2">
          <p className="text-sm font-bold">AI safety briefing</p>
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
        </div>
        <p className="text-sm whitespace-pre-wrap" style={{ lineHeight: 1.55 }}>
          {briefing.narrative}
        </p>
        <span className="block mt-2 text-xs text-muted-foreground">
          Synthesized from {briefing.article_count} recent article{briefing.article_count === 1 ? '' : 's'} • generated{' '}
          {formatDistanceToNow(new Date(briefing.generated_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}
