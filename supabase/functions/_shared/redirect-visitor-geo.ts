/* eslint no-control-regex: "off" -- Metadata must not carry header/control characters. */
const visitorGeoFields = ['city', 'region', 'continent'] as const;
type GeoField = typeof visitorGeoFields[number];
type VisitorGeo = Partial<Record<GeoField, unknown>>;

function cleanVisitorGeo(value: string, max: number) {
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, '')).slice(0, max).join('');
}

/** HTTP header values are bytes, so relay Unicode using an explicit ASCII wire format. */
export function forwardVisitorGeo(headers: Headers, geo?: VisitorGeo | null) {
  for (const field of visitorGeoFields) {
    const name = 'x-qg-visitor-' + field;
    headers.delete(name);
    headers.delete(name + '-utf8');
    if (typeof geo?.[field] !== 'string') continue;
    const value = cleanVisitorGeo(geo[field], field === 'continent' ? 2 : 128);
    if (!value) continue;
    try {
      headers.set(name + '-utf8', encodeURIComponent(value));
      // Older consumers can still record ASCII names during a rolling release.
      // Omit Unicode rather than giving them corrupted bytes.
      if (/^[\x20-\x7e]+$/.test(value)) headers.set(name, value);
    } catch {
      // Malformed surrogate input must not turn a working redirect into a 500.
    }
  }
}

export function readVisitorGeo(headers: Headers, field: GeoField) {
  const name = 'x-qg-visitor-' + field;
  const encoded = headers.get(name + '-utf8');
  let value = headers.get(name);
  if (encoded !== null) {
    if (encoded.length > 1536) return null;
    try { value = decodeURIComponent(encoded); } catch { return null; }
  }
  return value ? cleanVisitorGeo(value, field === 'continent' ? 2 : 128) || null : null;
}
