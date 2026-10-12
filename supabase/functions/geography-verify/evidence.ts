export type Claims = Record<string, Array<{ rank?: string; mainsnak: { datavalue?: { value: unknown } }; references?: unknown[] }>>;
export interface WikiEntity { id: string; labels?: Record<string, { value: string }>; aliases?: Record<string, Array<{ value: string }>>; claims: Claims }
export const normalise = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export function values(entity: WikiEntity, property: string): unknown[] {
  const statements = (entity.claims[property] ?? []).filter((s) => s.rank !== 'deprecated');
  const preferred = statements.filter((s) => s.rank === 'preferred');
  return (preferred.length ? preferred : statements).map((s) => s.mainsnak.datavalue?.value).filter((v) => v !== undefined);
}
export function ids(entity: WikiEntity, property: string): string[] {
  return values(entity, property).flatMap((value) => typeof value === 'object' && value && 'id' in value ? [String(value.id)] : []);
}
export function matchesName(entity: WikiEntity, name: string) {
  const candidates = [...Object.values(entity.labels ?? {}).map((v) => v.value), ...Object.values(entity.aliases ?? {}).flatMap((v) => v.map((a) => a.value))];
  return candidates.some((v) => normalise(v) === normalise(name));
}
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2-lat1)*rad/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lng2-lng1)*rad/2)**2;
  return 6371008.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
export function coordinateEvidence(entity: WikiEntity, lat: number | null, lng: number | null, threshold: number) {
  const points = values(entity, 'P625').filter((v): v is { latitude: number; longitude: number; globe: string } => !!v && typeof v === 'object' && 'latitude' in v && 'longitude' in v && 'globe' in v && v.globe === 'http://www.wikidata.org/entity/Q2');
  if (lat === null || lng === null || points.length !== 1) return { verified: false, reason: 'Missing or ambiguous reference coordinates', distance: null };
  const distance = distanceMetres(lat,lng,points[0].latitude,points[0].longitude);
  return { verified: distance <= threshold, reason: distance <= threshold ? 'Reference coordinates agree' : 'CMS pin differs from Wikidata reference coordinates', distance };
}
