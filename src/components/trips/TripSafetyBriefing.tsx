import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import { AlertTriangle, Shield, ShieldAlert, Skull } from 'lucide-react';
import { useTripSafety, type TripSafetyReport } from '@/hooks/useTripSafety';
import { getScoreRingColor, getScoreLabel, parseSsuSummary } from '@/utils/equalityScore';
import type { TripPlace } from '@/hooks/useTrips';

const riskConfig: Record<
  TripSafetyReport['overallRisk'],
  { label: string; color: string; bgColor: string; Icon: typeof Shield }
> = {
  low: { label: 'Low Risk', color: '#15803d', bgColor: '#dcfce7', Icon: Shield },
  moderate: { label: 'Moderate Risk', color: '#ca8a04', bgColor: '#fef9c3', Icon: AlertTriangle },
  high: { label: 'High Risk', color: '#ea580c', bgColor: '#fff7ed', Icon: ShieldAlert },
  critical: { label: 'Critical Risk', color: '#dc2626', bgColor: '#fef2f2', Icon: Skull },
};

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
      <Box className="text-center py-12">
        <Typography color="text.secondary">
          Add places to your trip to see safety information for each destination.
        </Typography>
      </Box>
    );
  }

  const risk = riskConfig[report.overallRisk];

  return (
    <div>
      {report.hasCriminalizedDestination && (
        <Alert severity="error" icon={<ShieldAlert size={20} />} sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            Warning: Criminalized Destination
          </Typography>
          <Typography variant="body2">
            One or more countries on your trip criminalize same-sex relations. Exercise extreme caution, research local laws, and consider consulting LGBTQ+ travel advisories.
          </Typography>
        </Alert>
      )}

      {report.hasDeathPenaltyDestination && (
        <Alert severity="error" icon={<Skull size={20} />} sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            Death Penalty in Effect
          </Typography>
          <Typography variant="body2">
            At least one destination on your trip has the death penalty for same-sex relations. Strongly reconsider travel to this country.
          </Typography>
        </Alert>
      )}

      <Card variant="outlined" sx={{ mb: 3, bgcolor: risk.bgColor }}>
        <CardContent>
          <Box className="flex items-center gap-3">
            <Box
              className="rounded-full flex items-center justify-center"
              sx={{ width: 48, height: 48, bgcolor: 'white' }}
            >
              <risk.Icon size={24} style={{ color: risk.color }} />
            </Box>
            <div>
              <Typography variant="h6" fontWeight={700} sx={{ color: risk.color }}>
                {risk.label}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Based on LGBTQ+ equality data for {report.countries.length} {report.countries.length === 1 ? 'country' : 'countries'} in your trip.
              </Typography>
            </div>
          </Box>
        </CardContent>
      </Card>

      {report.crossBorderWarnings.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Cross-Border Warnings
          </Typography>
          {report.crossBorderWarnings.map((w, i) => (
            <Alert key={i} severity="warning" sx={{ mb: 1 }}>
              <Typography variant="body2">{w.message}</Typography>
            </Alert>
          ))}
        </Box>
      )}

      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
        Country Safety Details
      </Typography>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {report.countries.map((country) => {
          const ringColor = getScoreRingColor(country.equality_score);
          const scoreInfo = getScoreLabel(country.equality_score);

          return (
            <Card key={country.id} variant="outlined">
              <CardContent>
                <Box className="flex items-start gap-3">
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      border: `3px solid ${ringColor}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 14,
                      color: ringColor,
                      flexShrink: 0,
                    }}
                  >
                    {country.equality_score ?? '?'}
                  </Box>
                  <div className="flex-1 min-w-0">
                    <Box className="flex items-center gap-2 mb-1">
                      <Typography variant="subtitle1" fontWeight={600}>
                        {country.name}
                      </Typography>
                      <Chip
                        label={scoreInfo.label}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 11,
                          bgcolor: scoreInfo.bgColor,
                          color: scoreInfo.color,
                        }}
                      />
                    </Box>

                    <div className="space-y-1 text-sm">
                      {country.criminalized && (
                        <Box className="flex items-center gap-1.5" sx={{ color: 'error.main' }}>
                          <ShieldAlert size={14} />
                          <Typography variant="body2" fontWeight={500} color="error">
                            Same-sex relations criminalized
                          </Typography>
                        </Box>
                      )}

                      {country.deathPenalty && (
                        <Box className="flex items-center gap-1.5" sx={{ color: 'error.main' }}>
                          <Skull size={14} />
                          <Typography variant="body2" fontWeight={500} color="error">
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
                          SSU recognition: {parseSsuSummary(
                            typeof country.lgbti_recognition_ssu === 'string'
                              ? country.lgbti_recognition_ssu
                              : JSON.stringify(country.lgbti_recognition_ssu)
                          )}
                        </Typography>
                      )}
                    </div>
                  </div>
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
