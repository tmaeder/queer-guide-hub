import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from './RouteBullet';

/**
 * Module 08 — "Another type embedded whole: the venue on an event, the maker
 * on a listing."
 *
 * It leads with the OTHER type's bullet, which is the spec's rule 4 in
 * practice: "Cross-type links use the other type's bullet and color, so the
 * network is legible from inside any page." An event page linking its venue
 * shows the venue's bullet, not the event's — that is how a rider learns the
 * network from any single page.
 */
export function NestedEntityCard({
  type,
  eyebrow,
  name,
  description,
  href,
  actionLabel,
  className,
}: {
  type: string;
  /** Nullable to match `description`: the columns these come from
   *  (`venues.category`, `cities.countries.name`) are nullable in the DB, and
   *  making every call site write `?? undefined` pushes the same coalesce into
   *  each of them. */
  eyebrow?: string | null;
  name: string;
  description?: string | null;
  /** Omit when the row has no reachable page yet — an unslugged city or venue
   *  still belongs in the list, it just is not a link. The card then drops the
   *  overlay AND the lift: lifting something with no click target promises an
   *  interaction that does not exist. */
  href?: string;
  actionLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group relative border-[3px] border-foreground p-4',
        href && 'card-lift',
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <RouteBullet type={type} size={34} />
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <div className="mt-0.5 font-display text-title leading-tight">{name}</div>
          {description && (
            <p className="mt-1 line-clamp-2 text-13 leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actionLabel && (
          <span className="hidden shrink-0 border-2 border-foreground px-4 py-2 text-xs2 font-bold sm:block">
            {actionLabel}
          </span>
        )}
      </div>
      {href && (
        <LocalizedLink to={href} aria-label={name} className="absolute inset-0 no-underline" />
      )}
    </div>
  );
}
