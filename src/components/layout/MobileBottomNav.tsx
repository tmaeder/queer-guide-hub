import { Home, MessageCircle, Search, User, Users } from 'lucide-react';
import { useLocation } from 'react-router';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  icon: typeof Home;
  label: string;
  /** When true, item only renders for signed-in users. */
  authOnly?: boolean;
  /** Path prefixes that should mark this item as active. */
  matchPrefixes?: string[];
}

const ITEMS: NavItem[] = [
  { to: '/', icon: Home, label: 'Home', matchPrefixes: ['/'] },
  { to: '/venues', icon: Search, label: 'Find', matchPrefixes: ['/venues', '/events', '/marketplace', '/places'] },
  { to: '/community', icon: Users, label: 'Community', matchPrefixes: ['/community', '/feed', '/groups', '/users', '/friends'] },
  { to: '/messages', icon: MessageCircle, label: 'Messages', authOnly: true, matchPrefixes: ['/messages'] },
  { to: '/me', icon: User, label: 'You', authOnly: true, matchPrefixes: ['/me', '/profile', '/user'] },
];

/** Strip the optional /:locale prefix so matching is locale-agnostic. */
function pathWithoutLocale(pathname: string): string {
  return pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');
}

function isActive(item: NavItem, currentPath: string): boolean {
  const path = pathWithoutLocale(currentPath);
  if (item.to === '/') return path === '/';
  return (item.matchPrefixes ?? [item.to]).some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
}

/**
 * Mobile-only bottom nav that surfaces the milestone-3 destinations
 * (/me, /discover, /messages) alongside Home + Find. Hidden on md+
 * (desktop uses the top Header). Honors safe-area-inset-bottom.
 *
 * Anon visitors see Home + Find only; the rest light up after sign-in.
 */
export function MobileBottomNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isFullBleed = /^\/(?:[a-z]{2}\/)?map\/?$/.test(pathname);
  if (isFullBleed) return null;

  const visible = ITEMS.filter((item) => !item.authOnly || user);

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="flex items-stretch">
        {visible.map((item) => {
          const Icon = item.icon;
          const active = isActive(item, pathname);
          return (
            <li key={item.to} className="flex-1">
              <LocalizedLink
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-14 flex-col items-center justify-center gap-0.5 text-2xs transition-colors',
                  active ? 'text-accent-brand' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-6 top-0 h-0.5 rounded-badge bg-accent-brand"
                  />
                )}
                <Icon className={cn('h-5 w-5', active && 'stroke-[2.25]')} aria-hidden />
                <span>{item.label}</span>
              </LocalizedLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
