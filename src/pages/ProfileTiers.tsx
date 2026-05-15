import { Eye, MapPin, Compass, Shield, ShieldCheck, Lock } from "lucide-react";
import { Navigate } from "react-router";
import { motion } from "motion/react";
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
import { AnimatedBeamConnector } from "@/components/ui/AnimatedBeamConnector";

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
        <div className="h-8 w-40 animate-pulse rounded-element bg-muted" />
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
        <ol className="relative">
          {TIER_ORDER.map((t, i) => {
            const Icon = ICONS[t];
            const active = t === tier;
            const reached = TIER_ORDER.indexOf(tier) >= i;
            const isLast = i === TIER_ORDER.length - 1;
            return (
              <li key={t} className="relative flex gap-4 pb-6 last:pb-0">
                {!isLast && (
                  <AnimatedBeamConnector
                    active={reached && TIER_ORDER.indexOf(tier) > i}
                    className="absolute left-[19px] top-10 h-[calc(100%-1.5rem)] w-px"
                  />
                )}
                <motion.span
                  aria-hidden
                  className={
                    "relative z-10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 " +
                    (reached
                      ? "bg-foreground border-foreground text-background"
                      : "bg-background border-border text-muted-foreground")
                  }
                  animate={
                    active
                      ? { scale: [1, 1.04, 1] }
                      : { scale: 1 }
                  }
                  transition={
                    active
                      ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                      : undefined
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </motion.span>
                <div
                  className={
                    "flex-1 rounded-element border p-4 " +
                    (active ? "border-foreground" : "border-border")
                  }
                >
                  <div className="font-medium flex items-center gap-2">
                    {LABEL[t]}
                    {active && (
                      <span className="text-[10px] tracking-widest uppercase text-muted-foreground">
                        current
                      </span>
                    )}
                  </div>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground mt-1">
                    {PRIVILEGES[t].map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
