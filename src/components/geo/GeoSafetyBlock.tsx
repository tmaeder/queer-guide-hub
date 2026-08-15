import { ShieldCheck, ShieldAlert, ShieldQuestion, Skull } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { GatedContentNotice } from '@/components/safety/GatedContentNotice';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { useTripSafety } from '@/hooks/useTripSafety';
import { getScoreLabel } from '@/utils/equalityScore';
import { cn } from '@/lib/utils';

/**
 * The safety layer, shared by all three geo singles.
 *
 * NOTHING here is restyled into the subway vocabulary, and that is the point.
 * The design system's own rule: track colours "never reach /help, /safety,
 * /report-*, the trip-safety briefing, the equality scale or any risk badge".
 * `--destructive` and the traffic-light palette are the only hues allowed to
 * mean danger, so this module stays monochrome + `--destructive` and composes
 * the existing, unmodified `SafetyAlertBanner` and `GatedContentNotice`.
 *
 * It also deliberately does NOT use `SidebarCard tone="ink"`, even though the
 * spec reserves that inversion for safety blocks: `bg-destructive/10
 * text-destructive` on a flooded-ink ground is unreadable, and a verdict the
 * reader cannot read is worse than an unstyled one.
 */

/**
 * Banner + gated notice. Belongs at the TOP of the body, full width — a
 * criminalisation warning in a 360px rail is a warning the reader scrolls
 * past.
 */
export function GeoSafetyBanner({
  criminalization,
  countryName,
  cityId,
  countryId,
}: {
  criminalization: Record<string, unknown> | null | undefined;
  countryName: string | null | undefined;
  /** Pass exactly one — the gated count is per city OR per country. */
  cityId?: string;
  countryId?: string;
}) {
  return (
    <>
      <SafetyAlertBanner criminalization={criminalization} countryName={countryName ?? ''} />
      <GatedContentNotice cityId={cityId} countryId={countryId} />
    </>
  );
}

/**
 * The verdict tile. Lifted from `CityAtAGlance` so city, country and village
 * state legal risk identically — the previous three-way divergence (city had
 * this tile, country had `SafetyVerdict`, village had nothing at all) is how
 * villages in criminalising countries shipped with no warning.
 *
 * `settled` is load-bearing. Before the country row lands, every flag on the
 * report is false, and the un-gated fallback renders a ShieldCheck with an
 * equality tier — a reassuring tile on exactly the pages that must never
 * reassure. `/country/afghanistan` once showed "Welcoming" beneath its own
 * death-penalty banner for ~30s. Absence of a verdict is the honest render.
 */
export function GeoSafetyVerdict({
  countryId,
  equalityScore,
  rightsHref = '#rights',
  className,
}: {
  countryId: string | null | undefined;
  equalityScore: number | null | undefined;
  /** Omit the jump link by passing null when the page has no rights section. */
  rightsHref?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const report = useTripSafety(countryId ? [countryId] : []);
  const settled = report.status === 'ready' || report.status === 'idle';

  const danger =
    settled && (report.hasDeathPenaltyDestination || report.hasCriminalizedDestination);
  const Icon = !settled
    ? ShieldQuestion
    : report.hasDeathPenaltyDestination
      ? Skull
      : report.hasCriminalizedDestination
        ? ShieldAlert
        : ShieldCheck;
  const label = !settled
    ? t('cities.detail.glance.checkingLaws', 'Checking…')
    : report.hasDeathPenaltyDestination
      ? t('cities.detail.glance.deathPenalty', 'Death penalty')
      : report.hasCriminalizedDestination
        ? t('cities.detail.glance.criminalized', 'Criminalized')
        : equalityScore != null
          ? t('cities.detail.glance.equalityTier', '{{tier}} equality', {
              tier: getScoreLabel(equalityScore).label,
            })
          : t('cities.detail.glance.checkLaws', 'Check local laws');

  const inner = (
    <>
      {/* `block`, not the Eyebrow default `inline-block`: inline-block lets the
          label sit on the same line as the verdict chip, which reads as
          "Safety Criminalized" running together. */}
      <Eyebrow as="div" className="mb-2 block">
        {t('cities.detail.glance.safety', 'Safety')}
      </Eyebrow>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 text-13 font-semibold transition-colors',
          danger
            ? 'bg-destructive/10 text-destructive'
            : 'bg-surface-container-high text-foreground',
        )}
      >
        <Icon size={14} aria-hidden="true" />
        {label}
      </span>
      {equalityScore != null && (
        <span className="ml-2 font-mono text-13 tabular-nums text-muted-foreground">
          {equalityScore}/100
        </span>
      )}
    </>
  );

  const frame = 'block border-[3px] border-foreground p-4';

  // The testid scopes the "no track colour on a risk badge" guard to this
  // module. Asserting over the whole rail would be wrong: the route rail lives
  // there too and legitimately carries its line's colour.
  if (!rightsHref)
    return (
      <div data-testid="geo-safety-verdict" className={cn(frame, className)}>
        {inner}
      </div>
    );

  return (
    <a
      data-testid="geo-safety-verdict"
      href={rightsHref}
      className={cn(frame, 'no-underline', className)}
      aria-label={t('cities.detail.glance.safetyLink', 'Jump to safety & rights')}
    >
      {inner}
    </a>
  );
}
