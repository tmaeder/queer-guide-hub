/** A short opening excerpt; the complete description stays in About. */
export function cityIntroduction(
  description: string | null | undefined,
  editorialHook: string | null | undefined,
  locale = 'en',
): { lead: string; showDescription: boolean } {
  const source = (editorialHook || description || '').trim();
  const paragraph = source.split(/\n\s*\n/)[0];
  let lead = paragraph;

  if (paragraph.length > 280) {
    let segmenter: Intl.Segmenter;
    try {
      segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
    } catch {
      segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    }
    const sentences = Array.from(segmenter.segment(paragraph), ({ segment }) => segment.trim());
    lead = sentences[0];
    if (lead.length > 280) {
      const excerpt = lead.slice(0, 260);
      const lastSpace = excerpt.lastIndexOf(' ');
      lead = `${excerpt.slice(0, lastSpace > 180 ? lastSpace : excerpt.length).trimEnd()}…`;
    }
  }

  return {
    lead,
    showDescription: !!description && lead !== description.trim(),
  };
}
