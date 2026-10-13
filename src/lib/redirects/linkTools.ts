import { validateTarget } from './validation';

export const LINK_ORIGIN = 'https://queer.guide';
export const CAMPAIGN_FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;
export type CampaignFields = Partial<Record<(typeof CAMPAIGN_FIELDS)[number], string>>;

export function isConcretePath(value: string) {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.includes('*') &&
    !/(?:^|\/):[a-zA-Z]/.test(value)
  );
}

export function buildCampaignDestination(
  target: string,
  campaign: CampaignFields,
  parameters: Array<{ key: string; value: string }>,
) {
  const validation = validateTarget(target);
  if (!validation.valid) throw new Error(validation.error);
  const url = new URL(target.trim(), LINK_ORIGIN);
  if (!isConcretePath(url.pathname))
    throw new Error('Replace route placeholders with a concrete destination.');
  if (url.pathname === '/go' || url.pathname.startsWith('/go/'))
    throw new Error('Choose a destination page, rather than another short link.');
  const keys = new Set<string>();
  for (const { key: rawKey, value } of parameters) {
    const key = rawKey.trim();
    if (!key && !value) continue;
    if (!key) throw new Error('Each prefill parameter needs a name.');
    if (keys.has(key)) throw new Error(`Parameter ${key} appears more than once.`);
    if (CAMPAIGN_FIELDS.includes(key as (typeof CAMPAIGN_FIELDS)[number]))
      throw new Error('Set campaign tags in the campaign fields.');
    keys.add(key);
    url.searchParams.set(key, value);
  }
  for (const key of CAMPAIGN_FIELDS)
    if (campaign[key]?.trim()) url.searchParams.set(key, campaign[key]!.trim());
  return target.trim().startsWith('/') ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

export function suggestCampaignSlug(target: string) {
  let last = 'link';
  try {
    last = new URL(target || '/', LINK_ORIGIN).pathname.split('/').filter(Boolean).pop() ?? 'link';
  } catch {
    /* Let destination validation explain an invalid stored URL. */
  }
  const slug =
    last
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 45) || 'link';
  return `${slug}-campaign`;
}

export function publicSourceUrl(source: string) {
  if (!isConcretePath(source)) return null;
  const url = new URL(source, LINK_ORIGIN);
  return url.origin === LINK_ORIGIN ? url.href : null;
}

export interface VisitEvent {
  id: number;
  ts: string;
  country: string | null;
  referer: string | null;
  status: number;
}
export function referrerHost(referer: string | null) {
  if (!referer) return 'Direct / unknown';
  try {
    return new URL(referer).hostname;
  } catch {
    return 'Unknown';
  }
}
export function summariseVisits(events: VisitEvent[]) {
  const daily = new Map<string, number>();
  const countries = new Map<string, number>();
  const referrers = new Map<string, number>();
  for (const event of events) {
    const day = new Date(event.ts).toISOString().slice(0, 10);
    for (const [map, key] of [
      [daily, day],
      [countries, event.country ?? 'Unknown'],
      [referrers, referrerHost(event.referer)],
    ] as const)
      map.set(key, (map.get(key) ?? 0) + 1);
  }
  const ranked = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    daily: [...daily.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    countries: ranked(countries),
    referrers: ranked(referrers),
  };
}
