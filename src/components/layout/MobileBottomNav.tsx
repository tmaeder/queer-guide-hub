import { useState } from 'react';
import { Compass, Home, MessageCircle, Plus, User } from 'lucide-react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { MobileNavSheet } from '@/components/layout/MobileNavSheet';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useHaptics } from '@/hooks/useHaptics';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useMotionTokens } from '@/lib/motion';
import { duration } from '@/lib/animation';
import { getSubmitCta } from '@/lib/submitCta';
import { generateAvatarUrl } from '@/lib/avatar';
import { cn } from '@/lib/utils';

/** Strip the optional /:locale prefix so matching is locale-agnostic. */
function pathWithoutLocale(pathname: string): string {
  return pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');
}

function matches(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

// Any browse/discovery route lights up the Explore tab. Kept broad so the tab
// reads as "you're somewhere in the catalogue, tap to jump elsewhere".
const EXPLORE_PREFIXES = [
  '/venues',
  '/events',
  '/places',
  '/marketplace',
  '/news',
  '/map',
  '/people',
  '/hotels',
  '/travel',
  '/resources',
  '/personalities',
  '/community',
  '/feed',
  '/groups',
  '/users',
  '/friends',
];

/**
 * Mobile-only floating-island bottom nav. Five slots:
 * Home · Explore · [+ Add] · Messages · You. The centre is a raised,
 * context-aware contribute button (same target as the desktop header's +).
 * Explore opens the discovery sheet (full destination hub + display controls);
 * Messages carries the unread badge; You shows the signed-in avatar. Auth-only
 * destinations gate on tap (anon → sign-in). The bar slides away on scroll-down
 * and returns on scroll-up (disabled under reduced motion), honors
 * safe-area-inset-bottom, hides on md+ and on the full-bleed /map.
 */
export function MobileBottomNav() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { pathname } = useLocation();
  const navigate = useLocalizedNavigate();
  const { trigger } = useHaptics();
  const { reduced } = useMotionTokens();
  const scrollDir = useScrollDirection();
  const { unreadCount } = useInboxFeed('all');
  const tripCount = useInboxBadge();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const isFullBleed = /^\/(?:[a-z]{2}\/)?map\/?$/.test(pathname);
  if (isFullBleed) return null;

  const path = pathWithoutLocale(pathname);
  const homeActive = path === '/';
  const exploreActive = matches(path, EXPLORE_PREFIXES);
  const messagesActive = matches(path, ['/messages']);
  const youActive = matches(path, ['/me', '/profile', '/user']);

  const Pill = reduced ? 'span' : motion.span;
  const tapHaptic = () => trigger('nudge');

  // Slide off-screen on scroll-down (keep visible while the sheet is open).
  const hidden = !reduced && scrollDir === 'down' && !sheetOpen;

  const avatarSrc =
    profile?.avatar_url ||
    (user?.email ? generateAvatarUrl(user.email, 96) || undefined : undefined);
  const avatarInitial = ((profile?.display_name as string | null) || user?.email || 'U')
    .charAt(0)
    .toUpperCase();

  const handleContribute = () => {
    tapHaptic();
    if (!user) {
      setAuthOpen(true);
      return;
    }
    navigate(getSubmitCta(pathname, t).route);
  };

  const activePill = (
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
  );

  const iconWrap = 'relative flex h-8 w-12 items-center justify-center rounded-element';
  const linkBase =
    'flex h-14 flex-col items-center justify-center gap-0.5 text-2xs transition-colors';

  return (
    <>
      <nav
        aria-label={t('header.navigation', 'Navigation')}
        className="md:hidden fixed inset-x-0 bottom-0 z-40"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: hidden ? 'translateY(calc(100% + 1rem))' : 'translateY(0)',
          transition: reduced
            ? undefined
            : `transform ${duration.normal}s cubic-bezier(0.22,1,0.36,1)`,
        }}
      >
        <ul className="mx-4 mb-2 flex items-stretch gap-0.5 rounded-container border border-border bg-background/90 px-2 backdrop-blur-md">
          {/* Home */}
          <li className="flex-1">
            <LocalizedLink
              to="/"
              onClick={tapHaptic}
              aria-current={homeActive ? 'page' : undefined}
              className={cn(
                linkBase,
                homeActive ? 'text-accent-brand' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={iconWrap}>
                {homeActive && activePill}
                <Home
                  className={cn('relative h-5 w-5', homeActive && 'stroke-[2.25]')}
                  aria-hidden
                />
              </span>
              <span>{t('header.mobileNav.home', 'Home')}</span>
            </LocalizedLink>
          </li>

          {/* Explore — opens the discovery sheet */}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => {
                tapHaptic();
                setSheetOpen(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              className={cn(
                linkBase,
                'w-full',
                exploreActive ? 'text-accent-brand' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={iconWrap}>
                {exploreActive && activePill}
                <Compass
                  className={cn('relative h-5 w-5', exploreActive && 'stroke-[2.25]')}
                  aria-hidden
                />
                {!!user && tripCount > 0 && (
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent-brand"
                  />
                )}
              </span>
              <span>{t('header.mobileNav.explore', 'Explore')}</span>
            </button>
          </li>

          {/* Contribute — raised, context-aware */}
          <li className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={handleContribute}
              aria-label={
                user
                  ? getSubmitCta(pathname, t).label
                  : t('header.signInToContribute', 'Sign in to contribute')
              }
              className="-mt-4 flex h-12 w-12 items-center justify-center rounded-element border border-accent-brand bg-accent-brand text-accent-brand-foreground transition-transform active:scale-95"
            >
              <Plus className="h-6 w-6" aria-hidden />
            </button>
          </li>

          {/* Messages */}
          <li className="flex-1">
            <LocalizedLink
              to="/messages"
              aria-current={messagesActive ? 'page' : undefined}
              onClick={(e) => {
                tapHaptic();
                if (!user) {
                  e.preventDefault();
                  navigate('/auth', { state: { from: '/messages' } });
                }
              }}
              className={cn(
                linkBase,
                messagesActive
                  ? 'text-accent-brand'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={iconWrap}>
                {messagesActive && activePill}
                <MessageCircle
                  className={cn('relative h-5 w-5', messagesActive && 'stroke-[2.25]')}
                  aria-hidden
                />
                {!!user && unreadCount > 0 && (
                  <span
                    aria-label={`${unreadCount} unread`}
                    className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-brand px-1 text-2xs font-medium leading-none text-accent-brand-foreground"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
              <span>{t('header.mobileNav.messages', 'Messages')}</span>
            </LocalizedLink>
          </li>

          {/* You — avatar when signed in */}
          <li className="flex-1">
            <LocalizedLink
              to="/me"
              aria-current={youActive ? 'page' : undefined}
              onClick={(e) => {
                tapHaptic();
                if (!user) {
                  e.preventDefault();
                  navigate('/auth', { state: { from: '/me' } });
                }
              }}
              className={cn(
                linkBase,
                youActive ? 'text-accent-brand' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={iconWrap}>
                {youActive && activePill}
                {user ? (
                  <Avatar
                    className={cn('relative h-6 w-6', youActive && 'ring-2 ring-accent-brand')}
                  >
                    <AvatarImage src={avatarSrc} alt="" />
                    <AvatarFallback className="text-2xs">{avatarInitial}</AvatarFallback>
                  </Avatar>
                ) : (
                  <User
                    className={cn('relative h-5 w-5', youActive && 'stroke-[2.25]')}
                    aria-hidden
                  />
                )}
              </span>
              <span>{t('header.mobileNav.you', 'You')}</span>
            </LocalizedLink>
          </li>
        </ul>
      </nav>

      <MobileNavSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}
