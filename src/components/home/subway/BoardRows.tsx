import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { EventDateBadge } from '@/components/transit/EventDateBadge';
import { eventTypeIcon } from '@/components/events/eventTypeIcon';
import { Image } from '@/components/ui/Image';
import type { NearYouRow } from '@/hooks/useHomeNearYou';

const SKELETONS = 4;

/** Phones: a compact row — photo thumbnail with the date on it, then title and where. */
function BoardListRow({ row, locale }: { row: NearYouRow; locale: string }) {
  const href =
    row.kind === 'event' ? `/events/${row.slug || row.id}` : `/venues/${row.slug || row.id}`;
  return (
    <LocalizedLink
      to={href}
      className="flex items-center gap-4 p-2 pe-4 no-underline hover:bg-surface-container focus-visible:-outline-offset-2"
    >
      <span className="relative w-24 shrink-0 overflow-hidden rounded-element">
        <Image
          src={row.image ?? null}
          alt=""
          aspect="square"
          imageRole="thumb"
          rounded="none"
          fallbackEntityType={row.kind}
          fallbackIcon={row.eventType ? eventTypeIcon(row.eventType) : undefined}
          fallbackKey={row.id}
          sizes="96px"
        />
        {row.kind === 'event' && row.startDate && (
          <span className="absolute bottom-1 start-1 origin-bottom-left scale-75">
            <EventDateBadge
              startDate={row.startDate}
              locale={locale}
              timeZone={row.timezone}
              datePrecision={row.datePrecision}
            />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 text-15 font-bold leading-snug">{row.title}</span>
        {/* The space keeps the link name "Title Place", not "TitlePlace". */}
        {row.via && ' '}
        {row.via && <span className="truncate text-13 text-muted-foreground">{row.via}</span>}
      </span>
    </LocalizedLink>
  );
}

/**
 * One listing as a gallery card: the cover photo (or the type's fallback art)
 * with the date pinned on it, then the title and where. Tablets get a 2×2
 * grid, desktop one row of four.
 */
function BoardCard({ row, locale }: { row: NearYouRow; locale: string }) {
  const href =
    row.kind === 'event' ? `/events/${row.slug || row.id}` : `/venues/${row.slug || row.id}`;
  return (
    <LocalizedLink
      to={href}
      className="group flex h-full flex-col overflow-hidden rounded-container bg-card no-underline shadow-soft transition-shadow hover:shadow-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <div className="relative">
        <Image
          src={row.image ?? null}
          alt=""
          aspect="card"
          imageRole="cover"
          rounded="none"
          fallbackEntityType={row.kind}
          fallbackIcon={row.eventType ? eventTypeIcon(row.eventType) : undefined}
          fallbackKey={row.id}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 80vw"
        />
        <span className="absolute start-2 top-2">
          {row.kind === 'event' && row.startDate ? (
            <EventDateBadge
              startDate={row.startDate}
              locale={locale}
              timeZone={row.timezone}
              datePrecision={row.datePrecision}
            />
          ) : (
            <RouteBullet type={row.kind} size={36} decorative />
          )}
        </span>
      </div>
      <span className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <span className="line-clamp-2 text-15 font-bold leading-snug">{row.title}</span>
        {/* The space keeps the link name "Title Place", not "TitlePlace". */}
        {row.via && ' '}
        {row.via && <span className="truncate text-13 text-muted-foreground">{row.via}</span>}
      </span>
    </LocalizedLink>
  );
}

/**
 * Listings in two layouts: a compact photo list on phones, a photo gallery on
 * sm+ (2×2, then one row of four). Both render; CSS shows one.
 */
export function BoardRows({ rows, locale }: { rows: NearYouRow[]; locale: string }) {
  return (
    <>
      {/* Phones: one compact list, all four visible without swiping. */}
      <div
        data-layout="list"
        className="divide-y divide-border overflow-hidden rounded-container bg-card sm:hidden"
      >
        {rows.map((r) => (
          <BoardListRow key={`${r.kind}:${r.id}`} row={r} locale={locale} />
        ))}
      </div>
      {/* Tablet and up: a photo gallery, 2×2 then one row of four. */}
      <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <BoardCard key={`${r.kind}:${r.id}`} row={r} locale={locale} />
        ))}
      </div>
    </>
  );
}

/** Loading state at the real shapes, so nothing jumps. */
export function BoardRowsSkeleton() {
  return (
    <div aria-busy>
      <div className="divide-y divide-border overflow-hidden rounded-container bg-card sm:hidden">
        {Array.from({ length: SKELETONS }).map((_, i) => (
          <div key={i} aria-hidden="true" className="flex items-center gap-4 p-2">
            <div className="size-24 rounded-element bg-muted motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
      <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: SKELETONS }).map((_, i) => (
          <div key={i} aria-hidden="true" className="overflow-hidden rounded-container bg-card">
            <div className="aspect-[16/10] bg-muted motion-safe:animate-pulse" />
            <div className="h-[76px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
