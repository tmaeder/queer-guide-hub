import { useMemo, useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Skull,
  AlertTriangle,
  ChevronDown,
  MapPin,
  Info,
  ExternalLink,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useTripSafety, type TripSafetyReport } from '@/hooks/useTripSafety';
import { TripNewsSection } from './TripNewsSection';
import { AiSafetyNarrativeCard } from './AiSafetyNarrativeCard';
import {
  getScoreLabel,
  parseSsuSummary,
  getProtectionStatus,
} from '@/utils/equalityScore';
import type { TripPlace, TripDay } from '@/hooks/useTrips';
import { PerLegSafety } from './PerLegSafety';

type OverallRisk = TripSafetyReport['overallRisk'];

function useRiskVisual(risk: OverallRisk) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const bg = {
    low: isDark ? '#052e1a' : '#ecfdf5',
    moderate: isDark ? '#3a2a06' : '#fffbeb',
    high: isDark ? '#3f1515' : '#fef2f2',
    critical: isDark ? '#2a0606' : '#fef2f2',
  }[risk];
  const fg = {
    low: isDark ? '#34d399' : '#047857',
    moderate: isDark ? '#fbbf24' : '#b45309',
    high: isDark ? '#f87171' : '#b91c1c',
    critical: isDark ? '#fca5a5' : '#7f1d1d',
  }[risk];
  const border = {
    low: isDark ? '#064e3b' : '#a7f3d0',
    moderate: isDark ? '#78350f' : '#fcd34d',
    high: isDark ? '#7f1d1d' : '#fca5a5',
    critical: isDark ? '#450a0a' : '#dc2626',
  }[risk];
  const Icon = {
    low: ShieldCheck,
    moderate: AlertTriangle,
    high: ShieldAlert,
    critical: Skull,
  }[risk];
  return { bg, fg, border, Icon };
}

interface Props {
  tripPlaces: TripPlace[];
  tripDays?: TripDay[];
  tripId?: string;
}

export function TripSafetyBriefing({ tripPlaces, tripDays, tripId }: Props) {
  const { t } = useTranslation();

  const countryIds = useMemo(
    () => tripPlaces.map((p) => p.country_id).filter(Boolean) as string[],
    [tripPlaces],
  );

  const placesPerCountry = useMemo(() => {
    const counts = new Map<string, number>();
    for (const place of tripPlaces) {
      if (place.country_id) {
        counts.set(place.country_id, (counts.get(place.country_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [tripPlaces]);

  const report = useTripSafety(countryIds);

  if (report.countries.length === 0) {
    return (
      <div className="text-center py-6 md:py-10 px-3 border-[1.5px] border-dashed border-border rounded-container">
        <Shield
          className="w-10 h-10 mx-auto mb-3 opacity-30"
          aria-hidden="true"
        />
        <h6 className="font-bold text-lg mb-0.5">{t('trips.safety.emptyTitle')}</h6>
        <p className="text-sm text-muted-foreground max-w-[420px] mx-auto">
          {t('trips.safety.emptyDescription')}
        </p>
      </div>
    );
  }

  return (
    <div>
      <RiskSnapshot report={report} />

      {tripId && <AiSafetyNarrativeCard tripId={tripId} canGenerate />}

      {report.crossBorderWarnings.length > 0 && (
        <div className="mb-3">
          <p className="font-bold mb-1 uppercase tracking-[0.04em] text-[0.7rem] text-muted-foreground">
            {t('trips.safety.crossBorderHeading')}
          </p>
          {report.crossBorderWarnings.map((w, i) => (
            <CrossBorderCard key={i} warning={w} />
          ))}
        </div>
      )}

      {tripId && tripDays && (
        <PerLegSafety tripId={tripId} tripPlaces={tripPlaces} tripDays={tripDays} />
      )}

      <p
        className={`font-bold mb-1.5 uppercase tracking-[0.04em] text-[0.7rem] text-muted-foreground ${tripId && tripDays ? 'mt-4' : ''}`}
      >
        {t('trips.safety.countriesHeading')}
      </p>

      <div className="flex flex-col gap-[0.3125rem]">
        {report.countries.map((country) => (
          <CountryAccordion
            key={country.id}
            country={country}
            placeCount={placesPerCountry.get(country.id) ?? 0}
          />
        ))}
      </div>

      <TripNewsSection countryIds={countryIds} />

      <div className="mt-3 p-2 rounded-element bg-muted flex items-start gap-[0.3125rem]">
        <Info
          className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-70"
          aria-hidden="true"
        />
        <span className="text-xs text-muted-foreground">{t('trips.safety.dataSource')}</span>
      </div>
    </div>
  );
}

function RiskSnapshot({ report }: { report: TripSafetyReport }) {
  const { t } = useTranslation();
  const visual = useRiskVisual(report.overallRisk);
  const Icon = visual.Icon;

  const worstCountry = useMemo(() => {
    return [...report.countries]
      .sort((a, b) => (a.equality_score ?? 100) - (b.equality_score ?? 100))[0];
  }, [report.countries]);

  return (
    <div className="p-2.5 md:p-3 mb-3" style={{ backgroundColor: visual.bg }}>
      <div className="flex items-start gap-2">
        <div
          className="flex-shrink-0 w-12 h-12 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: visual.fg }}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[0.7rem] font-bold uppercase tracking-[0.06em] mb-[0.0625rem]"
            style={{ color: visual.fg }}
          >
            {t(`trips.safety.risk.${report.overallRisk}`)}
          </p>
          <h6
            className="text-lg font-extrabold mb-0.5"
          >
            {t(`trips.safety.headline.${report.overallRisk}`)}
          </h6>
          <p className="text-sm text-muted-foreground">
            {t('trips.safety.basedOn', { count: report.countries.length })}
          </p>

          {(report.hasDeathPenaltyDestination || report.hasCriminalizedDestination) && (
            <div className="mt-1.5 flex flex-col gap-[0.1875rem]">
              {report.hasDeathPenaltyDestination && (
                <div className="flex items-center gap-[0.1875rem]">
                  <Skull
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: visual.fg }}
                  />
                  <span className="text-sm font-semibold" style={{ color: visual.fg }}>
                    {t('trips.safety.flags.deathPenalty')}
                  </span>
                </div>
              )}
              {report.hasCriminalizedDestination &&
                !report.hasDeathPenaltyDestination && (
                  <div className="flex items-center gap-[0.1875rem]">
                    <ShieldAlert
                      className="w-3.5 h-3.5 flex-shrink-0"
                      style={{ color: visual.fg }}
                    />
                    <span className="text-sm font-semibold" style={{ color: visual.fg }}>
                      {t('trips.safety.flags.criminalized')}
                    </span>
                  </div>
                )}
            </div>
          )}

          {worstCountry && report.overallRisk !== 'low' && (
            <span className="text-xs text-muted-foreground block mt-[0.3125rem]">
              {t('trips.safety.worstCountry', {
                country: worstCountry.name,
                score:
                  worstCountry.equality_score != null
                    ? worstCountry.equality_score
                    : '—',
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CrossBorderCard({
  warning,
}: {
  warning: TripSafetyReport['crossBorderWarnings'][number];
}) {
  const { t } = useTranslation();
  return (
    <div className="p-2 mb-1 flex items-start gap-[0.3125rem] bg-muted">
      <AlertTriangle
        className="w-[18px] h-[18px] flex-shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold mb-[0.0625rem]">
          {t('trips.safety.crossBorderTitle', {
            from: warning.from.name,
            to: warning.to.name,
          })}
        </p>
        <span className="text-xs text-muted-foreground">
          {t('trips.safety.crossBorderBody', { drop: warning.scoreDrop })}
        </span>
      </div>
    </div>
  );
}

function CountryAccordion({
  country,
  placeCount,
}: {
  country: ReturnType<typeof useTripSafety>['countries'][number];
  placeCount: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const scoreInfo = getScoreLabel(country.equality_score);
  const protectionStatus = getProtectionStatus(
    country.lgbti_employment_protection,
  );
  const ssuSummary = parseSsuSummary(
    typeof country.lgbti_same_sex_unions === 'string'
      ? country.lgbti_same_sex_unions
      : country.lgbti_same_sex_unions != null
        ? JSON.stringify(country.lgbti_same_sex_unions)
        : null,
  );
  const warningCount =
    (country.criminalized ? 1 : 0) + (country.deathPenalty ? 1 : 0);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          asChild
          aria-expanded={open}
          aria-label={t('trips.safety.toggleDetails', { country: country.name })}
        >
          <button
            type="button"
            className="flex items-center justify-between gap-1.5 w-full p-2 bg-transparent border-0 cursor-pointer text-left text-inherit transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline focus-visible:-outline-offset-2"
            style={{ outlineColor: 'hsl(var(--foreground))' }}
          >
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {/* Score chip */}
              <div
                className="flex-shrink-0 w-12 h-12 rounded-element flex flex-col items-center justify-center"
                style={{ backgroundColor: scoreInfo.bgColor, color: scoreInfo.color }}
                aria-hidden="true"
              >
                <span
                  className="text-base font-extrabold leading-none"
                >
                  {country.equality_score ?? '—'}
                </span>
                <span className="text-[8px] leading-none mt-[0.0625rem] opacity-85">/100</span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-[0.1875rem] flex-wrap">
                  <p
                    className="font-bold text-base"
                  >
                    {country.name}
                  </p>
                  <Badge variant="secondary">
                    {t(
                      `trips.safety.scoreLabel.${scoreLabelToKey(scoreInfo.label)}`,
                      { defaultValue: scoreInfo.label },
                    )}
                  </Badge>
                  {warningCount > 0 && (
                    <Badge variant="destructive">
                      {t('trips.safety.warningCount', { count: warningCount })}
                    </Badge>
                  )}
                </div>
                {placeCount > 0 && (
                  <div className="inline-flex items-center gap-0.5 mt-[0.0625rem] text-muted-foreground">
                    <MapPin className="w-3 h-3" aria-hidden="true" />
                    <span className="text-xs">
                      {t('trips.safety.stops', { count: placeCount })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <ChevronDown
              className="w-[18px] h-[18px] flex-shrink-0 opacity-50 transition-transform duration-200"
              style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent>
            <div className="border-t border-border pt-2 flex flex-col gap-[0.3125rem]">
              {country.criminalized && (
                <DetailRow
                  icon={ShieldAlert}
                  tone="destructive"
                  label={t('trips.safety.detail.criminalized.label')}
                  value={t('trips.safety.detail.criminalized.value')}
                />
              )}
              {country.deathPenalty && (
                <DetailRow
                  icon={Skull}
                  tone="destructive"
                  label={t('trips.safety.detail.deathPenalty.label')}
                  value={t('trips.safety.detail.deathPenalty.value')}
                />
              )}

              <DetailRow
                label={t('trips.safety.detail.ssu')}
                value={ssuSummary}
              />
              <DetailRow
                label={t('trips.safety.detail.employment')}
                value={protectionStatus.so}
              />

              <div className="mt-0.5 p-1.5 rounded-badge bg-muted flex items-start gap-1">
                <Info
                  className="w-3.5 h-3.5 mt-0.5 opacity-60 flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="text-xs text-muted-foreground">
                  {t(`trips.safety.tip.${tipBucket(country.equality_score)}`)}
                </span>
              </div>

              {country.code && (
                <a
                  href={`https://database.ilga.org/${country.code.toLowerCase()}-lgbti`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 mt-0.5 self-start text-[0.8125rem] font-semibold no-underline hover:underline"
                  style={{ color: 'hsl(var(--foreground))' }}
                >
                  {t('trips.safety.viewOnIlga')}
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function DetailRow({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon?: typeof Shield;
  tone?: 'destructive';
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-1">
      {Icon && (
        <Icon
          className="w-3.5 h-3.5 mt-[3px] flex-shrink-0"
          color={tone === 'destructive' ? '#dc2626' : undefined}
          aria-hidden="true"
        />
      )}
      <div className="flex-1 min-w-0">
        <span className="block uppercase tracking-[0.04em] font-bold text-muted-foreground text-[0.65rem]">
          {label}
        </span>
        <p
          className={tone === 'destructive' ? 'text-destructive font-semibold text-sm' : 'text-foreground text-sm'}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function scoreLabelToKey(label: string): string {
  const map: Record<string, string> = {
    'Very High': 'veryHigh',
    High: 'high',
    Moderate: 'moderate',
    Low: 'low',
    'Very Low': 'veryLow',
    'No Data': 'noData',
  };
  return map[label] ?? 'noData';
}

function tipBucket(score: number | null): 'safe' | 'caution' | 'danger' {
  if (score == null) return 'caution';
  if (score >= 60) return 'safe';
  if (score >= 30) return 'caution';
  return 'danger';
}
