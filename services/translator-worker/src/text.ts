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
  for (const ch of s) (ch.charCodeAt(0) < 128 ? ascii++ : other++);
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
  terms: Record<string, Partial<Record<string, string>>>;
}

export interface Masked {
  text: string;
  /** token → text to put back */
  restore: Map<string, string>;
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

/** Replace every protected span with an opaque token. `names` (venue or
 *  organization names) and `doNotTranslate` terms come back verbatim;
 *  glossary terms come back as the fixed form for `target`. */
export function mask(input: string, target: string, glossary: Glossary, names: string[] = []): Masked {
  const restore = new Map<string, string>();
  let text = input;
  let n = 0;
  const put = (value: string) => {
    const t = token(n++);
    restore.set(t, value);
    return t;
  };
  // Never let pre-existing token-shaped text collide with ours.
  if (TOKEN_RE.test(text)) text = text.replace(TOKEN_RE, (m) => put(m));
  TOKEN_RE.lastIndex = 0;

  for (const re of PATTERNS) text = text.replace(re, (m) => put(m));

  const verbatim = [...names.filter((s) => s && s.trim().length >= 3), ...glossary.doNotTranslate]
    .map((s) => s.trim())
    .sort((a, b) => b.length - a.length); // longest first: "LGBTQIA+" before "LGBT"
  for (const term of verbatim) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, 'gu');
    text = text.replace(re, (m) => put(m));
  }

  const terms = Object.entries(glossary.terms)
    .filter(([, forms]) => forms[target])
    .sort(([a], [b]) => b.length - a.length);
  for (const [term, forms] of terms) {
    // Trailing hyphen blocks prefixes ("trans-Atlantic"); a leading one does not
    // ("anti-trans" is still the term).
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}-])`, 'giu');
    text = text.replace(re, () => put(forms[target]!));
  }
  return { text, restore };
}

/** Put protected spans back. Returns null if any token was lost, duplicated or
 *  invented — the caller retries once, then fails the job. */
export function unmask(output: string, masked: Masked): string | null {
  const found = output.match(TOKEN_RE) ?? [];
  if (found.length !== masked.restore.size) return null;
  if (new Set(found).size !== found.length) return null;
  for (const t of found) if (!masked.restore.has(t)) return null;
  // Restore in reverse so a restored value containing "[[n]]" is never re-expanded.
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
