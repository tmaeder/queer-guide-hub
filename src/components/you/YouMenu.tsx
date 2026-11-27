import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, LogOut, Settings, Shield } from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  HEADER_MENU_CLASS,
  HEADER_MENU_PROPS,
  HEADER_TRIGGER_CLASS,
  HEADER_MENU_ANCHOR,
} from '@/components/layout/headerMenu';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { generateAvatarUrl } from '@/lib/avatar';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { lazyRetry } from '@/utils/lazyRetry';
import { cn } from '@/lib/utils';
import { SETTINGS_GROUPS, SETTINGS_NAV } from '@/components/profile/settingsNav';
import type { SettingsSection } from '@/lib/profileEditing';
import type { ProfileEditorHandle } from '@/components/profile/ProfileEditor';

const ProfileEditor = lazyRetry(() => import('@/components/profile/ProfileEditor'));
const SECTIONS = SETTINGS_GROUPS.flatMap((g) => g.sections);

// Save bars stick to the bottom of the menu's scroll box, not above the dock.
const EDITOR_STYLE = { '--settings-sticky-bottom': '0px' } as CSSProperties;

/**
 * The You menu: who you are, every settings section editable in place, and
 * sign-out. Shared by the dock's You sheet and the desktop header popover.
 */
export function YouMenuBody({
  onNavigate,
  editorHeight,
  besideClose = false,
}: {
  onNavigate: () => void;
  /** Max height of the open section's scroll box: whatever the host leaves. */
  editorHeight: string;
  /** The sheet reserves a top row for its close button; share that row. */
  besideClose?: boolean;
}) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { isAdmin, isModerator } = useAdminRoles();
  const [section, setSection] = useState<SettingsSection | null>(null);
  const editorRef = useRef<ProfileEditorHandle>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const lastSection = useRef<SettingsSection | null>(null);

  // The clicked control unmounts on every switch, so hand focus over on purpose:
  // into a section → its Back button; back → the section you came from.
  useEffect(() => {
    if (section) {
      lastSection.current = section;
      backRef.current?.focus({ preventScroll: true });
    } else if (lastSection.current) {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-section="${lastSection.current}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [section]);

  if (!user) return null;
  const displayName = (profile?.display_name as string | null) || null;
  const username = (profile?.username as string | null) || null;
  const avatarSrc = (profile?.avatar_url as string | null | undefined) || undefined;
  const avatarInitial = (displayName || user.email || 'U').charAt(0).toUpperCase();
  const name = displayName || (username ? `@${username}` : t('header.userMenu.you', 'You'));
  const label = (s: SettingsSection) => t(`settings.sections.${s}.title`, SETTINGS_NAV[s].label);

  // Flush a pending autosave before leaving the open section.
  const back = async () => {
    if (editorRef.current && !(await editorRef.current.savePending())) return;
    setSection(null);
  };

  if (section) {
    return (
      <div className="flex flex-col gap-2">
        <div className={cn(besideClose && '-mt-12 me-12')}>
          <button
            ref={backRef}
            type="button"
            onClick={() => void back()}
            className="inline-flex min-h-11 items-center gap-2 rounded-element px-2.5 text-13 font-bold transition-colors hover:bg-surface-container-high"
          >
            <ArrowLeft size={16} aria-hidden />
            {t('settings.title', 'Settings')}
          </button>
        </div>
        {/* The section scrolls inside its own box, sized so the sheet or
            popover around it never scrolls: Back stays in view. */}
        <div
          style={EDITOR_STYLE}
          className={cn(
            'relative overflow-y-auto overscroll-contain rounded-container px-1',
            editorHeight,
          )}
        >
          <Suspense
            fallback={
              <p className="py-6 text-center text-13 text-muted-foreground">
                {t('inbox.loading', { defaultValue: 'Loading…' })}
              </p>
            }
          >
            <ProfileEditor section={section} editorRef={editorRef} autoFocus={false} />
          </Suspense>
        </div>
      </div>
    );
  }

  const linkRow =
    'flex min-h-11 items-center gap-2.5 rounded-element px-2.5 text-13 font-bold no-underline transition-colors hover:bg-surface-container-high';

  return (
    <div className="flex flex-col gap-2">
      {/* Who you are: the card opens your public profile. */}
      <LocalizedLink
        to={`/user/${user.id}`}
        onClick={onNavigate}
        className={cn(
          'group flex items-center gap-4 rounded-container bg-muted p-2.5 no-underline transition-colors hover:bg-foreground hover:text-background',
          besideClose && '-mt-12 me-12',
        )}
      >
        <Avatar className="h-12 w-12 shrink-0 ring-2 ring-card">
          <AvatarImage src={avatarSrc} alt="" />
          <AvatarFallback className="font-bold">{avatarInitial}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-15 font-bold leading-tight">{name}</span>
          <span className="text-xs font-bold text-muted-foreground group-hover:text-background/70">
            {t('header.userMenu.viewProfile', 'View public profile')}
          </span>
        </span>
        <ArrowRight size={16} aria-hidden className="shrink-0 opacity-60" />
      </LocalizedLink>

      <nav
        ref={listRef}
        aria-label={t('settings.sectionsLabel', 'Settings sections')}
        className="rounded-container bg-muted p-1.5"
      >
        <ul className="m-0 grid list-none grid-cols-2 gap-0.5 p-0">
          {SECTIONS.map((s) => {
            const Icon = SETTINGS_NAV[s].icon;
            return (
              <li key={s} className="min-w-0">
                <button
                  type="button"
                  data-section={s}
                  onClick={() => setSection(s)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-element px-2.5 text-left text-13 font-bold transition-colors hover:bg-surface-container-high"
                >
                  <Icon size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 leading-tight">{label(s)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-wrap items-center gap-0.5">
        <LocalizedLink to="/settings" onClick={onNavigate} className={linkRow}>
          <Settings size={16} aria-hidden />
          {t('settings.allSettings', 'All settings')}
        </LocalizedLink>
        {(isAdmin || isModerator) && (
          <LocalizedLink to="/admin" onClick={onNavigate} className={linkRow}>
            <Shield size={16} aria-hidden />
            {t('header.mobileNav.admin', 'Admin')}
          </LocalizedLink>
        )}
        <button
          type="button"
          onClick={() => {
            onNavigate();
            void signOut();
          }}
          className="ms-auto flex min-h-11 items-center gap-2.5 rounded-element px-2.5 text-13 font-bold text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut size={16} aria-hidden />
          {t('header.signOut', 'Sign Out')}
        </button>
      </div>
    </div>
  );
}

/** The desktop header's avatar: the You menu in a popover. */
export function HeaderYou({ onInk = false }: { onInk?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const displayName = (profile?.display_name as string | null) || null;
  const avatarSrc =
    (profile?.avatar_url as string | null | undefined) ||
    (user.email ? generateAvatarUrl(user.email, 96) || undefined : undefined);
  const avatarInitial = (displayName || user.email || 'U').charAt(0).toUpperCase();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor virtualRef={HEADER_MENU_ANCHOR} />
      <PopoverTrigger asChild>
        <Button
          variant={onInk ? 'ghostReversed' : 'ghost'}
          size="sm"
          style={{ height: 44, width: 44 }}
          className={cn('p-0', onInk ? 'data-[state=open]:bg-background/15' : HEADER_TRIGGER_CLASS)}
          aria-label={t('header.openUserMenu', 'Open user menu')}
        >
          <Avatar style={{ height: 36, width: 36 }}>
            <AvatarImage
              src={avatarSrc}
              alt={displayName || t('header.userMenu.yourAccount', 'Your account')}
            />
            <AvatarFallback>{avatarInitial}</AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        {...HEADER_MENU_PROPS}
        aria-label={t('header.userMenu.you', 'You')}
        className={HEADER_MENU_CLASS}
      >
        {/* The space Radix leaves below the trigger, minus 2rem padding and the
            3.25rem Back row. */}
        <YouMenuBody
          onNavigate={() => setOpen(false)}
          editorHeight="max-h-[calc(var(--radix-popover-content-available-height)-5.25rem)]"
        />
      </PopoverContent>
    </Popover>
  );
}
