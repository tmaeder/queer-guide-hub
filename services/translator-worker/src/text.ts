// Pure text handling for the translator worker: chunking, masking protected
// spans, and sanity checks on model output. No I/O here, so it is unit-tested
// directly (test/text.test.ts).
import { franc } from 'franc-min';

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/** Rough token estimate. Gemma's tokenizer gives ~3.5–4 chars/token for Latin
 *  script and ~1 token per CJK/Arabic/Cyrillic char; err high so a chunk plus
 *  its translation fits the 2,048-token context. */
export function estimateTokens(s: string): number {
  let ascii = 0;
  let other = 0;
  for (const ch of s) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 3.5 + other);
}

export interface Chunk {
  text: string;
  /** Whitespace that followed this chunk in the source; re-appended after translation. */
  sep: string;
}

const SENTENCE_END = /(?<=[.!?。！？])\s+/;

/** Split on paragraph, then sentence, then whitespace boundaries so every
 *  chunk is ≤ maxTokens. Joining `text + sep` of all chunks reproduces the
 *  input exactly. */
export function chunkText(input: string, maxTokens = 700): Chunk[] {
  const pieces = splitKeepingSeparators(input, /\n{2,}/);
  const fine: Chunk[] = [];
  for (const p of pieces) {
    if (estimateTokens(p.text) <= maxTokens) fine.push(p);
    else for (const s of splitKeepingSeparators(p.text, SENTENCE_END, p.sep)) {
      if (estimateTokens(s.text) <= maxTokens) fine.push(s);
      else fine.push(...hardSplit(s, maxTokens));
    }
  }
  // Greedily merge neighbours back together while they fit, so the model sees
  // as much context as possible.
  const out: Chunk[] = [];
  for (const c of fine) {
    const last = out[out.length - 1];
    if (last && estimateTokens(last.text + last.sep + c.text) <= maxTokens) {
      last.text = last.text + last.sep + c.text;
      last.sep = c.sep;
    } else out.push({ ...c });
  }
  return out.filter((c, i) => c.text !== '' || i === 0);
}

function splitKeepingSeparators(s: string, re: RegExp, trailing = ''): Chunk[] {
  const out: Chunk[] = [];
  const g = new RegExp(re.source, 'g');
  let last = 0;
  for (let m = g.exec(s); m; m = g.exec(s)) {
    out.push({ text: s.slice(last, m.index), sep: m[0] });
    last = m.index + m[0].length;
  }
  out.push({ text: s.slice(last), sep: trailing });
  return out;
}

function hardSplit(c: Chunk, maxTokens: number): Chunk[] {
  const out: Chunk[] = [];
  let rest = c.text;
  while (estimateTokens(rest) > maxTokens) {
    // Largest prefix that fits, cut at the last whitespace inside it.
    let lo = 1;
    let hi = rest.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (estimateTokens(rest.slice(0, mid)) <= maxTokens) lo = mid;
      else hi = mid - 1;
    }
    const ws = rest.slice(0, lo).search(/\s\S*$/);
    const cut = ws > lo / 2 ? ws : lo;
    const sepMatch = rest.slice(cut).match(/^\s*/)!;
    out.push({ text: rest.slice(0, cut), sep: sepMatch[0] });
    rest = rest.slice(cut + sepMatch[0].length);
  }
  out.push({ text: rest, sep: c.sep });
  return out;
}

// ---------------------------------------------------------------------------
// Masking protected spans
// ---------------------------------------------------------------------------

export interface Glossary {
  doNotTranslate: string[];
  /** term → target language → fixed form, or accepted spellings */
  terms: Record<string, Partial<Record<string, string | string[]>>>;
}

export interface Masked {
  text: string;
  /** token → text to put back */
  restore: Map<string, string>;
  /** Name tokens: may be dropped or repeated by the model (Japanese drops a
   *  repeated subject). Every other token must come back exactly once. */
  soft: Set<string>;
}

// Chosen by measurement against TranslateGemma (docs/translation.md → Masking).
export const token = (i: number) => `[[${i}]]`;
const TOKEN_RE = /\[\[\d+\]\]/g;

const PATTERNS: RegExp[] = [
  /<[^<>\n]{1,200}>/g, // HTML tags
  /\bhttps?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g, // URLs
  /\bwww\.[^\s<>()"']+[^\s<>()"'.,;:!?]/g,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // emails
  /\{\{?[\w.-]+\}?\}/g, // {placeholder} / {{placeholder}}
  /`[^`\n]+`/g, // inline code
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace every structural span (URL, email, placeholder, markup, code) and
 *  every occurrence of `names` (venue/organization names) with an opaque
 *  token, restored verbatim by `unmask`.
 *
 *  Glossary terms are deliberately NOT masked. Measured on TranslateGemma
 *  (2026-11-21): a token standing in for a WORD ("the best known [[2]] brand",
 *  "a [[6]] night") is dropped — LGBTQIA+ lost in ja and ar, "Trans" in fr —
 *  while the same words left in the text survive. Structural tokens and names
 *  in subject position survived in every language. Glossary terms are checked
 *  after translation instead (`checkGlossary`). */
export function mask(input: string, names: string[] = []): Masked {
  const restore = new Map<string, string>();
  const soft = new Set<string>();
  let text = input;
  let n = 0;
  const put = (value: string, isSoft = false) => {
    const t = token(n++);
    restore.set(t, value);
    if (isSoft) soft.add(t);
    return t;
  };
  // Never let pre-existing token-shaped text collide with ours.
  text = text.replace(TOKEN_RE, (m) => put(m));

  for (const re of PATTERNS) text = text.replace(re, (m) => put(m));

  const verbatim = names
    .map((s) => s?.trim() ?? '')
    .filter((s) => s.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const term of verbatim) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, 'gu');
    text = text.replace(re, (m) => put(m, true));
  }
  return { text, restore, soft };
}

const LATIN_TARGETS = new Set(['de', 'fr', 'es', 'it', 'pt']);

/** Glossary check on the finished translation. Returns 'glossary_miss' when a
 *  do-not-translate term present in the source is missing from the output, or
 *  when a glossary term present in the source does not appear in its fixed
 *  form for `target`. */
export function checkGlossary(source: string, output: string, target: string, glossary: Glossary): string | null {
  for (const term of glossary.doNotTranslate) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, 'u');
    if (re.test(source) && !output.includes(term)) return 'glossary_miss';
  }
  for (const [term, forms] of Object.entries(glossary.terms)) {
    const accepted = forms[target];
    if (!accepted) continue;
    // Trailing hyphen blocks prefixes ("trans-Atlantic"); a leading one does
    // not ("anti-trans" is still the term).
    const inSource = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}-])`, 'iu');
    if (!inSource.test(source)) continue;
    const found = (Array.isArray(accepted) ? accepted : [accepted]).some((form) => {
      // A space inside a multi-word form may come back as a hyphen or a
      // non-breaking space ("Drag Queens" / "Drag-Queens" are both German).
      const formRe = escapeRe(form).replace(/ /g, '[\\s\\u00a0-]+');
      // Whole word in Latin targets ("trans" must not pass via "transgenres");
      // CJK has no word boundaries, so a substring is the best test there.
      return LATIN_TARGETS.has(target)
        ? new RegExp(`(?<![\\p{L}\\p{N}])${formRe}(?![\\p{L}\\p{N}])`, 'iu').test(output)
        : new RegExp(formRe, 'iu').test(output);
    });
    if (!found) return 'glossary_miss';
  }
  return null;
}

/** Put protected spans back. Returns null if a strict token was lost or
 *  duplicated, or if any token was invented — the caller retries once, then
 *  fails the job. */
export function unmask(output: string, masked: Masked): string | null {
  const found = output.match(TOKEN_RE) ?? [];
  const counts = new Map<string, number>();
  for (const t of found) {
    if (!masked.restore.has(t)) return null;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const t of masked.restore.keys()) {
    if (!masked.soft.has(t) && counts.get(t) !== 1) return null;
  }
  return output.replace(TOKEN_RE, (t) => masked.restore.get(t)!);
}

// ---------------------------------------------------------------------------
// Language detection and output checks
// ---------------------------------------------------------------------------

const ISO3_TO_1: Record<string, string> = {
  eng: 'en', deu: 'de', fra: 'fr', spa: 'es', ita: 'it', por: 'pt', rus: 'ru', cmn: 'zh', jpn: 'ja',
  kor: 'ko', arb: 'ar', nld: 'nl', swe: 'sv', pol: 'pl', tur: 'tr', ukr: 'uk', ces: 'cs', dan: 'da',
  nob: 'no', fin: 'fi', ell: 'el', hun: 'hu', heb: 'he', ron: 'ro', cat: 'ca', ind: 'id', vie: 'vi',
  tha: 'th', hin: 'hi',
};

/** Source language for the prompt. Short or ambiguous text → 'en' (the site's
 *  source of record is English and most content is). */
export function detectLanguage(text: string): string {
  const t = text.replace(TOKEN_RE, ' ');
  if (t.trim().length < 40) return 'en';
  return ISO3_TO_1[franc(t, { minLength: 40 })] ?? 'en';
}

const SCRIPT: Partial<Record<string, RegExp>> = {
  zh: /\p{Script=Han}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  ko: /\p{Script=Hangul}/u,
  ar: /\p{Script=Arabic}/u,
  ru: /\p{Script=Cyrillic}/u,
};

/** Length ratio bounds (output chars / input chars) per target script. */
function ratioBounds(target: string): [number, number] {
  if (target === 'zh' || target === 'ja') return [0.12, 1.6];
  if (target === 'ko') return [0.18, 1.8];
  return [0.35, 3.2];
}

const TEMPLATE_LEAK = /<start_of_turn>|<end_of_turn>|<bos>|<eos>|<\/?s>|<start_of_image>|^\s*(model|user)\s*\n/i;

/** Returns a short failure code, or null if the output looks like a real
 *  translation into `target`. Codes are safe to log (no content). */
export function checkOutput(source: string, output: string, target: string, sourceLang: string): string | null {
  const out = output.trim();
  if (!out) return 'empty_output';
  if (TEMPLATE_LEAK.test(out)) return 'template_leak';
  const src = source.trim();
  if (src.length >= 40) {
    const [lo, hi] = ratioBounds(target);
    const r = out.length / src.length;
    if (r < lo || r > hi) return 'length_ratio';
    if (sourceLang !== target && out === src) return 'untranslated';
  }
  const letters = out.replace(TOKEN_RE, '').match(/\p{L}/gu) ?? [];
  const script = SCRIPT[target];
  if (script && letters.length >= 10) {
    const hits = letters.filter((c) => script.test(c)).length;
    if (hits / letters.length < 0.3) return 'wrong_language';
  } else if (!script && out.length >= 80 && target !== 'en' && sourceLang === 'en') {
    // Latin targets: only catch the model echoing English back. franc confuses
    // es/pt/gl/ca often enough that a strict equality check fails good output.
    if (franc(out, { minLength: 80 }) === 'eng') return 'wrong_language';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/** "07-23" = 07:00–22:59 local; "22-06" wraps midnight. Bad spec → never quiet. */
export function inQuietHours(now: Date, spec: string): boolean {
  const m = spec.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return false;
  const [from, to] = [Number(m[1]), Number(m[2])];
  const h = now.getHours();
  return from <= to ? h >= from && h < to : h >= from || h < to;
}
