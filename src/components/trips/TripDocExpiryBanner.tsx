import { useMemo } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { useTripDocuments, type TripDocument } from '@/hooks/useTripDocuments';
import type { TripWithDetails } from '@/hooks/useTrips';

interface Props {
  trip: TripWithDetails;
}

const PASSPORT_BUFFER_DAYS = 180;

interface DocFlag {
  doc: TripDocument;
  level: 'expired' | 'soon';
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
    <div
      role="alert"
      className="flex items-start gap-3 px-4 py-3 mb-4"
      style={{
        backgroundColor: isSevere ? 'rgba(244, 67, 54, 0.08)' : 'rgba(255, 152, 0, 0.08)',
        borderLeft: '4px solid',
        borderLeftColor: isSevere ? 'hsl(var(--destructive))' : 'hsl(var(--warning))',
      }}
    >
      {isSevere ? (
        <AlertTriangle style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
      ) : (
        <Clock style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold mb-1">
          {isSevere
            ? t('trips.docs.expiredTitle', 'Document expired')
            : t('trips.docs.expiringTitle', 'Document expires before trip ends')}
        </p>
        <ul className="m-0 pl-4" style={{ fontSize: '0.8125rem' }}>
          {flags.map((f) => (
            <li key={f.doc.id}>
              <strong>{f.doc.title}</strong>{' '}
              <span className="text-xs text-muted-foreground">({f.doc.doc_type})</span>{' '}
              —{' '}
              {f.level === 'expired'
                ? t('trips.docs.expiredOn', 'expired {{date}}', {
                    date: new Date(f.doc.expiry_date!).toLocaleDateString(),
                  })
                : t('trips.docs.validUntil', 'valid until {{date}}, needs to cover {{through}}', {
                    date: new Date(f.doc.expiry_date!).toLocaleDateString(),
                    through: new Date(f.requiredThrough).toLocaleDateString(),
                  })}
            </li>
          ))}
        </ul>
        <RouterLink
          to={`/trips/${trip.id}?tab=docs`}
          className="inline-block mt-2 text-xs font-semibold text-primary hover:opacity-85"
          style={{ textDecoration: 'none' }}
        >
          {t('trips.docs.manageLink', 'Manage documents →')}
        </RouterLink>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const __testing = { flagDocs };
