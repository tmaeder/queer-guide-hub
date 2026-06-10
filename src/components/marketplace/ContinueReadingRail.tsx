import { useContinueReadingGuides } from '@/hooks/useGuideReadingProgress';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { resolveImageUrl } from '@/utils/resolveImageUrl';

/**
 * "Continue reading" rail — signed-in users only. Shows guides with
 * an in-progress marketplace_guide_reads row (completed_at IS NULL).
 * Renders nothing for anonymous users or when nothing is in progress.
 *
 * Phase 5 §5.
 */
export function ContinueReadingRail() {
  const { data: items = [] } = useContinueReadingGuides(4);
  if (items.length === 0) return null;

  return (
    <section className="my-8" aria-labelledby="continue-reading-heading">
      <header className="mb-4">
        <h2
          id="continue-reading-heading"
          className="text-13 uppercase tracking-[0.15em] text-muted-foreground"
        >
          Continue reading
        </h2>
      </header>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((it) => {
          const hero = resolveImageUrl({ imageUrl: it.guide.hero_image_path });
          return (
            <li key={it.guide_id}>
              <LocalizedLink
                to={`/marketplace/guides/${it.guide.slug}`}
                className="group flex gap-4 items-start rounded-element border border-border p-4 no-underline hover:bg-muted/40"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-badge bg-muted">
                  {hero ? (
                    <img
                      src={hero}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-15 font-medium leading-snug line-clamp-2 group-hover:underline underline-offset-4">
                    {it.guide.title}
                  </p>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      aria-hidden
                      className="h-full bg-foreground"
                      style={{ width: `${Math.max(4, Math.min(100, it.scroll_pct))}%` }}
                    />
                  </div>
                  <p className="text-2xs uppercase tracking-[0.1em] text-muted-foreground mt-1">
                    {it.scroll_pct}% read
                  </p>
                </div>
              </LocalizedLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
