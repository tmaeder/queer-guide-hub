import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { AlertTriangle, Skull } from 'lucide-react';
import { isCriminalized, hasDeathPenalty } from '@/utils/equalityScore';

interface SafetyAlertBannerProps {
  criminalization: Record<string, any> | null | undefined;
  countryName: string;
}

export default function SafetyAlertBanner({ criminalization, countryName }: SafetyAlertBannerProps) {
  if (!isCriminalized(criminalization)) return null;

  const deathPenalty = hasDeathPenalty(criminalization);
  const penalty = criminalization?.penalty || '';
  const maxPrison = criminalization?.max_prison || '';

  return (
    <Box sx={{
      mx: 'auto',
      maxWidth: 1280,
      px: 3,
      mt: -2,
      mb: 3,
    }}>
      <Box sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: deathPenalty ? '#fca5a5' : '#fde68a',
        bgcolor: deathPenalty ? '#fef2f2' : '#fffbeb',
      }}>
        {deathPenalty ? (
          <Skull style={{ height: 24, width: 24, color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
        ) : (
          <AlertTriangle style={{ height: 24, width: 24, color: '#d97706', flexShrink: 0, marginTop: 2 }} />
        )}
        <Box>
          <Typography sx={{
            fontWeight: 700,
            fontSize: '0.9375rem',
            color: deathPenalty ? '#991b1b' : '#92400e',
            mb: 0.5,
          }}>
            {deathPenalty
              ? `Travel Warning: Same-sex activity carries the death penalty in ${countryName}`
              : `Travel Warning: Same-sex activity is criminalized in ${countryName}`
            }
          </Typography>
          <Typography sx={{
            fontSize: '0.8125rem',
            color: deathPenalty ? '#b91c1c' : '#a16207',
            lineHeight: 1.5,
          }}>
            {deathPenalty
              ? 'The death penalty may be imposed for consensual same-sex sexual activity. LGBTQ+ travellers face extreme risk.'
              : penalty
                ? `Penalties may include ${penalty.toLowerCase()}${maxPrison ? ` (${maxPrison})` : ''}. LGBTQ+ travellers should exercise extreme caution.`
                : 'LGBTQ+ travellers should exercise extreme caution and research local laws before visiting.'
            }
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
