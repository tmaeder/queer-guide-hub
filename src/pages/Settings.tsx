import { Suspense, useRef, type MouseEvent } from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import { lazyRetry } from '@/utils/lazyRetry';
import { cn } from '@/lib/utils';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/languages';
import { ArrowLeft, ArrowRight } from '@/components/icons';
import { SETTINGS_GROUPS as GROUPS, SETTINGS_NAV as NAV } from '@/components/profile/settingsNav';
import {
  isSettingsSection,
  legacySettingsDestination,
  type SettingsSection,
} from '@/lib/profileEditing';
import type { ProfileEditorHandle } from '@/components/profile/ProfileEditor';

const ProfileEditor = lazyRetry(() => import('@/components/profile/ProfileEditor'));

/**
 * /settings/:section? — every account and profile preference in one place.
 * Desktop: section list beside the open section. Mobile: /settings is the
 * list, /settings/<section> is one section with a way back.
 */
export default function Settings({ section: sectionProp }: { section?: SettingsSection } = {}) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const routeParams = useParams<{ section?: string; locale?: string }>();
  const params = { ...routeParams, section: sectionProp ?? routeParams.section };
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useLocalizedNavigate();
  const editorRef = useRef<ProfileEditorHandle>(null);
  useMeta({ title: 'Settings', noIndex: true });

  if (loading) return <PageLoadingState variant="list" count={3} />;
  const prefix =
    params.locale && isSupportedLocale(params.locale) && params.locale !== DEFAULT_LOCALE
      ? `/${params.locale}`
      : '';
  if (!user)
    return (
      <Navigate
        to={`${prefix}/auth?redirect=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
        replace
      />
    );

  // Old ?section= / ?tab= links and unknown section names land on a real section.
  const legacy = searchParams.has('section') || searchParams.has('tab') || searchParams.has('edit');
  if (legacy || (params.section && !isSettingsSection(params.section))) {
    const search = new URLSearchParams(location.search);
    if (params.section && !isSettingsSection(params.section) && !search.has('section'))
      search.set('section', params.section);
    return (
      <Navigate
        to={`${prefix}${legacySettingsDestination(user.id, `?${search.toString()}`)}${location.hash}`}
        replace
      />
    );
  }

  const section: SettingsSection = isSettingsSection(params.section) ? params.section : 'profile';
  const showIndexOnMobile = !params.section;
  const label = (s: SettingsSection) => t(`settings.sections.${s}.title`, NAV[s].label);

  // Flush any pending autosave before leaving the open section.
  const go = async (event: MouseEvent<HTMLAnchorElement>, target: SettingsSection) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (editorRef.current && !(await editorRef.current.savePending())) return;
    navigate(`/settings/${target}`);
  };

  return (
    <PageContainer>
      <div className="flex flex-col gap-6 md:gap-8">
        <header className={cn(!showIndexOnMobile && 'sr-only md:not-sr-only')}>
          <h1 className="font-display text-headline leading-tight md:text-display">
            {t('settings.title', 'Settings')}
          </h1>
          <p className="mt-2 text-muted-foreground">
            <LocalizedLink to={`/user/${user.id}`} className="underline underline-offset-4">
              {t('settings.viewProfile', 'View your profile')}
            </LocalizedLink>
          </p>
        </header>

        <div className="grid gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
          <nav
            aria-label={t('settings.sectionsLabel', 'Settings sections')}
            className={cn(
              'md:sticky md:top-[calc(var(--header-pinned-bottom)+1rem)] md:self-start',
              !showIndexOnMobile && 'hidden md:block',
            )}
          >
            <div className="flex flex-col gap-4">
              {GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col gap-1">
                  <p className="px-4 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t(`settings.groups.${group.label.toLowerCase()}`, group.label)}
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {group.sections.map((s) => {
                      const Icon = NAV[s].icon;
                      const active = !showIndexOnMobile && s === section;
                      const activeDesktop = s === section;
                      return (
                        <li key={s}>
                          <LocalizedLink
                            to={`/settings/${s}`}
                            onClick={(e) => void go(e, s)}
                            aria-current={activeDesktop ? 'page' : undefined}
                            className={cn(
                              'flex min-h-11 items-center gap-2 rounded-element px-4 text-15 font-bold no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              activeDesktop
                                ? 'md:bg-foreground md:text-background'
                                : 'text-foreground md:text-muted-foreground hover:bg-surface-container-high hover:text-foreground',
                              active && 'bg-foreground text-background',
                            )}
                          >
                            <Icon size={18} aria-hidden="true" />
                            <span className="flex-1">{label(s)}</span>
                            <ArrowRight size={16} aria-hidden="true" className="md:hidden" />
                          </LocalizedLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          <div className={cn('min-w-0', showIndexOnMobile && 'hidden md:block')}>
            <LocalizedLink
              to="/settings"
              className="mb-4 inline-flex min-h-11 items-center gap-2 text-13 font-bold no-underline md:hidden"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t('settings.allSettings', 'All settings')}
            </LocalizedLink>
            <Suspense fallback={<PageLoadingState variant="list" count={2} />}>
              <ProfileEditor
                key={section}
                section={section}
                editorRef={editorRef}
                focusField={searchParams.get('field') ?? undefined}
                autoFocus={searchParams.has('field')}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
