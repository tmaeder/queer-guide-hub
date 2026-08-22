/**
 * Author paragraphs (blank lines) win; otherwise sentences are grouped four to
 * a paragraph via `Intl.Segmenter` — a plain `. ` split misreads
 * abbreviations like "U.S." as sentence ends.
 *
 * Exists for `editorial_long`, which arrives as one unbroken string (a single
 * 2,569px `<p>` on /country/iran before this).
 */
export function splitProseParagraphs(text: string): string[] {
  const trimmed = text.trim();
  const byBlankLine = trimmed.split(/\n{2,}/).filter((p) => p.trim());
  if (byBlankLine.length > 1) return byBlankLine;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    const sentences = [...seg.segment(trimmed)].map((s) => s.segment);
    const chunks: string[] = [];
    for (let i = 0; i < sentences.length; i += 4) {
      chunks.push(
        sentences
          .slice(i, i + 4)
          .join('')
          .trim(),
      );
    }
    return chunks.filter(Boolean);
  }
  return [trimmed];
}
