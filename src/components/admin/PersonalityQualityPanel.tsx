import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, ShieldCheck } from 'lucide-react';
import { usePersonalityQualitySummary } from '@/hooks/usePersonalityQualitySummary';
import { AdminStat } from '@/components/admin/primitives/AdminStat';

/**
 * Compact health summary for the Personality Truth Engine: publishable backlog,
 * adult consent candidates, needs-review / low-completeness counts, plus the top
 * coverage gaps surfaced by run_personality_coverage_radar().
 */
export function PersonalityQualityPanel() {
  const { data } = usePersonalityQualitySummary();
  if (!data) return null;
  const {
    gaps,
    publicCount,
    needsAttention,
    reviewOpen,
    lowCompleteness,
    promotable,
    adultConsentCandidates,
    unsupportedPublicClaims,
    invalidPublicImages,
    pendingWithoutQueue,
    openTagReviews,
    cohorts,
  } = data;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ShieldCheck size={16} />
          Personality quality
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <AdminStat label="Public" value={publicCount} />
          <AdminStat label="Promotable (auto-gate)" value={promotable} />
          <AdminStat label="Adult consent candidates" value={adultConsentCandidates} />
          <AdminStat label="Pending review" value={reviewOpen} hardFail={reviewOpen > 0} />
          <AdminStat label="Needs review" value={needsAttention} />
          <AdminStat label="Low completeness" value={lowCompleteness} />
          <AdminStat
            label="Unsupported public claims"
            value={unsupportedPublicClaims}
            hardFail={unsupportedPublicClaims > 0}
          />
          <AdminStat
            label="Invalid public images"
            value={invalidPublicImages}
            hardFail={invalidPublicImages > 0}
          />
          <AdminStat
            label="Pending without queue"
            value={pendingWithoutQueue}
            hardFail={pendingWithoutQueue > 0}
          />
          <AdminStat label="Open tag reviews" value={openTagReviews} />
        </div>

        {cohorts.length > 0 && (
          <div>
            <div className="mb-2 text-13 text-muted-foreground">Quality by cohort</div>
            <div className="flex flex-wrap gap-2">
              {cohorts.map((cohort) => (
                <Badge key={cohort.cohort} variant="outline" className="font-normal">
                  {cohort.cohort} · {cohort.average_quality} avg · {cohort.hard_gate_failures} gated
                </Badge>
              ))}
            </div>
          </div>
        )}

        {gaps.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-13 text-muted-foreground">
              <Users size={12} />
              Coverage gaps — emptiest profiles to enrich
            </div>
            <div className="flex flex-wrap gap-2">
              {gaps.map((g) => (
                <Badge
                  key={g.personality_id}
                  variant="outline"
                  className="font-normal"
                  title={(g.missing_fields ?? []).join(', ')}
                >
                  {g.personality_name ?? 'Unknown'} · {g.gap_score}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
