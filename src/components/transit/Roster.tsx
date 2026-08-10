import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

export interface RosterPerson {
  id: string;
  name: string;
  /** "moderator", "house mother", "contributor" — a ROLE, never a rank. */
  role?: string | null;
  href?: string;
  initials?: string;
}

/**
 * Module 07 — "Members, hosts, or contributors as avatars with roles.
 * Never a follower count."
 *
 * That last sentence is the whole design. The spec's trap note for
 * Personalities is explicit: "Follower counts and a photo grid. This is not a
 * social profile." So this module takes no count, exposes no ordering signal,
 * and renders roles as plain text — there is deliberately no prop through
 * which a caller could sort by popularity or show a total.
 */
export function Roster({
  people,
  className,
}: {
  people: RosterPerson[];
  className?: string;
}) {
  if (people.length === 0) return null;

  const initialsOf = (p: RosterPerson) =>
    p.initials ??
    p.name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

  return (
    <ul className={cn('flex list-none flex-wrap gap-2 p-0', className)}>
      {people.map((p) => {
        const inner = (
          <>
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-foreground bg-background text-xs2 font-bold"
            >
              {initialsOf(p)}
            </span>
            <span className="text-13 font-bold">{p.name}</span>
            {p.role && <span className="text-13 text-muted-foreground">{p.role}</span>}
          </>
        );
        return (
          <li key={p.id}>
            {p.href ? (
              <LocalizedLink
                to={p.href}
                className="flex items-center gap-2 border-2 border-foreground py-2 pe-4 ps-2 no-underline hover:bg-foreground hover:text-background"
              >
                {inner}
              </LocalizedLink>
            ) : (
              <span className="flex items-center gap-2 border-2 border-foreground py-2 pe-4 ps-2">
                {inner}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
