import { Eye, MapPin, Compass, Shield, ShieldCheck } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePublicTier, type TrustTier } from '@/hooks/useTrustTier';

const ICONS: Record<TrustTier, typeof Eye> = {
  visitor: Eye,
  local: MapPin,
  scout: Compass,
  steward: Shield,
  guardian: ShieldCheck,
};

const LABEL: Record<TrustTier, string> = {
  visitor: 'Visitor',
  local: 'Local',
  scout: 'Scout',
  steward: 'Steward',
  guardian: 'Guardian',
};

const DESCRIPTION: Record<TrustTier, string> = {
  // Tiers count contributions. None of them is an identity check or vetting.
  visitor: 'Signed-in member. Tiers reflect contributions, not an identity check.',
  local: 'Has contributed accepted submissions or safety signals.',
  scout: 'Trusted contributor — can mark venues personally visited.',
  steward: 'Reviewed contributions fast-track through moderation.',
  guardian: 'Granted by staff. Early access to new features.',
};

type Props = {
  userId?: string | null;
  tier?: TrustTier;
  showLabel?: boolean;
  className?: string;
};

export function TrustTierBadge({ userId, tier, showLabel = false, className }: Props) {
  const { data } = usePublicTier(tier ? null : userId);
  const resolved: TrustTier = tier ?? data ?? 'visitor';
  if (resolved === 'visitor' && !showLabel) return null;
  const Icon = ICONS[resolved];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A button so keyboard and touch users can open the explanation; a
              bare span with a tooltip was hover-only. min-h-0: the base layer
              gives every button a 44px floor, which would stretch the row. */}
          <button
            type="button"
            className={cn(
              'inline-flex min-h-0 items-center gap-1 rounded-badge text-foreground/80',
              className,
            )}
            aria-label={`Trust tier: ${LABEL[resolved]}. ${DESCRIPTION[resolved]}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {showLabel && <span className="text-xs font-medium">{LABEL[resolved]}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-xs">
            <div className="font-semibold">{LABEL[resolved]}</div>
            <div className="text-muted-foreground">{DESCRIPTION[resolved]}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
