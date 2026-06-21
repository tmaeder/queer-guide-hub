import { Home, MessageCircle, Search, User, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useMotionTokens } from '@/lib/motion';
import { duration } from '@/lib/animation';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  icon: typeof Home;
  label: string;
  /** When true, tapping while signed out routes to sign-in instead. */
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
 * Mobile-only floating-island bottom nav. Five fixed destinations
 * (Home · Find · Community · Messages · You) — the layout never collapses,
 * so anon and signed-in users get the same five slots. Auth-only tabs gate
 * on tap: an anon visitor is sent to /auth with a return-to so they land
 * back where they intended.
 *
 * Detached, frosted pill (border + backdrop-blur for depth — shadows are
 * disabled by the design system). The active tab is marked by a berry pill
 * that glides behind its icon (the sanctioned active-nav use of
 * --accent-brand). Messages carries the unread badge. Hidden on md+ and on
 * the full-bleed /map. Honors safe-area-inset-bottom.
 */
export function MobileBottomNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useLocalizedNavigate();
  const { reduced } = useMotionTokens();
  // Same source as the notification bell, so the badge never desyncs from
  // /messages. The query is disabled for anon, so this is a no-op signed out.
  const { unreadCount } = useInboxFeed('all');

  const isFullBleed = /^\/(?:[a-z]{2}\/)?map\/?$/.test(pathname);
  if (isFullBleed) return null;

  const Pill = reduced ? 'span' : motion.span;

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="md:hidden fixed inset-x-0 bottom-0 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-4 mb-2 flex items-stretch gap-0.5 rounded-container border border-border bg-background/90 px-2 backdrop-blur-md">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item, pathname);
          const showBadge = item.to === '/messages' && !!user && unreadCount > 0;

          return (
            <li key={item.to} className="flex-1">
              <LocalizedLink
                to={item.to}
                aria-current={active ? 'page' : undefined}
                onClick={(e) => {
                  if (item.authOnly && !user) {
                    e.preventDefault();
                    navigate('/auth', { state: { from: item.to } });
                  }
                }}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-2xs transition-colors',
                  active ? 'text-accent-brand' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative flex h-8 w-12 items-center justify-center rounded-element">
                  {active && (
                    <Pill
                      aria-hidden
                      {...(reduced
                        ? {}
                        : {
                            layoutId: 'mobilenav-active-pill',
                            transition: { duration: duration.fast, ease: [0.22, 1, 0.36, 1] },
                          })}
                      className="absolute inset-0 rounded-element bg-accent-brand/12"
                    />
                  )}
                  <Icon
                    className={cn('relative h-5 w-5', active && 'stroke-[2.25]')}
                    aria-hidden
                  />
                  {showBadge && (
                    <span
                      aria-label={`${unreadCount} unread`}
                      className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-brand px-1 text-2xs font-medium leading-none text-accent-brand-foreground"
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </span>
                <span>{item.label}</span>
              </LocalizedLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
