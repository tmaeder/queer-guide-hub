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
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { Button } from '@/components/ui/button';
import { DESTINATIONS, NAV_CLUSTERS, LEGAL_ITEMS } from '@/config/navigation';
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
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-brand px-1.5 text-2xs font-medium leading-none text-accent-brand-foreground"
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
                  to="/me"
                  onClick={close}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-element p-2 no-underline hover:bg-muted"
                >
                  <Avatar style={{ height: 40, width: 40 }}>
                    <AvatarImage src={avatarSrc} alt="" />
                    <AvatarFallback>{avatarInitial}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">
                      {displayName || t('header.userMenu.you', 'You')}
                    </span>
                    {username ? (
                      <span className="truncate font-mono text-2xs text-muted-foreground">
                        @{username}
                      </span>
                    ) : user.email ? (
                      <span className="truncate text-2xs text-muted-foreground">{user.email}</span>
                    ) : null}
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
                to="/me/trips"
                onClick={close}
                className="flex items-center gap-2 rounded-element border border-border p-4 no-underline hover:bg-muted"
              >
                <Plane size={18} className="text-muted-foreground" />
                <span className="text-sm font-medium">
                  {t('header.mobileNav.trips', 'My Trips')}
                </span>
                <CountBadge count={tripCount} label={`${tripCount} trip items need attention`} />
              </LocalizedLink>
            )}

            {/* Destination clusters — single-sourced from config/navigation.ts */}
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
                          className="flex flex-col items-center justify-center gap-2 rounded-element border border-border p-4 text-center no-underline hover:bg-muted"
                        >
                          <Icon size={20} className="text-foreground" aria-hidden />
                          <span className="text-2xs leading-tight text-muted-foreground">
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
            <div className="flex flex-col gap-1 border-t border-border pt-4">
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
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('header.mobileNav.settingsSection', 'Display')}
              </h3>
              <div className="flex items-center gap-2">
                <LanguageSwitcher />
                <CurrencySelector />
                <ThemeToggle />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}
