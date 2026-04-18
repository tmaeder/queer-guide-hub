import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useTrip, type TripPlace } from '@/hooks/useTrips';
import { useTripReservations } from '@/hooks/useTripReservations';
import { ErrorState } from '@/components/ui/EmptyState';

/**
 * Print-optimized trip booklet.
 *
 * Renders the trip as an offline-friendly document and auto-triggers
 * the browser print dialog so users get a PDF via "Save as PDF".
 * Intentionally avoids a server-side PDF dependency — the browser
 * already produces clean output and the page works offline once
 * loaded.
 *
 * Sections (in order): cover, days + places, addresses index,
 * reservations + confirmation codes, country safety summary,
 * emergency contacts. Each `.page` block is sized to A4 and
 * page-break-isolated via @page CSS.
 */
export default function TripBookletPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { t } = useTranslation();
  const { data: trip, isLoading, error } = useTrip(tripId);
  const { data: reservations } = useTripReservations(tripId);

  // Once the trip + reservations have rendered, prompt print. A timeout
  // gives layout a beat to settle (fonts, images) before the dialog
  // captures the rendered tree.
  useEffect(() => {
    if (!trip) return;
    const timer = setTimeout(() => {
      window.print();
    }, 800);
    return () => clearTimeout(timer);
  }, [trip]);

  const placesByDay = useMemo(() => {
    const map = new Map<string, TripPlace[]>();
    if (!trip) return map;
    for (const p of trip.trip_places) {
      const key = p.day_id ?? 'unassigned';
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [trip]);

  const allPlaces = useMemo(() => {
    if (!trip) return [];
    return [...trip.trip_places].sort((a, b) => a.sort_order - b.sort_order);
  }, [trip]);

  const countries = useMemo(() => {
    if (!trip) return [];
    const seen = new Map<
      string,
      { id: string; name: string; code: string | null; equality_score: number | null }
    >();
    for (const p of trip.trip_places) {
      if (p.countries?.id) seen.set(p.countries.id, p.countries);
    }
    return [...seen.values()];
  }, [trip]);

  if (isLoading) {
    return <div style={{ padding: 32 }}>Loading…</div>;
  }
  if (error || !trip) {
    return (
      <ErrorState
        title={t('trips.notFound', 'Trip not found')}
        description={t('trips.notFoundDescription', 'This trip may have been deleted.')}
      />
    );
  }

  const fmtDate = (iso?: string | null) =>
    iso ? format(new Date(iso), 'EEE, MMM d, yyyy') : '—';

  const placeName = (p: TripPlace): string =>
    p.venues?.name ?? p.events?.title ?? p.hotels?.name ?? p.custom_name ?? 'Stop';

  const placeAddress = (p: TripPlace): string | null =>
    p.venues?.address ?? p.hotels?.address ?? p.custom_address;

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm 16mm; }
        @media print {
          body { background: #fff !important; }
          .booklet { font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; color: #111; }
          .no-print { display: none !important; }
          .page-break { page-break-after: always; }
        }
        .booklet { max-width: 720px; margin: 0 auto; padding: 32px 24px 64px; font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; color: #111; }
        .booklet h1 { font-size: 32px; margin: 0 0 4px; font-weight: 800; letter-spacing: -0.01em; }
        .booklet h2 { font-size: 18px; margin: 28px 0 8px; font-weight: 700; border-bottom: 2px solid #111; padding-bottom: 4px; }
        .booklet h3 { font-size: 14px; margin: 16px 0 6px; font-weight: 700; }
        .booklet p, .booklet li { font-size: 12px; line-height: 1.5; margin: 4px 0; }
        .booklet table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .booklet th, .booklet td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
        .booklet .muted { color: #666; }
        .booklet .cover { padding: 60px 0 24px; text-align: left; }
        .booklet .cover .meta { font-size: 14px; color: #666; margin-top: 8px; }
        .booklet .toolbar { position: sticky; top: 0; background: #fff; padding: 8px 0 16px; display: flex; gap: 8px; }
        .booklet .toolbar button { padding: 6px 12px; border: 1px solid #111; background: #fff; cursor: pointer; font-family: inherit; font-size: 12px; }
      `}</style>

      <div className="booklet">
        <div className="toolbar no-print">
          <button onClick={() => window.print()}>
            {t('trips.booklet.print', 'Print / Save as PDF')}
          </button>
          <button onClick={() => window.close()}>
            {t('trips.booklet.close', 'Close')}
          </button>
        </div>

        {/* Cover */}
        <section className="cover">
          <h1>{trip.title}</h1>
          {trip.description && <p className="muted">{trip.description}</p>}
          <div className="meta">
            {fmtDate(trip.start_date)} → {fmtDate(trip.end_date)}
            {countries.length > 0 && (
              <>
                {' · '}
                {countries.map((c) => c.name).join(', ')}
              </>
            )}
          </div>
        </section>

        {/* Days */}
        <h2>{t('trips.booklet.itinerary', 'Itinerary')}</h2>
        {trip.trip_days.length === 0 && (
          <p className="muted">{t('trips.booklet.noDays', 'No days planned.')}</p>
        )}
        {trip.trip_days
          .slice()
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((day) => {
            const places = placesByDay.get(day.id) ?? [];
            return (
              <div key={day.id} style={{ marginBottom: 12 }}>
                <h3>
                  {fmtDate(day.date)}
                  {day.title ? ` — ${day.title}` : ''}
                </h3>
                {places.length === 0 ? (
                  <p className="muted">— {t('trips.booklet.empty', 'Free day')}</p>
                ) : (
                  <ul style={{ paddingLeft: 18, margin: 0 }}>
                    {places.map((p) => (
                      <li key={p.id}>
                        <strong>{placeName(p)}</strong>
                        {p.start_time && (
                          <span className="muted">
                            {' '}
                            · {p.start_time.slice(0, 5)}
                            {p.end_time ? `–${p.end_time.slice(0, 5)}` : ''}
                          </span>
                        )}
                        {placeAddress(p) && (
                          <div className="muted">{placeAddress(p)}</div>
                        )}
                        {p.notes && <div>{p.notes}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

        {/* Addresses index */}
        <div className="page-break" />
        <h2>{t('trips.booklet.addresses', 'Addresses')}</h2>
        <table>
          <thead>
            <tr>
              <th>{t('trips.booklet.place', 'Place')}</th>
              <th>{t('trips.booklet.address', 'Address')}</th>
              <th>{t('trips.booklet.city', 'City')}</th>
            </tr>
          </thead>
          <tbody>
            {allPlaces.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  {t('trips.booklet.noPlaces', 'No places yet.')}
                </td>
              </tr>
            )}
            {allPlaces.map((p) => (
              <tr key={p.id}>
                <td>{placeName(p)}</td>
                <td>{placeAddress(p) ?? '—'}</td>
                <td>{p.cities?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Reservations */}
        <h2>{t('trips.booklet.reservations', 'Reservations & confirmations')}</h2>
        {(!reservations || reservations.length === 0) && (
          <p className="muted">{t('trips.booklet.noReservations', 'No reservations recorded.')}</p>
        )}
        {reservations && reservations.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>{t('trips.booklet.type', 'Type')}</th>
                <th>{t('trips.booklet.title', 'Title')}</th>
                <th>{t('trips.booklet.dates', 'When')}</th>
                <th>{t('trips.booklet.confirmation', 'Confirmation')}</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id}>
                  <td>{r.type}</td>
                  <td>
                    {r.title}
                    {r.provider && <div className="muted">{r.provider}</div>}
                  </td>
                  <td>
                    {r.check_in && format(new Date(r.check_in), 'MMM d HH:mm')}
                    {r.check_out && ` → ${format(new Date(r.check_out), 'MMM d HH:mm')}`}
                  </td>
                  <td>
                    <code>{r.confirmation_code ?? '—'}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Country safety */}
        <div className="page-break" />
        <h2>{t('trips.booklet.safety', 'Country safety summary')}</h2>
        {countries.length === 0 && (
          <p className="muted">{t('trips.booklet.noCountries', 'No country information.')}</p>
        )}
        {countries.map((c) => (
          <div key={c.id} style={{ marginBottom: 8 }}>
            <h3>
              {c.name}
              {c.code && <span className="muted"> ({c.code})</span>}
            </h3>
            <p>
              {t('trips.booklet.equalityScore', 'Equality score')}:{' '}
              <strong>{c.equality_score ?? '—'}</strong> / 100
            </p>
          </div>
        ))}

        {/* Emergency */}
        <h2>{t('trips.booklet.emergency', 'Emergency contacts')}</h2>
        <table>
          <thead>
            <tr>
              <th>{t('trips.booklet.country', 'Country')}</th>
              <th>{t('trips.booklet.emergencyNumber', 'Emergency')}</th>
              <th>{t('trips.booklet.embassy', 'Your embassy')}</th>
            </tr>
          </thead>
          <tbody>
            {countries.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">—</td>
              </tr>
            )}
            {countries.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="muted">112 / 911</td>
                <td className="muted">
                  {t('trips.booklet.embassyHint', 'Look up before travel')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="muted" style={{ marginTop: 32, fontSize: 10 }}>
          {t(
            'trips.booklet.footer',
            'Generated by queer.guide — verify emergency numbers and embassy details before travel.',
          )}
        </p>
      </div>
    </>
  );
}
