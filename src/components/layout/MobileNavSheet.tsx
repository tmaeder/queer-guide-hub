import { useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  BottomNavSheet,
  NAV_SHEET_HEADING,
  NavSheetTile,
} from '@/components/layout/bottom-nav/BottomNavSheet';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { Button } from '@/components/ui/button';
import {
  DESTINATIONS,
  NAV_CLUSTERS,
  INTENT_NAV,
  INTENT_TRACK,
  isIntentActive,
} from '@/config/navigation';
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
const HIDDEN_HERE = new Set(['/competitions']);

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

  return (
    <>
      <BottomNavSheet
        open={open}
        onOpenChange={onOpenChange}
        openedByPointer={openedByPointer}
        hideTitle
        title={t('header.mobileNav.menuTitle', 'Explore Queer Guide')}
        description={t(
          'header.mobileNav.menuDescription',
          'Jump to any section, switch language or theme.',
        )}
      >
        <div className="flex flex-col gap-4">
          {/* Intents first — the job you came to do. Compact rows, icon beside
              the label; the subtitle moves to the tooltip. */}
          <section className="flex flex-col gap-2">
            <h3 className={NAV_SHEET_HEADING}>
              {t('header.intents.sheetHeading', 'What are you here for?')}
            </h3>
            <div className="grid grid-cols-3 gap-1.5">
              {INTENT_NAV.map((intent) => {
                const Icon = intent.icon;
                const active = isIntentActive(intent, localePath);
                const track = INTENT_TRACK[intent.id] ?? 'pink';
                return (
                  <LocalizedLink
                    key={intent.to}
                    to={intent.to}
                    onClick={close}
                    aria-current={active ? 'page' : undefined}
                    title={t(intent.subtitleKey, intent.subtitleFallback)}
                    className={cn(
                      'group flex min-h-11 items-center gap-1.5 rounded-element px-1.5 py-1.5 no-underline transition-colors',
                      active
                        ? 'bg-foreground text-background'
                        : 'bg-muted hover:bg-foreground hover:text-background',
                    )}
                  >
                    {/* Track disc: ink ring gates the fill (WCAG 1.4.11), ink
                        glyph on every fill, per routeBulletMap. */}
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full border-2 border-track-ring',
                        TRACK_BG[track],
                        TRACK_TEXT[track],
                      )}
                    >
                      <Icon size={14} aria-hidden />
                    </span>
                    <span className="min-w-0 truncate text-xs font-bold leading-tight">
                      {t(intent.labelKey, intent.fallback)}
                    </span>
                  </LocalizedLink>
                );
              })}
            </div>
          </section>

          {/* Every destination stays reachable — the intents are additive,
              never a replacement. Single-sourced from config/navigation.ts. */}
          <section className="flex flex-col gap-2">
            <h3 className={NAV_SHEET_HEADING}>
              {t('header.intents.browseHeading', 'Browse everything')}
            </h3>
            {NAV_CLUSTERS.map((cluster) => {
              const items = DESTINATIONS.filter(
                (d) => d.cluster === cluster.id && !HIDDEN_HERE.has(d.to),
              );
              if (!items.length) return null;
              return (
                <div key={cluster.id} className="flex flex-col gap-1">
                  {/* `h4`: a cluster is a subsection of "Browse everything". */}
                  <h4 className="text-xs font-bold">{t(cluster.labelKey)}</h4>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                    {items.map((dest) => (
                      <NavSheetTile
                        key={dest.to}
                        to={dest.to}
                        icon={dest.icon}
                        label={t(dest.labelKey)}
                        active={isHere(dest.to)}
                        onClick={close}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

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
