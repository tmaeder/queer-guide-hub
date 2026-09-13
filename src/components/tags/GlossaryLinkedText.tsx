import { Fragment, useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useGlossaryLinkVocabulary } from '@/hooks/useGlossaryLinkVocabulary';
import { cn } from '@/lib/utils';
import { glossaryHref, segmentGlossaryText } from '@/lib/glossaryLinks';

/**
 * Body prose with the glossary terms it mentions turned into links.
 *
 * Replaces a bare `<p>{description}</p>` / `{text}` at the prose sites. The
 * links are DERIVED at render time from the reviewed `glossary_link_terms`
 * vocabulary — nothing is stored in the prose column, so a term that is later
 * merged, deprecated or un-reviewed stops linking on the next render instead of
 * rotting into a dead anchor. (`unified_tags` keeps 5,802 deprecated and 144
 * merged rows at their old slugs, so stored anchors would rot silently.)
 *
 * Renders the text unchanged when the vocabulary is empty or still loading, so
 * prose is never blocked on a fetch.
 */
export function GlossaryLinkedText({
  text,
  currentSlug,
  maxLinks,
  className,
}: {
  text: string | null | undefined;
  /** Slug of the glossary entry being rendered, if the host page is one. */
  currentSlug?: string | null;
  maxLinks?: number;
  className?: string;
}) {
  const vocabulary = useGlossaryLinkVocabulary();

  const segments = useMemo(
    () => (text ? segmentGlossaryText(text, vocabulary, { currentSlug, maxLinks }) : []),
    [text, vocabulary, currentSlug, maxLinks],
  );

  if (!text) return null;

  return (
    <>
      {segments.map((segment, i) =>
        segment.kind === 'link' ? (
          <LocalizedLink
            key={i}
            to={glossaryHref(segment.slug)}
            className={cn('underline underline-offset-4 decoration-border', className)}
            data-glossary-link={segment.slug}
          >
            {segment.text}
          </LocalizedLink>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Paragraph-splitting wrapper for the several prose sites that already do
 * `text.split(/\n{2,}/).map(...)` by hand.
 *
 * The link budget is spent across the WHOLE document, not per paragraph: the
 * cap exists so a page does not read as spam, and a per-paragraph cap would
 * multiply it by the paragraph count. Splitting first and calling the matcher
 * per paragraph would also re-link the same term in every paragraph, defeating
 * first-mention-only. So the document is matched once and the segments are
 * distributed back into paragraphs.
 */
export function GlossaryLinkedProse({
  text,
  currentSlug,
  maxLinks,
  className,
  paragraphClassName,
}: {
  text: string | null | undefined;
  currentSlug?: string | null;
  maxLinks?: number;
  className?: string;
  paragraphClassName?: string;
}) {
  const vocabulary = useGlossaryLinkVocabulary();

  const paragraphs = useMemo(() => {
    if (!text) return [];
    const segments = segmentGlossaryText(text, vocabulary, { currentSlug, maxLinks });
    const out: (typeof segments)[] = [[]];
    for (const segment of segments) {
      if (segment.kind === 'text' && /\n{2,}/.test(segment.text)) {
        const parts = segment.text.split(/\n{2,}/);
        parts.forEach((part, i) => {
          if (i > 0) out.push([]);
          if (part) out[out.length - 1].push({ kind: 'text', text: part });
        });
      } else {
        out[out.length - 1].push(segment);
      }
    }
    return out.filter((p) => p.some((s) => s.text.trim().length > 0));
  }, [text, vocabulary, currentSlug, maxLinks]);

  if (paragraphs.length === 0) return null;

  return (
    <div className={className}>
      {paragraphs.map((segments, pi) => (
        <p key={pi} className={paragraphClassName}>
          {segments.map((segment, i) =>
            segment.kind === 'link' ? (
              <LocalizedLink
                key={i}
                to={glossaryHref(segment.slug)}
                className="underline underline-offset-4 decoration-border"
                data-glossary-link={segment.slug}
              >
                {segment.text}
              </LocalizedLink>
            ) : (
              <Fragment key={i}>{segment.text}</Fragment>
            ),
          )}
        </p>
      ))}
    </div>
  );
}
