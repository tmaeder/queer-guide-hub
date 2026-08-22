import { DetailMasthead } from './DetailMasthead';
import { PageContainer, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';

/**
 * The single-page shell — spine parts S2/S3 plus the two-column frame every
 * one of the thirteen types uses ("Content Singles Spec.dc.html").
 *
 * The spec's first rule is the reason this exists: "Module order is fixed
 * across types. A rider who learns one single has learned all thirteen." A
 * page that assembles its own layout can drift; a page that fills `body` and
 * `rail` slots cannot.
 *
 * The 360px rail is the spec's own width and collapses UNDER the body on
 * mobile — "Every single works at 390px with the same modules in the same
 * order, stacked. No mobile-only cuts." So the rail is a sibling that reflows,
 * never a `hidden lg:block` that silently drops content on a phone.
 */
export function SinglePage({
  type,
  eyebrow,
  title,
  status,
  lead,
  tags,
  action,
  body,
  rail,
  footer,
  className,
}: {
  type: string;
  eyebrow?: string;
  title: string;
  status?: string;
  lead?: React.ReactNode;
  /** S4 — one unstyled array, equal weight, never truncated. */
  tags?: React.ReactNode;
  /** S5 — one concrete verb. */
  action?: React.ReactNode;
  body: React.ReactNode;
  rail?: React.ReactNode;
  /** S8 — safety footer. */
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    /* `flush` — the single owns its own vertical rhythm: each of the three
       spine blocks below carries `py-8` and the rules between them have to sit
       on those edges, so a container-level `py-*` would double the first and
       last gap. */
    <PageContainer as="article" flush className={className}>
      <div className="border-b border-border-hairline py-8">
        <DetailMasthead type={type} eyebrow={eyebrow} title={title} status={status} lead={lead} />
        {tags && <div className="mt-6">{tags}</div>}
        {action && <div className="mt-6 flex flex-wrap gap-2">{action}</div>}
      </div>

      {/* The 360px track is declared only when there IS a rail. Declaring it
          unconditionally reserved the column for a rail that never came, so a
          single with no rail (the venue) rendered its content at 984px of a
          1440px viewport with 360px of nothing beside it. */}
      <div className={cn('grid grid-cols-1 gap-8 py-8', rail && 'lg:grid-cols-[1fr_360px]')}>
        <div className="flex min-w-0 flex-col gap-10">{body}</div>
        {/* The testid exists because `article aside` is NOT unique: a signed-in
            visitor whose trip covers this destination also gets
            TripCoveringBanner, which is an <aside> inside the same <article>.
            A locator that matches "the aside" is ambiguous exactly when a
            reader has a trip — see e2e/singles.spec.ts. Deliberately not an
            aria-label: an <aside> nested in an <article> is only a
            `complementary` landmark once it HAS an accessible name, so naming
            this one would add a landmark to the a11y tree to satisfy a test. */}
        {rail && (
          <aside data-testid="single-rail" className="flex flex-col gap-4">
            {rail}
          </aside>
        )}
      </div>

      {footer && <div className="border-t border-border-hairline py-8">{footer}</div>}
    </PageContainer>
  );
}

/**
 * A body section with the shared heading rank. Every module on every type sits
 * under one of these, so the h2 level and spacing cannot drift per page.
 *
 * `compact` keeps the h2 token (the rank table stays intact — a demoted
 * section is still a section) and only tightens the internal spacing; it marks
 * context modules (stats, news) whose content is already row-shaped.
 */
export function SingleSection({
  id,
  title,
  note,
  variant = 'default',
  children,
  className,
}: {
  /** Anchor target, so a RouteStrip station can link straight to this band
   *  without the caller wrapping it in a div just to hold the id. */
  id?: string;
  title: string;
  note?: string;
  variant?: 'default' | 'compact';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={className}>
      <h2 className="font-display text-headline leading-tight">{title}</h2>
      {note && <p className="mt-1 text-13 leading-relaxed text-muted-foreground">{note}</p>}
      <div className={variant === 'compact' ? 'mt-2' : 'mt-4'}>{children}</div>
    </section>
  );
}

/**
 * Sticky tail of the rail. The aside stretches to the full body height (grid
 * default), which used to mean 80%+ of the column was empty AND the vertical
 * route rail scrolled away 1,500px in — an 8-section page lost its navigation
 * for most of its length. Wrapping the TOC (+ provenance) in this group lets
 * it travel with the reader through the whole stretched column.
 *
 * Sticky, not fixed: it stays inside the aside's bounds, so it can never
 * overlap the footer. Callers keep non-following modules (map, verdict) as
 * ordinary siblings ABOVE the group. Pins to `STICKY_UNDER_HEADER`, not a raw
 * top offset — a raw `top-8` slides the TOC under the pinned header.
 */
export function StickyRailGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 lg:sticky', STICKY_UNDER_HEADER, className)}>
      {children}
    </div>
  );
}
