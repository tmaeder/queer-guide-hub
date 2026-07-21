import { useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminPersonalityById } from '@/hooks/usePageFetchers';
import { personalityStatus } from '@/lib/personalityStatus';

/**
 * Admin-only person data sheet ("Datenblatt"), ported from the standalone PHP
 * tool. Renders a clean A4 document and auto-triggers the browser print dialog
 * so editors get a PDF via "Save as PDF" — no server-side PDF dependency
 * (same approach as TripBookletPage). Unlike the public detail page this loads
 * by id WITHOUT the visibility filter, so draft/private records print too.
 *
 * Print isolation: the app renders a global header/main around every route, so
 * a `@media print` block hides everything except `.pds` and pins it to the
 * page origin — the printed output is the data sheet alone, no admin chrome.
 */

type BirthCity = {
  name?: string | null;
  name_de?: string | null;
  name_en?: string | null;
  country?: { code?: string | null; name?: string | null; flag_emoji?: string | null } | null;
} | null;

interface AdminPersonality {
  id: string;
  name: string;
  pronouns?: string | null;
  profession?: string | null;
  description?: string | null;
  bio?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  death_date?: string | null;
  death_place?: string | null;
  cause_of_death?: string | null;
  is_living?: boolean | null;
  nationality?: string | null;
  lgbti_connection?: string | null;
  lgbti_details?: string | null;
  lgbti_connection_source?: string | null;
  website_url?: string | null;
  profile_url?: string | null;
  wikidata_qid?: string | null;
  wikipedia_url?: string | null;
  social_links?: Record<string, string> | null;
  external_ids?: Record<string, string> | null;
  fields?: unknown;
  achievements?: unknown;
  tags?: unknown;
  verification_status?: string | null;
  review_status?: string | null;
  visibility?: string | null;
  needs_attention?: boolean | null;
  quality_score?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  birth_city?: BirthCity;
}

const toList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).map(String);
  if (typeof v === 'string' && v.trim() !== '') return [v];
  return [];
};

const deDate = (iso?: string | null): string => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return iso;
};

const Row = ({ label, value }: { label: string; value?: string | null }) =>
  value && String(value).trim() !== '' ? (
    <div className="pds-row">
      <span className="pds-k">{label}</span>
      <span className="pds-v">{value}</span>
    </div>
  ) : null;

export default function PersonalityDataSheet() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get('print') === '1';
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-personality-datasheet', id],
    queryFn: () => fetchAdminPersonalityById<AdminPersonality>(id as string),
    enabled: !!id,
  });

  // Only auto-open the print dialog when launched from the editor's "Datenblatt"
  // button (?print=1). Browsing the sheet from admin lists just views it.
  useEffect(() => {
    if (!data || !autoPrint) return;
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, [data, autoPrint]);

  const cityName = useMemo(() => {
    const c = data?.birth_city;
    if (!c) return '';
    const nm = c.name_de || c.name || c.name_en || '';
    const country = c.country?.name ? `${c.country.flag_emoji ? c.country.flag_emoji + ' ' : ''}${c.country.name}` : '';
    return [nm, country].filter(Boolean).join(', ');
  }, [data]);

  if (isLoading) return <div className="p-8">Lädt…</div>;
  if (error || !data) return <div className="p-8">Person nicht gefunden.</div>;

  const p = data;
  const st = personalityStatus(p);
  const social = (p.social_links && typeof p.social_links === 'object' ? p.social_links : {}) as Record<string, string>;
  const external = (p.external_ids && typeof p.external_ids === 'object' ? p.external_ids : {}) as Record<string, string>;
  const fields = toList(p.fields);
  const achievements = toList(p.achievements);
  const tags = toList(p.tags);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm 16mm; }
        @media print {
          body * { visibility: hidden !important; }
          .pds, .pds * { visibility: visible !important; }
          .pds { position: absolute; inset: 0; margin: 0; padding: 0; }
          .pds .no-print { display: none !important; }
        }
        .pds { max-width: 720px; margin: 0 auto; padding: 24px; font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; color: #111; background: #fff; }
        .pds .toolbar { display: flex; gap: 8px; margin-bottom: 20px; }
        .pds .toolbar button { padding: 6px 12px; border: 1px solid #111; background: #fff; cursor: pointer; font: inherit; font-size: 12px; border-radius: 8px; }
        .pds h1 { font-size: 28px; margin: 0 0 2px; font-weight: 800; letter-spacing: -0.01em; }
        .pds .sub { font-size: 13px; color: #555; margin: 0 0 10px; }
        .pds .status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #333; margin-bottom: 16px; }
        .pds .dot { width: 9px; height: 9px; border-radius: 9px; display: inline-block; border: 1px solid #999; }
        .pds .dot.green { background: #2e7d32; border-color: #2e7d32; }
        .pds .dot.yellow { background: #b8860b; border-color: #b8860b; }
        .pds .dot.red { background: #b23a47; border-color: #b23a47; }
        .pds .dot.gray { background: #bbb; }
        .pds h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; margin: 20px 0 6px; font-weight: 700; border-bottom: 2px solid #111; padding-bottom: 3px; }
        .pds .pds-row { display: flex; gap: 10px; font-size: 12px; line-height: 1.5; padding: 2px 0; }
        .pds .pds-k { flex: 0 0 150px; color: #666; }
        .pds .pds-v { flex: 1; }
        .pds .prose { font-size: 12px; line-height: 1.55; margin: 4px 0; white-space: pre-wrap; }
        .pds .foot { margin-top: 28px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 10px; color: #777; }
        @media (prefers-color-scheme: dark) {
          .pds { background: #fff; color: #111; }
        }
      `}</style>

      <div className="pds">
        <div className="toolbar no-print">
          <button onClick={() => window.print()}>Drucken / Als PDF speichern</button>
          <button onClick={() => window.close()}>Schließen</button>
        </div>

        <h1>{p.name}</h1>
        {p.profession && <p className="sub">{p.profession}</p>}
        <div className="status">
          <span className={`dot ${st.tone}`} /> Status: {st.label}
          {typeof p.quality_score === 'number' && <> · Qualität {Math.round(p.quality_score)}</>}
        </div>

        <h2>Lebensdaten</h2>
        <Row label="Pronomen" value={p.pronouns} />
        <Row label="Geburtsdatum" value={deDate(p.birth_date)} />
        <Row label="Geburtsort" value={p.birth_place || cityName} />
        <Row label="Nationalität" value={p.nationality} />
        <Row label="Lebt" value={p.is_living === false ? 'nein' : p.is_living ? 'ja' : ''} />
        <Row label="Todesdatum" value={deDate(p.death_date)} />
        <Row label="Todesort" value={p.death_place} />
        <Row
          label="Todesursache"
          value={p.cause_of_death && p.cause_of_death !== 'unknown' ? p.cause_of_death : ''}
        />

        <h2>Einordnung</h2>
        <Row label="Fachgebiete" value={fields.join(', ')} />
        <Row label="Auszeichnungen" value={achievements.join(', ')} />
        <Row label="Tags" value={tags.join(', ')} />
        <Row label="Sichtbarkeit" value={p.visibility} />

        {(p.lgbti_connection || p.lgbti_details) && (
          <>
            <h2>LGBTQ+</h2>
            {p.lgbti_connection && <p className="prose">{p.lgbti_connection}</p>}
            {p.lgbti_details && <p className="prose">{p.lgbti_details}</p>}
          </>
        )}

        {(p.website_url || p.profile_url || p.wikipedia_url || p.wikidata_qid ||
          Object.keys(social).length > 0 || Object.keys(external).length > 0) && (
          <>
            <h2>Links & Kennungen</h2>
            <Row label="Website" value={p.website_url} />
            <Row label="Profil" value={p.profile_url} />
            <Row label="Wikipedia" value={p.wikipedia_url} />
            <Row label="Wikidata" value={p.wikidata_qid} />
            {Object.entries(social).map(([k, v]) =>
              v ? <Row key={k} label={k} value={v} /> : null,
            )}
            {Object.entries(external).map(([k, v]) =>
              v ? <Row key={`ext-${k}`} label={k} value={String(v)} /> : null,
            )}
          </>
        )}

        {(p.description || p.bio || p.lgbti_connection_source) && (
          <>
            <h2>Beleg & Anmerkungen</h2>
            {p.lgbti_connection_source && (
              <Row label="Quelle" value={p.lgbti_connection_source} />
            )}
            {p.description && <p className="prose">{p.description}</p>}
            {p.bio && <p className="prose">{p.bio}</p>}
          </>
        )}

        <div className="foot">
          Queer.Guide · Datenblatt · erstellt {deDate(new Date().toISOString())} · nur belegte
          Angaben, keine Kontaktdaten lebender Personen
        </div>
      </div>
    </>
  );
}
