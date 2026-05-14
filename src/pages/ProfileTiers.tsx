import { Eye, MapPin, Compass, Shield, ShieldCheck, Lock } from "lucide-react";
import { Navigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import {
  useMyTier,
  TIER_ORDER,
  TIER_REQUIREMENTS,
  nextTier,
  type TrustTier,
} from "@/hooks/useTrustTier";
import { TrustTierBadge } from "@/components/profile/TrustTierBadge";

const ICONS: Record<TrustTier, typeof Eye> = {
  visitor: Eye,
  local: MapPin,
  scout: Compass,
  steward: Shield,
  guardian: ShieldCheck,
};

const LABEL: Record<TrustTier, string> = {
  visitor: "Visitor",
  local: "Local",
  scout: "Scout",
  steward: "Steward",
  guardian: "Guardian",
};

const PRIVILEGES: Record<TrustTier, string[]> = {
  visitor: ["Sign in. Save favorites. Submit content for review."],
  local: ["Comment without rate-limit caps."],
  scout: [
    "Mark venues as personally visited.",
    "Submissions get a trust signal in the review queue.",
  ],
  steward: [
    "All Scout privileges.",
    "Submissions fast-track through review-gate.",
    "Endorse other members.",
  ],
  guardian: [
    "All Steward privileges.",
    "Early access to new features.",
    "Granted by staff only.",
  ],
};

function progressLine(
  current: number,
  required: number,
  noun: string,
): { line: string; pct: number } | null {
  if (required <= 0) return null;
  const remaining = Math.max(0, required - current);
  const pct = Math.min(100, Math.round((current / required) * 100));
  if (remaining === 0) return { line: `${noun}: complete`, pct };
  return { line: `${remaining} more ${noun} needed`, pct };
}

export default function ProfileTiers() {
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading } = useMyTier();

  if (!authLoading && !user) return <Navigate to="/auth" replace />;
  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  const tier = data.tier;
  const next = nextTier(tier);
  const nextReq = next && next !== "visitor" ? TIER_REQUIREMENTS[next] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Trust tiers</h1>
        <p className="text-sm text-muted-foreground">
          Tiers reflect verified contributions. Counts stay private — only your
          tier label is visible to others.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrustTierBadge tier={tier} showLabel />
            <span className="text-muted-foreground">— your current tier</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {next && nextReq && !nextReq.manual && (
            <div className="space-y-3">
              <div className="text-sm font-medium">
                Progress to {LABEL[next]}
              </div>
              {(
                [
                  progressLine(
                    data.submissions_accepted,
                    nextReq.submissions,
                    "accepted submissions",
                  ),
                  progressLine(
                    data.safety_validated,
                    nextReq.safety,
                    "validated safety reports",
                  ),
                  progressLine(
                    data.endorsements_received,
                    nextReq.endorsements,
                    "peer endorsements",
                  ),
                ].filter(Boolean) as { line: string; pct: number }[]
              ).map((row, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-xs text-muted-foreground">{row.line}</div>
                  <Progress value={row.pct} className="h-1.5" />
                </div>
              ))}
            </div>
          )}
          {next && nextReq?.manual && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" aria-hidden />
              Guardian is granted by staff.
            </div>
          )}
          {!next && (
            <div className="text-sm text-muted-foreground">
              You're at the top tier. Thank you.
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">The ladder</h2>
        <div className="space-y-3">
          {TIER_ORDER.map((t) => {
            const Icon = ICONS[t];
            const active = t === tier;
            return (
              <div
                key={t}
                className={
                  "flex gap-4 rounded-lg border p-4 " +
                  (active ? "border-foreground" : "border-border")
                }
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <div className="space-y-1">
                  <div className="font-medium">{LABEL[t]}</div>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                    {PRIVILEGES[t].map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
