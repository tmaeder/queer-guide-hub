import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { AlertTriangle, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { useTripDocuments, type TripDocument } from '@/hooks/useTripDocuments';
import type { TripWithDetails } from '@/hooks/useTrips';

interface Props {
  trip: TripWithDetails;
}

/** Days a passport must remain valid past the trip end date. Six months is
 * the standard requirement for most international travel. */
const PASSPORT_BUFFER_DAYS = 180;

interface DocFlag {
  doc: TripDocument;
  /** "expired" — already past expiry; "soon" — expires before trip end + buffer for passports / before trip start for everything else. */
  level: 'expired' | 'soon';
  /** ISO date the document needs to remain valid through. */
  requiredThrough: string;
}

function flagDocs(docs: TripDocument[], trip: TripWithDetails, now: Date): DocFlag[] {
  if (!trip.start_date || !trip.end_date) return [];
  const tripEnd = new Date(trip.end_date);
  const passportThrough = new Date(tripEnd.getTime() + PASSPORT_BUFFER_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);
  const otherThrough = trip.end_date;

  const out: DocFlag[] = [];
  for (const d of docs) {
    if (!d.expiry_date) continue;
    const required = d.doc_type === 'passport' ? passportThrough : otherThrough;
    if (d.expiry_date < now.toISOString().slice(0, 10)) {
      out.push({ doc: d, level: 'expired', requiredThrough: required });
    } else if (d.expiry_date < required) {
      out.push({ doc: d, level: 'soon', requiredThrough: required });
    }
  }
  return out;
}

/**
 * Warns when any trip-attached or personal travel document expires before
 * the trip ends (or within the passport-validity buffer for passports).
 *
 * Renders nothing when the trip has no dates, no documents are loaded, or
 * everything is valid through the relevant cutoff.
 */
export function TripDocExpiryBanner({ trip }: Props) {
  const { t } = useTranslation();
  const { data: tripDocs } = useTripDocuments(trip.id);
  const { data: personalDocs } = useTripDocuments(null);

  const flags = useMemo(() => {
    const all = [...(tripDocs ?? []), ...(personalDocs ?? [])];
    return flagDocs(all, trip, new Date());
  }, [tripDocs, personalDocs, trip]);

  if (flags.length === 0) return null;

  const expiredCount = flags.filter((f) => f.level === 'expired').length;
  const isSevere = expiredCount > 0;

  return (
    <Box
      role="alert"
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        px: 2,
        py: 1.5,
        mb: 2,
        bgcolor: isSevere
          ? theme.palette.mode === 'dark'
            ? 'rgba(244, 67, 54, 0.12)'
            : 'rgba(244, 67, 54, 0.08)'
          : theme.palette.mode === 'dark'
            ? 'rgba(255, 152, 0, 0.12)'
            : 'rgba(255, 152, 0, 0.08)',
        borderLeft: 4,
        borderColor: isSevere ? 'error.main' : 'warning.main',
      })}
    >
      {isSevere ? (
        <AlertTriangle style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
      ) : (
        <Clock style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
          {isSevere
            ? t('trips.docs.expiredTitle', 'Document expired')
            : t('trips.docs.expiringTitle', 'Document expires before trip ends')}
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.8125rem' }}>
          {flags.map((f) => (
            <Box component="li" key={f.doc.id}>
              <strong>{f.doc.title}</strong>{' '}
              <Typography component="span" variant="caption" color="text.secondary">
                ({f.doc.doc_type})
              </Typography>{' '}
              —{' '}
              {f.level === 'expired'
                ? t('trips.docs.expiredOn', 'expired {{date}}', {
                    date: new Date(f.doc.expiry_date!).toLocaleDateString(),
                  })
                : t('trips.docs.validUntil', 'valid until {{date}}, needs to cover {{through}}', {
                    date: new Date(f.doc.expiry_date!).toLocaleDateString(),
                    through: new Date(f.requiredThrough).toLocaleDateString(),
                  })}
            </Box>
          ))}
        </Box>
        <Typography
          component={RouterLink}
          to={`/trips/${trip.id}?tab=docs`}
          variant="caption"
          sx={{
            display: 'inline-block',
            mt: 0.75,
            color: 'primary.main',
            textDecoration: 'none',
            fontWeight: 600,
            '&:hover': { opacity: 0.85 },
          }}
        >
          {t('trips.docs.manageLink', 'Manage documents →')}
        </Typography>
      </Box>
    </Box>
  );
}

export const __testing = { flagDocs };
