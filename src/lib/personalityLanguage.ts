import { detectLanguage } from '@/i18n/detectLanguage';

/** Prose can contain foreign names/titles without changing its language.
 * Ambiguous short strings deliberately return null, rather than false certainty.
 */
export function detectPersonalityLanguage(text?: string | null): string | null {
  if (!text?.trim()) return null;
  const letters = text.match(/\p{L}/gu) ?? [];
  const latin = text.match(/\p{Script=Latin}/gu) ?? [];
  if (latin.length < letters.length * 0.6) return detectLanguage(text);
  const prose = text.replace(/[^\p{Script=Latin}\s'-]/gu, ' ');
  const words = prose.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const english = new Set([
    'the',
    'and',
    'of',
    'to',
    'for',
    'with',
    'is',
    'was',
    'were',
    'who',
    'as',
    'born',
    'known',
    'an',
    'a',
    'in',
    'on',
    'from',
    'has',
    'have',
    'her',
    'his',
    'their',
    'she',
    'he',
    'they',
  ]);
  if (new Set(words.filter((w) => english.has(w))).size >= 3) return 'en';
  const candidate = detectLanguage(prose);
  if (!candidate || candidate === 'en') return candidate;
  const markers: Record<string, Set<string>> = {
    de: new Set([
      'der',
      'die',
      'das',
      'und',
      'mit',
      'für',
      'von',
      'ein',
      'eine',
      'des',
      'den',
      'ist',
      'war',
    ]),
    fr: new Set(['le', 'la', 'les', 'et', 'du', 'des', 'avec', 'pour', 'une', 'est', 'dans']),
    es: new Set(['el', 'los', 'las', 'del', 'con', 'para', 'por', 'una', 'es', 'fue']),
    it: new Set(['il', 'lo', 'gli', 'della', 'con', 'per', 'una', 'è', 'nella']),
    pt: new Set(['os', 'as', 'do', 'da', 'dos', 'das', 'com', 'para', 'um', 'uma', 'é']),
  };
  return words.filter((w) => markers[candidate]?.has(w)).length >= 3 ? candidate : null;
}

export function hasMixedScriptWord(text: string): boolean {
  return /\p{Script=Latin}\p{Script=Cyrillic}|\p{Script=Cyrillic}\p{Script=Latin}/u.test(text);
}
