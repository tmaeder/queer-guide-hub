import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, Plane, Shield, UserRound } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { CurrencySelector } from '@/components/i18n/CurrencySelector';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { Button } from '@/components/ui/button';
import {
  DESTINATIONS,
  NAV_CLUSTERS,
  LEGAL_ITEMS,
  INTENT_NAV,
  INTENT_TRACK,
} from '@/config/navigation';
import { TrackSwatch } from '@/components/transit/TrackSwatch';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { generateAvatarUrl } from '@/lib/avatar';
import { cn } from '@/lib/utils';

interface MobileNavSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={label}
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-2xs font-medium leading-none text-background"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Bottom discovery sheet behind the mobile nav's "Explore" tab. Renders the
 * full destination hub (single-sourced from config/navigation.ts, so it never
 * drifts from the desktop header), account rows, and the language/currency/
 * theme controls that otherwise only live in the desktop footer.
 */
export function MobileNavSheet({ open, onOpenChange }: MobileNavSheetProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { isAdmin, isModerator } = useAdminRoles();
  const tripCount = useInboxBadge();
  const [authOpen, setAuthOpen] = useState(false);

  const close = () => onOpenChange(false);

  const displayName = (profile?.display_name as string | null) || null;
  const username = (profile?.username as string | null) || null;
  const avatarSrc =
    profile?.avatar_url ||
    (user?.email ? generateAvatarUrl(user.email, 96) || undefined : undefined);
  const avatarInitial = (displayName || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] p-0"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex flex-col gap-6 overflow-y-auto px-6 pb-6 pt-6">
            <SheetHeader className="pr-8">
              <SheetTitle className="font-display">
                {t('header.mobileNav.menuTitle', 'Explore Queer Guide')}
              </SheetTitle>
              <SheetDescription>
                {t(
                  'header.mobileNav.menuDescription',
                  'Jump to any section, switch language or theme.',
                )}
              </SheetDescription>
            </SheetHeader>

            {/* Identity / account */}
            {user ? (
              <div className="flex items-center gap-4">
                <LocalizedLink
                  to="/hub"
                  onClick={close}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-element p-2 no-underline hover:bg-muted"
                >
                  <Avatar style={{ height: 40, width: 40 }}>
                    <AvatarImage src={avatarSrc} alt="" />
                    <AvatarFallback>{avatarInitial}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col">
                    {username ? (
                      <span className="truncate font-mono text-sm font-semibold">@{username}</span>
                    ) : (
                      <span className="truncate text-sm font-semibold">
                        {user.email || t('header.userMenu.you', 'You')}
                      </span>
                    )}
                  </span>
                </LocalizedLink>
                <LocalizedLink
                  to={`/user/${user.id}`}
                  onClick={close}
                  aria-label={t('header.userMenu.viewProfile', 'View public profile')}
                  className="flex h-10 w-10 items-center justify-center rounded-element text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
                >
                  <UserRound size={18} />
                </LocalizedLink>
              </div>
            ) : (
              <Button
                variant="accent"
                onClick={() => {
                  close();
                  setAuthOpen(true);
                }}
                className="w-full"
              >
                {t('header.signIn', 'Sign in')}
              </Button>
            )}

            {/* Personal shortcut: Trips with orphan badge */}
            {user && (
              <LocalizedLink
                to="/hub/plans"
                onClick={close}
                className="flex items-center gap-2 rounded-element p-4 no-underline hover:bg-muted"
              >
                <Plane size={18} className="text-muted-foreground" />
                <span className="text-sm font-medium">
                  {t('header.mobileNav.trips', 'My Trips')}
                </span>
                <CountBadge count={tripCount} label={`${tripCount} trip items need attention`} />
              </LocalizedLink>
            )}

            {/* Intents first — the job you came to do. Full-width rows with a
                subtitle, because unlike the icon grid below these are not
                self-explanatory nouns. */}
            <div className="flex flex-col gap-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('header.intents.sheetHeading', 'What are you here for?')}
              </h3>
              <div className="flex flex-col gap-2">
                {INTENT_NAV.map((intent) => {
                  const Icon = intent.icon;
                  return (
                    <LocalizedLink
                      key={intent.to}
                      to={intent.to}
                      onClick={close}
                      className="flex items-center gap-4 p-4 no-underline transition-colors hover:bg-foreground hover:text-background"
                    >
                      {/* The line, then the icon — the same pair the desktop
                          tab and the compact bar carry, so a reader arriving
                          from either recognises the row. */}
                      <TrackSwatch track={INTENT_TRACK[intent.id] ?? 'pink'} />
                      <Icon size={20} className="shrink-0" aria-hidden />
                      <span className="flex flex-col">
                        <span className="text-15 font-bold">
                          {t(intent.labelKey, intent.fallback)}
                        </span>
                        <span className="text-2xs leading-tight opacity-70">
                          {t(intent.subtitleKey, intent.subtitleFallback)}
                        </span>
                      </span>
                    </LocalizedLink>
                  );
                })}
              </div>
            </div>

            {/* Every destination stays reachable — the intent row is additive,
                never a replacement. Single-sourced from config/navigation.ts. */}
            <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('header.intents.browseHeading', 'Browse everything')}
            </h3>
            {NAV_CLUSTERS.map((cluster) => {
              const items = DESTINATIONS.filter((d) => d.cluster === cluster.id);
              if (!items.length) return null;
              return (
                <div key={cluster.id} className="flex flex-col gap-2">
                  <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(cluster.labelKey)}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {items.map((dest) => {
                      const Icon = dest.icon;
                      return (
                        <LocalizedLink
                          key={dest.to}
                          to={dest.to}
                          onClick={close}
                          className="flex flex-col items-center justify-center gap-2 p-4 text-center no-underline transition-colors hover:bg-foreground hover:text-background"
                        >
                          <Icon size={20} aria-hidden />
                          <span className="text-2xs font-bold leading-tight">
                            {t(dest.labelKey)}
                          </span>
                        </LocalizedLink>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Account actions */}
            <div className="flex flex-col gap-2 pt-4">
              {isAdmin || isModerator ? (
                <LocalizedLink
                  to="/admin"
                  onClick={close}
                  className="flex items-center gap-2 rounded-element p-2 text-sm no-underline hover:bg-muted"
                >
                  <Shield size={16} />
                  <span>{t('header.adminConsole', 'Admin Console')}</span>
                </LocalizedLink>
              ) : null}
              {LEGAL_ITEMS.map((item) => (
                <LocalizedLink
                  key={item.to}
                  to={item.to}
                  onClick={close}
                  className="flex items-center gap-2 rounded-element p-2 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
                >
                  <item.icon size={16} />
                  <span>{t(item.labelKey)}</span>
                </LocalizedLink>
              ))}
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    void signOut();
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-element p-2 text-left text-sm text-destructive',
                    'hover:bg-muted',
                  )}
                >
                  <LogOut size={16} />
                  <span>{t('header.signOut', 'Sign Out')}</span>
                </button>
              )}
            </div>

            {/* Display controls */}
            <div className="flex flex-col gap-2 pt-4">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('header.mobileNav.settingsSection', 'Display')}
              </h3>
              <div className="flex items-center gap-2">
                <LanguageSwitcher />
                <CurrencySelector />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}
