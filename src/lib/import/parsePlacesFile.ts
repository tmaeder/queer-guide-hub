/**
 * Client-side parsers for place-list files: GPX, KML, GeoJSON (incl. Google
 * Takeout "Saved Places.json") and Google Takeout saved-list CSV. DOMParser
 * based — no dependencies. Live Google Maps share-link scraping is
 * deliberately unsupported (no API, ToS-fragile) — users export via Takeout.
 */

export interface ParsedPlace {
  name: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
}

export const MAX_IMPORT_PLACES = 200;

function rejectUnsafeXml(content: string, ext: string): string {
  const normalized = content.replace(/^\uFEFF/, '').trimStart();
  if (/<!(DOCTYPE|ENTITY)\b/i.test(normalized)) {
    throw new Error(`invalid ${ext} file`);
  }
  return normalized;
}

function num(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clean(places: ParsedPlace[]): ParsedPlace[] {
  return places
    .filter((p) => p.name.trim().length > 0)
    .map((p) => ({ ...p, name: p.name.trim().slice(0, 200) }))
    .slice(0, MAX_IMPORT_PLACES);
}

function parseGpx(doc: Document): ParsedPlace[] {
  return [...doc.querySelectorAll('wpt')].map((wpt) => ({
    name: wpt.querySelector('name')?.textContent ?? '',
    lat: num(wpt.getAttribute('lat')),
    lng: num(wpt.getAttribute('lon')),
    notes: wpt.querySelector('desc')?.textContent?.trim() || null,
  }));
}

function parseKml(doc: Document): ParsedPlace[] {
  return [...doc.querySelectorAll('Placemark')].map((pm) => {
    const coords = pm.querySelector('Point > coordinates')?.textContent?.trim();
    const [lng, lat] = (coords ?? '').split(',').map((s) => num(s));
    return {
      name: pm.querySelector('name')?.textContent ?? '',
      lat: lat ?? null,
      lng: lng ?? null,
      notes: pm.querySelector('description')?.textContent?.trim() || null,
    };
  });
}

interface GeoFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown> & {
    location?: { name?: string; address?: string };
  };
}

function parseGeoJson(text: string): ParsedPlace[] {
  const json = JSON.parse(text) as { features?: GeoFeature[] };
  return (json.features ?? [])
    .filter((f) => f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
    .map((f) => {
      const [lng, lat] = f.geometry!.coordinates as [number, number];
      const p = f.properties ?? {};
      const name =
        (p.title as string) || (p.name as string) || p.location?.name || '';
      return {
        name,
        lat: typeof lat === 'number' ? lat : null,
        lng: typeof lng === 'number' ? lng : null,
        notes: (p.location?.address as string) || null,
      };
    });
}

/** Minimal CSV row splitter handling quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Extract coordinates from a Google Maps URL when present. */
export function coordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  const m =
    url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ??
    url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/) ??
    url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return null;
  return { lat: Number(m[1]), lng: Number(m[2]) };
}

function parseCsv(text: string): ParsedPlace[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const titleIdx = header.indexOf('title');
  const noteIdx = header.indexOf('note');
  const urlIdx = header.indexOf('url');
  if (titleIdx === -1) return [];
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const url = urlIdx >= 0 ? (cols[urlIdx] ?? '') : '';
    const coords = url ? coordsFromMapsUrl(url) : null;
    return {
      name: cols[titleIdx] ?? '',
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      notes: noteIdx >= 0 ? cols[noteIdx]?.trim() || null : null,
    };
  });
}

/**
 * Parses a place file by extension. Throws on malformed input — callers show
 * the error. Result is name-cleaned and capped at MAX_IMPORT_PLACES.
 */
export function parsePlacesFile(filename: string, content: string): ParsedPlace[] {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'gpx' || ext === 'kml') {
    const safeXml = rejectUnsafeXml(content, ext);
    const doc = new DOMParser().parseFromString(safeXml, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error(`invalid ${ext} file`);
    return clean(ext === 'gpx' ? parseGpx(doc) : parseKml(doc));
  }
  if (ext === 'json' || ext === 'geojson') return clean(parseGeoJson(content));
  if (ext === 'csv') return clean(parseCsv(content));
  throw new Error(`unsupported file type: .${ext}`);
}
