import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { Shield, ShieldAlert, Skull, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import { useTripSafety, type TripSafetyReport } from '@/hooks/useTripSafety';
import { getScoreLabel, parseSsuSummary } from '@/utils/equalityScore';
import type { TripPlace } from '@/hooks/useTrips';

const riskConfig: Record<
  TripSafetyReport['overallRisk'],
  { label: string; Icon: typeof Shield; severity: 'success' | 'warning' | 'error' }
> = {
  low: { label: 'Low Risk', Icon: Shield, severity: 'success' },
  moderate: { label: 'Moderate Risk', Icon: AlertTriangle, severity: 'warning' },
  high: { label: 'High Risk', Icon: ShieldAlert, severity: 'error' },
  critical: { label: 'Critical Risk', Icon: Skull, severity: 'error' },
};

function getRiskBadgeColor(risk: TripSafetyReport['overallRisk']) {
  switch (risk) {
    case 'low':
      return { bgcolor: 'success.main', color: 'success.contrastText' };
    case 'moderate':
      return { bgcolor: 'warning.main', color: 'warning.contrastText' };
    case 'high':
    case 'critical':
      return { bgcolor: 'error.main', color: 'error.contrastText' };
  }
}

interface Props {
  tripPlaces: TripPlace[];
}

export function TripSafetyBriefing({ tripPlaces }: Props) {
  const countryIds = useMemo(
    () => tripPlaces.map((p) => p.country_id).filter(Boolean) as string[],
    [tripPlaces],
  );

  const report = useTripSafety(countryIds);

  if (report.countries.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Shield style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.3 }} />
        <Typography variant="body2" color="text.secondary">
          Add destinations to see safety information.
        </Typography>
      </Box>
    );
  }

  const risk = riskConfig[report.overallRisk];
  const riskColors = getRiskBadgeColor(report.overallRisk);

  return (
    <div>
      {/* Death penalty warning */}
      {report.hasDeathPenaltyDestination && (
        <Alert severity="error" icon={<Skull style={{ width: 20, height: 20 }} />} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Death Penalty in Effect
          </Typography>
          <Typography variant="body2">
            At least one destination has the death penalty for same-sex relations.
            Strongly reconsider travel to this country.
          </Typography>
        </Alert>
      )}

      {/* Criminalization warning */}
      {report.hasCriminalizedDestination && !report.hasDeathPenaltyDestination && (
        <Alert severity="error" icon={<ShieldAlert style={{ width: 20, height: 20 }} />} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Warning: Criminalized Destination
          </Typography>
          <Typography variant="body2">
            One or more countries criminalize same-sex relations. Exercise extreme
            caution and research local laws.
          </Typography>
        </Alert>
      )}

      {/* Overall risk badge */}
      <ScrollReveal direction="up">
        <Card style={{ marginBottom: 16 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <risk.Icon style={{ width: 24, height: 24 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Badge
                  variant="default"
                  sx={{
                    ...riskColors,
                    fontSize: '0.875rem',
                    height: 28,
                    mb: 0.5,
                  }}
                >
                  {risk.label}
                </Badge>
                <Typography variant="body2" color="text.secondary">
                  Based on LGBTQ+ equality data for {report.countries.length}{' '}
                  {report.countries.length === 1 ? 'country' : 'countries'} in your trip.
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </ScrollReveal>

      {/* Cross-border warnings */}
      {report.crossBorderWarnings.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Cross-Border Warnings
          </Typography>
          {report.crossBorderWarnings.map((w, i) => (
            <Alert key={i} severity="warning" sx={{ mb: 1 }}>
              <Typography variant="body2">{w.message}</Typography>
            </Alert>
          ))}
        </Box>
      )}

      {/* Per-country safety cards */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
        Country Safety Details
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {report.countries.map((country) => {
          const scoreInfo = getScoreLabel(country.equality_score);

          return (
            <ScrollReveal key={country.id} direction="up">
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <EqualityScoreBadge score={country.equality_score} size="sm" />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {country.name}
                        </Typography>
                        <Badge
                          variant="default"
                          sx={{
                            bgcolor: scoreInfo.bgColor,
                            color: scoreInfo.color,
                            fontSize: '0.6875rem',
                            height: 20,
                          }}
                        >
                          {scoreInfo.label}
                        </Badge>
                      </Box>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {country.criminalized && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'error.main' }}>
                            <ShieldAlert style={{ width: 14, height: 14 }} />
                            <Typography variant="body2" sx={{ fontWeight: 500 }} color="error">
                              Same-sex relations criminalized
                            </Typography>
                          </Box>
                        )}

                        {country.deathPenalty && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'error.main' }}>
                            <Skull style={{ width: 14, height: 14 }} />
                            <Typography variant="body2" sx={{ fontWeight: 500 }} color="error">
                              Death penalty applies
                            </Typography>
                          </Box>
                        )}

                        {country.lgbti_protection_employment && (
                          <Typography variant="body2" color="text.secondary">
                            Employment protection:{' '}
                            {typeof country.lgbti_protection_employment === 'object'
                              ? (country.lgbti_protection_employment as any).so || 'No data'
                              : String(country.lgbti_protection_employment)}
                          </Typography>
                        )}

                        {country.lgbti_recognition_ssu && (
                          <Typography variant="body2" color="text.secondary">
                            SSU recognition:{' '}
                            {parseSsuSummary(
                              typeof country.lgbti_recognition_ssu === 'string'
                                ? country.lgbti_recognition_ssu
                                : JSON.stringify(country.lgbti_recognition_ssu),
                            )}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </ScrollReveal>
          );
        })}
      </Box>
    </div>
  );
}
