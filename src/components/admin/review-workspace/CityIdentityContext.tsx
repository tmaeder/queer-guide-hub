import { ExternalLink } from '@/components/icons';
import { reviewHttpUrl } from './reviewEvidence';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
function coordinate(value: unknown, limit: number) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}
function point(latitude: unknown, longitude: unknown) {
  const lat = coordinate(latitude, 90),
    lng = coordinate(longitude, 180);
  return lat !== null && lng !== null
    ? { lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` }
    : null;
}
const relationshipLabels: Record<string, string> = {
  venues: 'Venues',
  events: 'Events',
  organizations: 'Organizations',
  hotels: 'Hotels',
  neighbourhoods: 'Neighbourhoods',
  child_places: 'Child places',
  news_articles: 'News articles',
  birthplaces: 'People’s birthplaces',
  death_places: 'People’s places of death',
  festivals: 'Festivals',
  guides: 'Guides',
  milestones: 'Milestones',
  competition_editions: 'Competition editions',
  competition_entrants: 'Competition entrants',
  saved_and_private_links: 'Saved and private links',
};
function Link({ url, children }: { url: unknown; children: React.ReactNode }) {
  const safe = reviewHttpUrl(url);
  return safe ? (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-9 items-center gap-2 break-words text-sm underline underline-offset-4"
    >
      {children}
      <ExternalLink size={14} className="shrink-0" />
    </a>
  ) : null;
}
export function CityIdentityContext({ value }: { value: unknown }) {
  const city = object(value);
  if (!text(city.name))
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Current place details are unavailable. Refresh the evidence before deciding.
      </p>
    );
  const stored = point(city.latitude, city.longitude);
  const source = object(city.source_coordinates);
  const sourcePoint = point(source.lat, source.lng);
  const coordinateConflict =
    !!stored &&
    !!sourcePoint &&
    (Math.abs(stored.lat - sourcePoint.lat) > 0.01 ||
      Math.abs(stored.lng - sourcePoint.lng) > 0.01);
  const retracted = object(city.retracted_identity);
  const classification = object(city.classification);
  const geography = object(city.geography);
  const geographyChecks = object(geography.checks);
  const qid = text(city.wikidata_qid);
  const validQid = qid && /^Q[1-9]\d*$/.test(qid) ? qid : null;
  const oldQid = text(retracted.qid);
  const counts = object(city.relationship_counts);
  const updatedAt = text(city.updated_at);
  const updatedDate =
    updatedAt && Number.isFinite(Date.parse(updatedAt)) ? new Date(updatedAt) : null;
  const relationships = Object.entries(relationshipLabels).flatMap(([key, label]) => {
    const count = counts[key];
    return typeof count === 'number' && Number.isSafeInteger(count) && count > 0
      ? [{ key, label, count }]
      : [];
  });
  const countsKnown = Object.keys(relationshipLabels).every(
    (key) =>
      typeof counts[key] === 'number' &&
      Number.isSafeInteger(counts[key]) &&
      Number(counts[key]) >= 0,
  );
  const sources = new Map<string, string>();
  for (const value of Array.isArray(classification.sources) ? classification.sources : []) {
    const url = reviewHttpUrl(value);
    if (url) sources.set(url, 'Classification source');
  }
  for (const value of Array.isArray(geography.sources) ? geography.sources : []) {
    const entry = object(value),
      url = reviewHttpUrl(entry.url);
    if (url) sources.set(url, text(entry.title) ?? 'Geography source');
  }
  const lifecycle =
    {
      placeholder: 'Unresolved placeholder',
      real: 'Active place',
      ghost: 'Archived',
      merged: 'Merged',
    }[String(city.shell_status)] ?? 'Not recorded';
  const geographyStatus =
    {
      review: 'Review needed',
      stale: 'Evidence needs refreshing',
      verified: 'Verified',
      not_applicable: 'Not applicable',
    }[String(geography.status)] ?? 'Not recorded';
  return (
    <section aria-label="Current city identity" className="space-y-6 border-y border-border py-6">
      <div>
        <h3 className="text-sm font-semibold">Stored place</h3>
        <p className="mt-2 break-words text-lg font-semibold">{String(city.name)}</p>
        <p className="mt-1 text-sm">
          {[
            text(city.region_name) ?? text(city.region_code),
            text(city.country) ?? text(city.country_code),
          ]
            .filter(Boolean)
            .join(' · ') || 'Country and region not recorded'}
        </p>
        {updatedDate && (
          <p className="mt-2 text-xs text-muted-foreground">
            Record updated{' '}
            <time dateTime={updatedDate.toISOString()}>{updatedDate.toLocaleString()}</time>
          </p>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Stored coordinates</dt>
          <dd className="mt-1 tabular-nums">{stored?.label ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Current identifier</dt>
          <dd className="mt-1">
            {validQid ? (
              <Link url={`https://www.wikidata.org/wiki/${validQid}`}>Wikidata {validQid}</Link>
            ) : (
              'No Wikidata identifier'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Lifecycle</dt>
          <dd className="mt-1">{lifecycle}</dd>
        </div>
        {sourcePoint && (
          <div>
            <dt className="text-muted-foreground">Captured source coordinates</dt>
            <dd className="mt-1 tabular-nums">{sourcePoint.label}</dd>
          </div>
        )}
        {text(city.wikipedia_title) && (
          <div>
            <dt className="text-muted-foreground">Stored Wikipedia title</dt>
            <dd className="mt-1 break-words">{String(city.wikipedia_title)}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Search indexing</dt>
          <dd className="mt-1">
            {city.seo_indexable === true
              ? 'Enabled'
              : city.seo_indexable === false
                ? 'Disabled'
                : 'Not recorded'}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-x-6">
        {stored && (
          <Link url={`https://www.openstreetmap.org/#map=12/${stored.lat}/${stored.lng}`}>
            Open stored coordinates on map
          </Link>
        )}
        <Link url={city.official_website}>Stored official website</Link>
      </div>
      {(coordinateConflict || text(retracted.reason)) && (
        <div
          className="space-y-2 bg-muted/40 p-4"
          role="note"
          aria-label="Conflicting identity evidence"
        >
          <h4 className="text-sm font-semibold">Source evidence needs attention</h4>
          {coordinateConflict && (
            <p className="text-sm leading-relaxed">
              The stored coordinates differ from the captured source coordinates:{' '}
              <span className="tabular-nums">{sourcePoint?.label}</span>. Check which place the
              source describes before copying its facts.
            </p>
          )}
          {coordinateConflict && sourcePoint && (
            <Link
              url={`https://www.openstreetmap.org/#map=12/${sourcePoint.lat}/${sourcePoint.lng}`}
            >
              Open captured source coordinates on map
            </Link>
          )}
          {text(retracted.reason) && (
            <p className="text-sm leading-relaxed">
              A previous identifier was retracted: {String(retracted.reason)}
              {text(retracted.title) ? ` (${String(retracted.title)})` : ''}.
            </p>
          )}
          {oldQid && /^Q[1-9]\d*$/.test(oldQid) && (
            <Link url={`https://www.wikidata.org/wiki/${oldQid}`}>
              Inspect retracted Wikidata {oldQid}
            </Link>
          )}
        </div>
      )}
      <div>
        <h4 className="text-sm font-semibold">Current verification</h4>
        <p className="mt-2 text-sm leading-relaxed">
          {text(classification.reason) ?? 'Settlement classification has not been recorded.'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Geography: {geographyStatus}</p>
        {text(geographyChecks.reason) && geographyChecks.reason !== classification.reason && (
          <p className="mt-1 text-sm leading-relaxed">{String(geographyChecks.reason)}</p>
        )}
        {!!sources.size && (
          <div className="mt-2 flex flex-wrap gap-x-6">
            {[...sources].map(([url, label]) => (
              <Link key={url} url={url}>
                {label}
              </Link>
            ))}
          </div>
        )}
      </div>
      <div>
        <h4 className="text-sm font-semibold">Related records</h4>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Counts include historical and private relationships. An empty venue list does not mean the
          place is unused.
        </p>
        {!!relationships.length && (
          <dl className="mt-4 divide-y divide-border border-y border-border">
            {relationships.map(({ key, label, count }) => (
              <div key={key} className="flex items-start justify-between gap-4 py-2 text-sm">
                <dt>{label}</dt>
                <dd className="shrink-0 tabular-nums font-medium">{count.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        )}
        {!relationships.length && (
          <p className="mt-4 text-sm">
            {countsKnown
              ? 'No relationships are currently recorded.'
              : 'Relationship counts are unavailable.'}
          </p>
        )}
        {!!relationships.length && !countsKnown && (
          <p className="mt-2 text-sm text-muted-foreground">
            Some relationship counts are unavailable.
          </p>
        )}
      </div>
    </section>
  );
}
