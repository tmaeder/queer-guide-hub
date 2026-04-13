import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
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
import {
  getScoreLabel,
  parseSsuSummary,
  getProtectionStatus,
} from '@/utils/equalityScore';
import type { TripPlace } from '@/hooks/useTrips';

type OverallRisk = TripSafetyReport['overallRisk'];

/**
 * Risk snapshot configuration. Each risk level gets a tonal background
 * (low-opacity fill), a solid accent color, and an icon.
 */
function useRiskVisual(risk: OverallRisk) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  // Low-opacity backgrounds — solid, theme-aware.
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
}

export function TripSafetyBriefing({ tripPlaces }: Props) {
  const { t } = useTranslation();

  const countryIds = useMemo(
    () => tripPlaces.map((p) => p.country_id).filter(Boolean) as string[],
    [tripPlaces],
  );

  // Count how many places are in each country (for the "N stops" line)
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
      <Box
        sx={{
          textAlign: 'center',
          py: { xs: 6, md: 10 },
          px: 3,
          border: '1.5px dashed',
          borderColor: 'divider',
          borderRadius: 3,
        }}
      >
        <Shield
          style={{
            width: 40,
            height: 40,
            margin: '0 auto 12px',
            opacity: 0.3,
          }}
          aria-hidden="true"
        />
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          {t('trips.safety.emptyTitle')}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 420, mx: 'auto' }}
        >
          {t('trips.safety.emptyDescription')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <RiskSnapshot report={report} />

      {report.crossBorderWarnings.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              mb: 1,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: '0.7rem',
              color: 'text.secondary',
            }}
          >
            {t('trips.safety.crossBorderHeading')}
          </Typography>
          {report.crossBorderWarnings.map((w, i) => (
            <CrossBorderCard key={i} warning={w} />
          ))}
        </Box>
      )}

      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 700,
          mb: 1.5,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: '0.7rem',
          color: 'text.secondary',
        }}
      >
        {t('trips.safety.countriesHeading')}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {report.countries.map((country) => (
          <CountryAccordion
            key={country.id}
            country={country}
            placeCount={placesPerCountry.get(country.id) ?? 0}
          />
        ))}
      </Box>

      <Box
        sx={{
          mt: 3,
          p: 2,
          borderRadius: 2,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.25,
        }}
      >
        <Info
          style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, opacity: 0.7 }}
          aria-hidden="true"
        />
        <Typography variant="caption" color="text.secondary">
          {t('trips.safety.dataSource')}
        </Typography>
      </Box>
    </Box>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function RiskSnapshot({ report }: { report: TripSafetyReport }) {
  const { t } = useTranslation();
  const visual = useRiskVisual(report.overallRisk);
  const Icon = visual.Icon;

  const worstCountry = useMemo(() => {
    return [...report.countries]
      .sort((a, b) => (a.equality_score ?? 100) - (b.equality_score ?? 100))[0];
  }, [report.countries]);

  return (
    <Box
      sx={{
        bgcolor: visual.bg,
        p: { xs: 2.5, md: 3 },
        mb: 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <Box
          sx={{
            flexShrink: 0,
            width: 48,
            height: 48,
            bgcolor: 'rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: visual.fg,
          }}
        >
          <Icon style={{ width: 24, height: 24 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: visual.fg,
              mb: 0.25,
            }}
          >
            {t(`trips.safety.risk.${report.overallRisk}`)}
          </Typography>
          <Typography
            variant="h6"
            sx={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              lineHeight: 1.2,
              color: 'text.primary',
              mb: 0.5,
            }}
          >
            {t(`trips.safety.headline.${report.overallRisk}`)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('trips.safety.basedOn', { count: report.countries.length })}
          </Typography>

          {/* Critical call-outs */}
          {(report.hasDeathPenaltyDestination || report.hasCriminalizedDestination) && (
            <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {report.hasDeathPenaltyDestination && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Skull
                    style={{ width: 14, height: 14, color: visual.fg, flexShrink: 0 }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: visual.fg }}
                  >
                    {t('trips.safety.flags.deathPenalty')}
                  </Typography>
                </Box>
              )}
              {report.hasCriminalizedDestination &&
                !report.hasDeathPenaltyDestination && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <ShieldAlert
                      style={{ width: 14, height: 14, color: visual.fg, flexShrink: 0 }}
                    />
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: visual.fg }}
                    >
                      {t('trips.safety.flags.criminalized')}
                    </Typography>
                  </Box>
                )}
            </Box>
          )}

          {worstCountry && report.overallRisk !== 'low' && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 1.25 }}
            >
              {t('trips.safety.worstCountry', {
                country: worstCountry.name,
                score:
                  worstCountry.equality_score != null
                    ? worstCountry.equality_score
                    : '—',
              })}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function CrossBorderCard({
  warning,
}: {
  warning: TripSafetyReport['crossBorderWarnings'][number];
}) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? '#2a1f06' : '#fffbeb',
        p: 2,
        mb: 1,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
      }}
    >
      <AlertTriangle
        style={{
          width: 18,
          height: 18,
          flexShrink: 0,
          marginTop: 2,
          color: '#b45309',
        }}
        aria-hidden="true"
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>
          {t('trips.safety.crossBorderTitle', {
            from: warning.from.name,
            to: warning.to.name,
          })}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('trips.safety.crossBorderBody', { drop: warning.scoreDrop })}
        </Typography>
      </Box>
    </Box>
  );
}

/* ────────────────────────────────────────────────────────────────── */

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
    country.lgbti_protection_employment,
  );
  const ssuSummary = parseSsuSummary(
    typeof country.lgbti_recognition_ssu === 'string'
      ? country.lgbti_recognition_ssu
      : country.lgbti_recognition_ssu != null
        ? JSON.stringify(country.lgbti_recognition_ssu)
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
          <Box
            component="button"
            type="button"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              width: '100%',
              p: 2,
              bgcolor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              color: 'inherit',
              fontFamily: 'inherit',
              transition: 'background-color 0.15s',
              '&:hover': { bgcolor: 'action.hover' },
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'brand.main',
                outlineOffset: -2,
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
              {/* Score chip */}
              <Box
                sx={{
                  flexShrink: 0,
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: scoreInfo.bgColor,
                  color: scoreInfo.color,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-hidden="true"
              >
                <Typography
                  sx={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 16,
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  {country.equality_score ?? '—'}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 8,
                    lineHeight: 1,
                    mt: 0.25,
                    opacity: 0.85,
                  }}
                >
                  /100
                </Typography>
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    flexWrap: 'wrap',
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 700,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    {country.name}
                  </Typography>
                  <Badge
                    variant="secondary"
                    sx={{
                      bgcolor: scoreInfo.bgColor,
                      color: scoreInfo.color,
                      fontSize: '0.6875rem',
                      height: 20,
                    }}
                  >
                    {t(
                      `trips.safety.scoreLabel.${scoreLabelToKey(scoreInfo.label)}`,
                      { defaultValue: scoreInfo.label },
                    )}
                  </Badge>
                  {warningCount > 0 && (
                    <Badge
                      variant="destructive"
                      sx={{ fontSize: '0.6875rem', height: 20 }}
                    >
                      {t('trips.safety.warningCount', { count: warningCount })}
                    </Badge>
                  )}
                </Box>
                {placeCount > 0 && (
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      mt: 0.25,
                      color: 'text.secondary',
                    }}
                  >
                    <MapPin
                      style={{ width: 12, height: 12 }}
                      aria-hidden="true"
                    />
                    <Typography variant="caption">
                      {t('trips.safety.stops', { count: placeCount })}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            <ChevronDown
              style={{
                width: 18,
                height: 18,
                flexShrink: 0,
                opacity: 0.5,
                transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
              aria-hidden="true"
            />
          </Box>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent sx={{ pt: 0, pb: 2, px: 2 }}>
            <Box
              sx={{
                borderTop: '1px solid',
                borderColor: 'divider',
                pt: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.25,
              }}
            >
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

              {/* Actionable tip row */}
              <Box
                sx={{
                  mt: 0.5,
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                }}
              >
                <Info
                  style={{
                    width: 14,
                    height: 14,
                    marginTop: 2,
                    opacity: 0.6,
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
                <Typography variant="caption" color="text.secondary">
                  {t(`trips.safety.tip.${tipBucket(country.equality_score)}`)}
                </Typography>
              </Box>

              {country.code && (
                <Box
                  component="a"
                  href={`https://database.ilga.org/${country.code.toLowerCase()}-lgbti`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    mt: 0.5,
                    alignSelf: 'flex-start',
                    color: 'brand.main',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  {t('trips.safety.viewOnIlga')}
                  <ExternalLink
                    style={{ width: 12, height: 12 }}
                    aria-hidden="true"
                  />
                </Box>
              )}
            </Box>
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
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      {Icon && (
        <Icon
          style={{
            width: 14,
            height: 14,
            marginTop: 3,
            flexShrink: 0,
          }}
          color={tone === 'destructive' ? '#dc2626' : undefined}
          aria-hidden="true"
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            fontWeight: 700,
            color: 'text.secondary',
            fontSize: '0.65rem',
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="body2"
          color={tone === 'destructive' ? 'error.main' : 'text.primary'}
          sx={{ fontWeight: tone === 'destructive' ? 600 : 400 }}
        >
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

/* ── pure helpers ───────────────────────────────────────────────── */

/**
 * Map the utility's label string to a stable translation key.
 * Falls back to the raw label via i18n defaultValue.
 */
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

/**
 * Bucket a country's equality score into a tip category.
 * Used to pick a generic actionable tip per risk level.
 */
function tipBucket(score: number | null): 'safe' | 'caution' | 'danger' {
  if (score == null) return 'caution';
  if (score >= 60) return 'safe';
  if (score >= 30) return 'caution';
  return 'danger';
}
