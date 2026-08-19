import { DetailMasthead } from './DetailMasthead';
import { PageContainer } from '@/components/layout/PageContainer';

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

      <div className="grid grid-cols-1 gap-8 py-8 lg:grid-cols-[1fr_360px]">
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
 */
export function SingleSection({
  id,
  title,
  note,
  children,
  className,
}: {
  /** Anchor target, so a RouteStrip station can link straight to this band
   *  without the caller wrapping it in a div just to hold the id. */
  id?: string;
  title: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={className}>
      <h2 className="font-display text-headline leading-tight">{title}</h2>
      {note && <p className="mt-1 text-13 leading-relaxed text-muted-foreground">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
