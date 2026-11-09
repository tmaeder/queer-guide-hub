import { BookOpen, Compass, Luggage, Map } from 'lucide-react';
import { useLocation } from 'react-router';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { stripLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';

const ITEMS = [
  {
    href: '/travel',
    label: 'Inspire',
    icon: Compass,
    active: (path: string) => path === '/travel',
  },
  {
    href: '/trips/discover',
    label: 'Build a trip',
    icon: Map,
    active: (path: string) => path === '/trips/discover',
  },
  {
    href: '/hub/plans',
    label: 'My trips',
    icon: Luggage,
    active: (path: string) =>
      path === '/hub/plans' || /^\/trips\/(?!discover(?:\/|$)|shared(?:\/|$))[^/]+/.test(path),
  },
  {
    href: '/travel/book',
    label: 'Book',
    icon: BookOpen,
    active: (path: string) => path === '/travel/book',
  },
] as const;

/** Shared wayfinding for the complete Travel and Trips journey. */
export function TravelJourneyNav({ className }: { className?: string }) {
  const location = useLocation();
  const pathname = stripLocale(location.pathname).replace(/\/+$/, '') || '/';

  return (
    <nav
      aria-label="Travel sections"
      className={cn(
        'overflow-x-auto border-y border-border-hairline bg-background/95 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      <ul className="m-0 flex min-w-max list-none gap-1 p-0">
        {ITEMS.map(({ href, label, icon: Icon, active }) => {
          const current = active(pathname);
          return (
            <li key={href}>
              <LocalizedLink
                to={href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-element px-4 text-sm font-semibold no-underline transition-[background-color,color,transform] duration-normal active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  current
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-surface-container hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                {label}
              </LocalizedLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
