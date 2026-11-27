/**
 * Detects prose that stops mid-sentence and trims it back to the last complete
 * sentence, so a page never presents a fragment as finished text.
 *
 * Imported extracts are cut by naive sentence splitters, which read the initial
 * in "Marsha P. Johnson" as a full stop: Sylvia Rivera's stored biography ends
 * "With close friend Marsha P." The caller labels the result as an excerpt and
 * links to the source; it never writes a continuation.
 *
 * Short one-clause labels ("German actor and singer") carry no terminal
 * punctuation by design and are left alone.
 */
export interface CompletedProse {
  text: string;
  /** True when trailing words were removed because they formed an unfinished sentence. */
  isExcerpt: boolean;
}

// Sentence end: terminal mark, optional closing quote/bracket, then whitespace.
const SENTENCE_END = /[.!?…]["”’')\]]*(?=\s)/g;
const TERMINAL = /[.!?…]["”’')\]]*$/;
// A final token that is a lone capital initial ("P.") — a name cut in half.
const TRAILING_INITIAL = /(?:^|[\s(])\p{Lu}\.$/u;
// A label is short and single-clause; it has no sentence to finish.
const LABEL_MAX = 80;
// The cut-off tail of a split name is short ("With close friend Marsha P.").
// Longer final sentences ending on a letter ("her album Madame X.") are real.
const FRAGMENT_MAX_WORDS = 8;

function lastSentenceStart(text: string): number {
  let start = -1;
  for (const m of text.matchAll(SENTENCE_END)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end < text.length) start = end;
  }
  return start;
}

export function completeProse(input: string | null | undefined): CompletedProse {
  const text = (input ?? '').trim();
  if (!text) return { text: '', isExcerpt: false };

  const start = lastSentenceStart(text);
  // Single-sentence text: nothing earlier to fall back to.
  if (start < 0) return { text, isExcerpt: false };

  const tail = text.slice(start).trim();
  const tailWords = tail.split(/\s+/).length;
  const endsOnInitial = TRAILING_INITIAL.test(text) && tailWords <= FRAGMENT_MAX_WORDS;
  const unterminated = !TERMINAL.test(text) && text.length > LABEL_MAX;

  if (!endsOnInitial && !unterminated) return { text, isExcerpt: false };
  return { text: text.slice(0, start).trim(), isExcerpt: true };
}

/** Best available "continue reading" target for a Wikidata-sourced record. */
export function continuationUrl(
  wikipediaUrl?: string | null,
  wikidataQid?: string | null,
): string | null {
  if (wikipediaUrl && /^https?:\/\//.test(wikipediaUrl)) return wikipediaUrl;
  if (wikidataQid && /^Q\d+$/.test(wikidataQid)) {
    return `https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${wikidataQid}`;
  }
  return null;
}
