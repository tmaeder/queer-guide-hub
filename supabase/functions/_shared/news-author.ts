// A conservative rejection policy, not a name validator. Mononyms, pen names,
// non-Latin names and multiple credited people remain valid candidates.
const COLLECTIVE = /^(?:editors?|editorial(?: team| staff| board)?|staff(?: writers?| reporters?)?|staff writer|newsroom|news team|redaktion|redaktions(?:team)?|admin|administrator|the editors|the editorial team|unknown|none|null|undefined|anonymous)$/i;
const KNOWN_COLLECTIVES = new Set(['pn freelancer', 'lesbian chronicles', 'sodomarama', 'your queer story', 'transadvocate', 'homestead on the corner | realm', 'legal - lgbt bar of new york', 'q 播客製作委員會', 'podbean development', 'foxnews', 'new york post', 'huffpost', 'press room', 'associated press', 'the associated press', 'reuters', 'mim', 'well established lesbian']);
const creditKey = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const GENERIC_CREDIT = /(?:\b(?:editors?|staff|reporter)\b|^redazione\b)/i;
const BRAND = /\b(?:podcasts?|pod|network|productions|publishing|news agency|media|radio|studio\d+|collective|church|council|presents)\b/i;

export function personAuthorCandidate(
  raw: unknown,
  credits: Array<string | null | undefined> = [],
): string | null {
  if (Array.isArray(raw)) return raw.map((part) => personAuthorCandidate(part, credits)).filter(Boolean).join(', ') || null;
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((part) => personAuthorCandidate(part, credits)).filter(Boolean).join(', ') || null;
      }
    } catch { /* ordinary byline containing a bracket */ }
  }
  if (/^@/.test(value) || /^https?:\/\//i.test(value) || /^\/(?:u|r)\//i.test(value)) return null;
  value = value.replace(/\s+@\s+.*$/, '');
  value = value.replace(/^(?:Queer Theology|Sony Music Entertainment)\s*\/\s*/i, '')
    .replace(/\s*(?:& Studio71|\/ TableCakes Productions|\/ Beyond Sunset|\| Gay Men’s Brotherhood)$/i, '')
    .replace(/\s*• Life Architect$/i, '')
    .replace(/(?: - The Buckeye Flame|, the 19th)$/i, '');
  value = value.replace(/https?:\/\/\S+/gi, '').replace(/^(?:(?:published|written)\s+)?by\s*:?\s+/i, '').replace(/\s+/g, ' ').trim();
  if (value.length < 2 || value.length > 255 || /^\d+$/.test(value) || (value.includes(';') || [...value].some((character) => character.charCodeAt(0) < 32)) || /^\/[a-z0-9_-]+$/i.test(value)) return null;
  if (/^[a-z0-9.-]+\.(?:com|org|net|co\.uk)$/i.test(value)) return null;
  if (COLLECTIVE.test(value) || GENERIC_CREDIT.test(value) || BRAND.test(value) || KNOWN_COLLECTIVES.has(value.toLowerCase()) || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value)) return null;
  if (credits.some((credit) => credit && creditKey(credit) === creditKey(value))) return null;
  return value;
}
