// Place classification is independent of coordinate/country verification.
// A GeoNames PPLX label alone must never demote a legal municipality (Culver City).
export function normalizePlaceName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/œ/g, 'oe')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
export function distanceMeters(lat1, lon1, lat2, lon2) {
  if (
    [lat1, lon1, lat2, lon2].some(
      (x) => x === null || x === undefined || !Number.isFinite(Number(x)),
    )
  )
    return null;
  const r = Math.PI / 180;
  const a =
    Math.sin(((Number(lat2) - Number(lat1)) * r) / 2) ** 2 +
    Math.cos(Number(lat1) * r) *
      Math.cos(Number(lat2) * r) *
      Math.sin(((Number(lon2) - Number(lon1)) * r) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function classifyClasses(labels = [], description = '') {
  // Exact municipal forms, not a blanket township/county/district exception.
  // Ontario lower-tier and Quebec parish/township municipalities are local
  // municipalities. Italian sources spell the singular "comune", not "commune".
  const municipalForm = labels.some((label) =>
    /^(?:lower-tier municipality of Ontario|township municipality in Ontario|parish municipality|township municipality|charter township of Michigan|comune of Italy|city with county rights)$/i.test(label),
  );
  // Additional vocabulary must not revive historical places or promote a
  // conflicting neighbourhood/container identity to a municipal profile.
  const conflictingForm = labels.some((label) =>
    /former|historical|ancient|abandoned|ghost town|archaeological|neighbou?rhood|suburb|subdistrict|city district|municipal district|^district of |^area of /i.test(label),
  );
  if (municipalForm && !conflictingForm) return 'municipality';
  // These are autonomous municipal forms, including US boroughs. A German
  // kreisfreie Stadt also carries an urban-district class; that is not a suburb.
  const independent = labels.some(
    (l) =>
      /^(?:city(?:\b|$)|big city$|largest city$|global city$|metropolis$|megacity$|national capital$|federal capital$|charter city$|statutory city\b|urban municipality\b|rural municipality\b|market municipality\b|independent city\b|municipality(?:$| of | in | without )|commune of (?:France|Chile|Italy|Belgium)|borough of (?:Pennsylvania|New Jersey)|township of |civil parish\b|place with town rights)/i.test(
        l,
      ) && !/district|county|former|local municipality|municipal district/i.test(l),
  );
  if (independent) return 'municipality';
  // Country-level district types identify an administrative container. A town
  // with the same name can share its pin, so they do not prove a neighbourhood.
  const administrativeDistrict = labels.some((l) =>
    /^district of (?:India|Bangladesh|the Czech Republic|Costa Rica|Peru)$/i.test(l),
  );
  const subdivision = labels.some((l) =>
    /neighbou?rhood|suburb|^area of |quarter|arrondissement|district of |municipal district|city district|subdistrict|borough of (?:New York|London)|London borough|city ward|ward of |ortsteil|stadtteil/i.test(
      l,
    ),
  );
  const administrative = administrativeDistrict || labels.some((l) =>
    /county$|province|prefecture|local municipality|local government area|metropolitan district|administrative territorial entity|federal state|oblast|district$/i.test(
      l,
    ),
  );
  const settlement = labels.some(
    (l) =>
      /^(?:town$|market town$|village\b|hamlet\b|human settlement$|locality of Mexico$|populated place$|national capital$|de facto national capital$|metropolis$|megacity$|port city$|college town$|county seat$|district capital$)/i.test(
        l,
      ) && !/former|abandoned/i.test(l),
  );
  const nonplace = labels.some((l) =>
    /(?:^|\b)(?:street|road|avenue|railway station|school|gymnasium|mountain|river|island|airport|hospital|hotel|building|country|historical country)(?:$| of | in )/i.test(
      l,
    ),
  );
  if (administrativeDistrict) return settlement ? 'settlement' : 'administrative_area';
  if (subdivision) return settlement ? 'mixed_subdivision' : 'subdivision';
  if (settlement) return 'settlement';
  if (administrative) return 'administrative_area';
  if (nonplace) return 'nonplace';
  if (/^(?:neighbou?rhood|district|suburb|quarter|area) (?:of|in|within) /i.test(description))
    return 'subdivision';
  return 'undetermined';
}
export const SETTLEMENT_CODES = new Set([
  'PPL',
  'PPLA',
  'PPLA2',
  'PPLA3',
  'PPLA4',
  'PPLC',
  'PPLG',
  'PPLF',
]);
export function usableMatches(row) {
  return row.matches.filter((g) => g.distance_m !== null && g.distance_m <= 10000);
}
/** @param {{classes?: string[], description?: string, geonames?: {code: string}[]}} evidence */
export function classifyEvidence({ classes = [], description = '', geonames = [] }) {
  const kind = classifyClasses(classes, description);
  if (kind === 'municipality')
    return {
      status: 'municipality',
      reason: 'Explicit independent city or municipal classification',
    };
  if (['subdivision', 'mixed_subdivision'].includes(kind)) {
    const conflictingTown = classes.some((l) =>
      /^(?:town$|market town$|village\b|hamlet\b)/i.test(l),
    );
    const pplx = geonames.some((g) => g.code === 'PPLX');
    if (kind === 'subdivision' || (pplx && !conflictingTown))
      return {
        status: 'non_city',
        reason: 'Explicit subdivision classification; not an independent city',
      };
    return { status: 'review', reason: 'Settlement and subdivision classifications conflict' };
  }
  if (kind === 'nonplace')
    return {
      status: 'review',
      reason: 'Identifier describes a non-settlement; verify the record identity',
    };
  if (kind === 'administrative_area')
    return {
      status: 'review',
      reason: 'Administrative area; settlement identity needs corroboration',
    };
  if (kind === 'settlement')
    return { status: 'settlement', reason: 'Wikidata classifies an actual settlement' };
  if (geonames.some((g) => SETTLEMENT_CODES.has(g.code)))
    return {
      status: 'populated_place',
      reason:
        'Name, country and coordinates match a GeoNames populated place; autonomy not independently established',
    };
  if (geonames.some((g) => g.code === 'PPLX'))
    return {
      status: 'review',
      reason:
        'GeoNames section of populated place; independent municipal status needs corroboration',
    };
  return { status: 'unresolved', reason: 'No corroborated settlement classification' };
}
