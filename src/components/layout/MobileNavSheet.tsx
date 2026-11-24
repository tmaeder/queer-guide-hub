import { useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BottomNavSheet, NAV_SHEET_HEADING } from '@/components/layout/bottom-nav/BottomNavSheet';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { Button } from '@/components/ui/button';
import {
  DESTINATIONS,
  FOOTER_ONLY_DESTINATIONS,
  INTENT_NAV,
  INTENT_TRACK,
  isIntentActive,
} from '@/config/navigation';
import { ChevronRight, LifeBuoy } from '@/components/icons';
import { TRACK_BG, TRACK_TEXT } from '@/components/transit/routeBulletMap';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface MobileNavSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tap-opened: focus the sheet itself rather than ringing its first control. */
  openedByPointer?: boolean;
}

/**
 * Bottom discovery sheet behind the mobile nav's "Explore" tab. Renders the
 * full destination hub (single-sourced from config/navigation.ts, so it never
 * drifts from the desktop header), account rows, and the language/currency/
 * theme controls that otherwise only live in the desktop footer.
 */
/** Not listed here: Drag Race was dropped from this sheet on request (the page
 *  stays at /competitions). Meet (People, Groups, Members) is public discovery,
 *  so it is listed. */
// Also dropped here on request (2026-11-24) to keep the sheet one screen;
// both stay in the desktop Knowledge menu and their pages are unchanged.
const HIDDEN_HERE = new Set(['/competitions', '/tags/interactions', '/tags/sti-guide']);

export function MobileNavSheet({ open, onOpenChange, openedByPointer }: MobileNavSheetProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const { pathname } = useLocation();
  // Same locale strip the footer uses, so "am I on this route" is answered the
  // same way on both surfaces.
  const localePath = pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');
  const isHere = (to: string) => localePath === to;

  const close = () => onOpenChange(false);

  const groups = [
    ...INTENT_NAV.map((i) => ({
      to: i.to,
      icon: i.icon,
      label: t(i.labelKey, i.fallback),
      track: INTENT_TRACK[i.id] ?? 'pink',
      active: isIntentActive(i, localePath),
      children: i.children,
    })),
    ...FOOTER_ONLY_DESTINATIONS.map((i) => ({
      to: i.to,
      icon: i.icon ?? LifeBuoy,
      label: t(i.labelKey, i.fallback),
      track: 'pink' as const,
      active: isHere(i.to),
      children: i.children,
    })),
  ];
  const covered = new Set(groups.flatMap((g) => [g.to, ...g.children.map((c) => c.to)]));
  const leftovers = DESTINATIONS.filter((d) => !covered.has(d.to) && !HIDDEN_HERE.has(d.to));

  return (
    <>
      <BottomNavSheet
        open={open}
        onOpenChange={onOpenChange}
        openedByPointer={openedByPointer}
        title={t('header.mobileNav.menuTitle', 'Explore Queer Guide')}
        description={t(
          'header.mobileNav.menuDescription',
          'Jump to any section, switch language or theme.',
        )}
      >
        <div className="flex flex-col gap-2">
          {/* One list, in intent order: each intent heads its own sections.
              Spacing is tight on purpose — the whole list should fit one phone
              screen. (A two-column card grid also fit, but read worse.) */}
          {groups.map((g) => {
            const Icon = g.icon;
            const sections = g.children.filter((c) => c.to !== g.to && !HIDDEN_HERE.has(c.to));
            return (
              <section key={g.to} className="flex flex-col gap-1">
                <LocalizedLink
                  to={g.to}
                  onClick={close}
                  aria-current={g.active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-10 items-center gap-2 rounded-element px-1.5 no-underline transition-colors',
                    g.active ? 'bg-foreground text-background' : 'hover:bg-muted',
                  )}
                >
                  {/* Track disc: ink ring gates the fill (WCAG 1.4.11). */}
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full border-2 border-track-ring',
                      TRACK_BG[g.track],
                      TRACK_TEXT[g.track],
                    )}
                  >
                    <Icon size={16} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-15 font-bold">{g.label}</span>
                  <ChevronRight size={16} aria-hidden className="shrink-0 opacity-60" />
                </LocalizedLink>
                {sections.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 ps-12">
                    {sections.map((c) => (
                      <LocalizedLink
                        key={c.to}
                        to={c.to}
                        onClick={close}
                        aria-current={isHere(c.to) ? 'page' : undefined}
                        className={cn(
                          'flex min-h-8 items-center rounded-full px-4 text-13 font-bold no-underline transition-colors',
                          isHere(c.to)
                            ? 'bg-foreground text-background'
                            : 'bg-muted hover:bg-foreground hover:text-background',
                        )}
                      >
                        {t(c.labelKey, c.fallback)}
                      </LocalizedLink>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {/* Safety net: a destination no intent lists stays reachable. */}
          {leftovers.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className={NAV_SHEET_HEADING}>{t('header.mobileNav.more', 'More')}</h3>
              <div className="flex flex-wrap gap-1.5">
                {leftovers.map((d) => (
                  <LocalizedLink
                    key={d.to}
                    to={d.to}
                    onClick={close}
                    className="flex min-h-10 items-center rounded-full bg-muted px-4 text-13 font-bold no-underline hover:bg-foreground hover:text-background"
                  >
                    {t(d.labelKey)}
                  </LocalizedLink>
                ))}
              </div>
            </section>
          )}

          {!user && (
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
        </div>
      </BottomNavSheet>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}
