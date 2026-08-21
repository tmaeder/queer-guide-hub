import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { splitProseParagraphs } from '@/lib/prose';

/**
 * Long-form prose behind a line clamp with an explicit expand toggle.
 *
 * Exists because `editorial_long` arrives as one unbroken string — on Iran it
 * rendered as a single 2,569px `<p>` that pushed the rights section 4,300px
 * down the page. Collapsed, the text clamps to a few lines; expanded, it is
 * re-chunked into readable paragraphs with `Intl.Segmenter` (sentence
 * granularity — a plain `. ` split misreads abbreviations).
 *
 * The toggle only renders when the text actually overflows the clamp, so
 * short editorials never grow a dead button. Crawlers are unaffected: the
 * edge middleware serves its own meta/JSON-LD, and the full text is in the
 * DOM either way (line-clamp hides visually, not from the document).
 */
export function ClampedProse({
  text,
  moreLabel,
  lessLabel,
  className,
}: {
  text: string;
  moreLabel: string;
  lessLabel: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const clampRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = clampRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  const paragraphs = useMemo(() => splitProseParagraphs(text), [text]);

  return (
    <div className={className}>
      {expanded ? (
        paragraphs.map((p, i) => (
          <p key={i} className={i > 0 ? 'mt-4' : undefined}>
            {p}
          </p>
        ))
      ) : (
        <p ref={clampRef} className="line-clamp-6">
          {text}
        </p>
      )}
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-13 font-bold underline"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  );
}
