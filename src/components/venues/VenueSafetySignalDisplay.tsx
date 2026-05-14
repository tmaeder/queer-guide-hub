import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useVenueSafetyScore } from '@/hooks/useVenueSafetySignals';
import { VenueSafetySignalPrompt } from './VenueSafetySignalPrompt';

interface Props {
  venueId: string;
}

export function VenueSafetySignalDisplay({ venueId }: Props) {
  const { data, isLoading } = useVenueSafetyScore(venueId);
  const { user } = useAuth();
  const [promptOpen, setPromptOpen] = useState(false);

  const visible = (data ?? []).filter((r) => r.n_responses >= 3 && r.score !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Visitor signals
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {!isLoading && visible.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No signals yet. Be the first to share what this place was like.
          </p>
        )}

        {visible.map((row) => {
          const pct = Math.round((row.score ?? 0) * 100);
          const lo = Math.round((row.confidence_low ?? 0) * 100);
          const hi = Math.round((row.confidence_high ?? 0) * 100);
          return (
            <div key={row.question_slug} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm">{row.prompt}</p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {pct}% yes · {row.n_responses}
                </span>
              </div>
              <ConfidenceBar pct={pct} lo={lo} hi={hi} />
            </div>
          );
        })}

        <p className="text-xs text-muted-foreground">
          Recency-weighted, 90-day half-life. Older answers fade automatically.
        </p>

        {user && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setPromptOpen(true)}
          >
            Were you here?
          </Button>
        )}

        <VenueSafetySignalPrompt
          venueId={venueId}
          open={promptOpen}
          onOpenChange={setPromptOpen}
        />
      </CardContent>
    </Card>
  );
}

function ConfidenceBar({ pct, lo, hi }: { pct: number; lo: number; hi: number }) {
  const safeLo = Math.max(0, Math.min(lo, 100));
  const safeHi = Math.max(safeLo, Math.min(hi, 100));
  return (
    <div
      className="relative h-2 w-full rounded-full bg-muted overflow-hidden"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="absolute top-0 bottom-0 bg-foreground/20"
        style={{ left: `${safeLo}%`, width: `${Math.max(1, safeHi - safeLo)}%` }}
      />
      <div
        className="absolute top-0 bottom-0 w-[2px] bg-foreground"
        style={{ left: `calc(${pct}% - 1px)` }}
      />
    </div>
  );
}
