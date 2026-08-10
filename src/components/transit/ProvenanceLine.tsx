import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

/**
 * Spine part S6 — on every one of the thirteen single types.
 *
 * The spec states it twice, which is how you know it is load-bearing:
 * "Every fact carries provenance: who added it, when it was last checked, and
 * how to correct it." A page that shows a fact without saying when it was
 * checked is asserting currency it has not earned — and on this product the
 * facts are door policies, legal status and access claims.
 *
 * `checkedAt` is rendered as an absolute date, never "2 months ago": a relative
 * string re-reads as fresh every time the page is opened, which is the exact
 * illusion provenance exists to break.
 */
export function ProvenanceLine({
  addedBy,
  addedAt,
  checkedAt,
  correctHref,
  className,
}: {
  addedBy?: string | null;
  addedAt?: string | null;
  checkedAt?: string | null;
  /** Where "correct this" goes. Omitted = no affordance rendered, never a dead link. */
  correctHref?: string;
  className?: string;
}) {
  const fmt = (iso?: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const added = fmt(addedAt);
  const checked = fmt(checkedAt);

  // Rule 2: a module with no data does not render.
  if (!addedBy && !added && !checked && !correctHref) return null;

  const parts: string[] = [];
  if (addedBy) parts.push(added ? `Added by ${addedBy} in ${added}` : `Added by ${addedBy}`);
  else if (added) parts.push(`Added ${added}`);
  if (checked) parts.push(`Last checked ${checked}`);

  return (
    <div className={cn('border-[3px] border-foreground p-4', className)}>
      <div className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
        Provenance
      </div>
      {parts.length > 0 && (
        <p className="mt-2 text-13 leading-relaxed">{parts.join('. ')}.</p>
      )}
      {!checked && parts.length > 0 && (
        // Saying "never checked" out loud beats implying freshness by omission.
        <p className="mt-1 text-13 text-muted-foreground">Not independently checked yet.</p>
      )}
      {correctHref && (
        <LocalizedLink
          to={correctHref}
          className="mt-4 inline-block border-2 border-foreground px-4 py-2 text-xs2 font-bold no-underline hover:bg-foreground hover:text-background"
        >
          Correct this page
        </LocalizedLink>
      )}
    </div>
  );
}
