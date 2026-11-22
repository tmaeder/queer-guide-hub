import { Suspense, useState, useRef } from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Flag, Lock, Settings, Share2, Shield, User } from '@/components/icons';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ScrollableTabList } from '@/components/profile/ScrollableTabList';
import { UserRelationshipActions } from '@/components/profile/UserRelationshipActions';
import { OverviewTab } from '@/components/profile/tabs/OverviewTab';
import { ActivityTab } from '@/components/profile/tabs/ActivityTab';
import { TravelTab } from '@/components/profile/tabs/TravelTab';
import { ReportContentDialog } from '@/components/moderation/ReportContentDialog';
import { StatusPicker } from '@/components/status/StatusPicker';
import { ViewAsToggle } from '@/components/profile/ViewAsToggle';
import { previewFilterProfile, sectionVisible, type ProfileLens } from '@/lib/profileLens';
import { useSecurePublicProfile } from '@/hooks/useSecurePublicProfile';
import { useAuth } from '@/hooks/useAuth';
import { useStatus } from '@/hooks/useStatus';
import { usePublicStatus } from '@/hooks/usePublicStatus';
import { useToast } from '@/hooks/use-toast';
import { useMeta } from '@/hooks/useMeta';
import { useTranslation } from 'react-i18next';
import { publicDisplayName } from '@/lib/displayName';
import { useProfile } from '@/hooks/useProfile';
import { lazyRetry } from '@/utils/lazyRetry';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { profileEditPath, type ProfileEditorSection } from '@/lib/profileEditing';
import type { ProfileEditorHandle } from '@/components/profile/ProfileEditor';
import { PageContainer } from '@/components/layout/PageContainer';

const ProfileEditor = lazyRetry(() => import('@/components/profile/ProfileEditor'));

const TABS = ['overview', 'travel', 'activity'] as const;
type ProfileTab = (typeof TABS)[number];
/** Old tab URLs → where that content lives now. */
const MOVED_TABS: Record<string, string> = {
  groups: 'activity',
  contributions: 'activity',
};
const MOVED_ELSEWHERE: Record<string, string> = {
  progress: '/hub/progress',
  account: '/settings/security',
  saved: '/hub/saved',
  trips: '/hub/plans',
};

/**
 * Unified profile page at /user/:userId/:tab? — identity only. Owners see the
 * same page with an audience lens and an inline avatar editor; every other
 * preference lives on /settings, progress on /hub/progress.
 */
export default function ProfilePage() {
  const { t } = useTranslation();
  const params = useParams<{ userId: string; tab?: string; locale?: string }>();
  const navigate = useLocalizedNavigate();
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const targetUserId = params.userId;

  useMeta({ title: 'Profile', noIndex: true });

  const isOwnProfile = !!user && user.id === targetUserId;
  const {
    profile: secureProfile,
    loading: publicLoading,
    error: publicError,
  } = useSecurePublicProfile(isOwnProfile ? undefined : targetUserId);
  const { profile: ownProfile, loading: ownLoading, error: ownError } = useProfile();
  // The header and editors share the same self-read cache; public profiles keep
  // their server-filtered read. Background self-read failures must not discard drafts.
  const profile = isOwnProfile ? ownProfile : secureProfile;
  const loading = isOwnProfile ? ownLoading : publicLoading;
  const error = isOwnProfile ? (ownProfile ? null : ownError) : publicError;
  const [searchParams] = useSearchParams();
  const editorRef = useRef<ProfileEditorHandle>(null);
  const { status: ownStatus } = useStatus();
  const { status: othersStatus } = usePublicStatus(isOwnProfile ? null : (targetUserId ?? null));
  const status = isOwnProfile ? ownStatus : othersStatus;
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lens, setLens] = useState<ProfileLens>('you');

  const ownView = isOwnProfile && lens === 'you';
  const editSection = ownView && searchParams.get('edit') === 'avatar' ? 'avatar' : null;
  const tab: ProfileTab = (TABS as readonly string[]).includes(params.tab ?? '')
    ? (params.tab as ProfileTab)
    : 'overview';

  const basePath = `/user/${params.userId}`;
  const setTab = async (next: string) => {
    if (editorRef.current && !(await editorRef.current.savePending())) return;
    navigate(next === 'overview' ? basePath : `${basePath}/${next}`, { replace: true });
  };
  const openEditor = async (section: ProfileEditorSection, focusField?: string) => {
    if (!ownView || !targetUserId) return;
    if (editorRef.current && !(await editorRef.current.savePending())) return;
    navigate(profileEditPath(targetUserId, section, focusField));
  };
  const changeLens = async (next: ProfileLens) => {
    if (editorRef.current && !(await editorRef.current.savePending())) return;
    setLens(next);
  };
  const closeEditor = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('edit');
    next.delete('field');
    navigate(
      `${basePath}${tab === 'overview' ? '' : `/${tab}`}${next.size ? `?${next.toString()}` : ''}`,
      { replace: true },
    );
  };
  const editor = editSection ? (
    <Suspense fallback={<PageLoadingState variant="list" count={2} />}>
      <ProfileEditor section="avatar" onClose={closeEditor} editorRef={editorRef} />
    </Suspense>
  ) : undefined;

  // Retired tabs: same-page content moves to Activity, the rest to its new home.
  const prefix = params.locale ? `/${params.locale}` : '';
  if (params.tab && MOVED_TABS[params.tab])
    return <Navigate to={`${prefix}${basePath}/${MOVED_TABS[params.tab]}`} replace />;
  if (params.tab && MOVED_ELSEWHERE[params.tab] && isOwnProfile)
    return <Navigate to={`${prefix}${MOVED_ELSEWHERE[params.tab]}`} replace />;

  const handleShare = async () => {
    const url = window.location.href;
    const shareName = publicDisplayName(profile?.display_name as string | undefined);
    const title = shareName ? `${shareName}'s profile` : 'A queer.guide profile';
    const text =
      profile?.bio || (shareName ? `${shareName} on queer.guide` : 'A profile on queer.guide');
    if (navigator.share && navigator.canShare && navigator.canShare({ title, text, url })) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // fall back to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: 'Profile link copied to clipboard' });
    } catch {
      toast({ title: 'Share this profile', description: url, duration: 5000 });
    }
  };

  if (loading || authLoading) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-6 animate-pulse">
          <div className="h-8 bg-muted rounded-element w-1/4" />
          <div className="h-64 bg-muted rounded-container" />
          <div className="h-32 bg-muted rounded-container" />
        </div>
      </PageContainer>
    );
  }

  // Profiles are members-only (get_public_profile_safe is not granted to anon),
  // so a signed-out visitor gets a sign-in prompt, never a false "not found".
  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search + location.hash);
    return (
      <PageContainer size="form">
        <div className="flex flex-col items-center gap-6 py-12 text-center">
          <Lock size={32} className="text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-headline">
              {t('profile.signInGate.title', 'Sign in to view this profile')}
            </h1>
            <p className="text-body-lg text-muted-foreground">
              {t(
                'profile.signInGate.body',
                'Member profiles are only visible to signed-in members.',
              )}
            </p>
          </div>
          <Button asChild>
            <LocalizedLink to={`/auth?redirect=${redirect}`} className="no-underline">
              {t('profile.signInGate.cta', 'Sign in')}
            </LocalizedLink>
          </Button>
        </div>
      </PageContainer>
    );
  }

  if (error || !profile) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <User size={48} style={{ margin: '0 auto 16px' }} className="text-muted-foreground" />
          <p className="text-base font-medium mb-2">Profile not found</p>
          <p className="text-muted-foreground mb-4">
            This user profile doesn't exist or has been removed.
          </p>
          <Button onClick={() => navigate('/meet/members')}>
            <ArrowLeft size={16} className="mr-2" />
            Back to directory
          </Button>
        </div>
      </PageContainer>
    );
  }

  if ((profile as Record<string, unknown>).locked && !isOwnProfile) {
    return (
      <PageContainer>
        <div className="text-center py-12 flex flex-col items-center gap-4">
          <Shield size={48} className="text-muted-foreground" aria-hidden />
          <div>
            <p className="text-base font-medium mb-2">
              {publicDisplayName(profile.display_name as string | undefined) || 'Anonymous User'}
            </p>
            <p className="text-sm text-muted-foreground">
              This profile is only visible to friends.
            </p>
          </div>
          <UserRelationshipActions targetUserId={profile.user_id} />
        </div>
      </PageContainer>
    );
  }

  const visibility =
    ((profile.privacy_settings as Record<string, unknown> | null)?.profile_visibility as
      string | boolean | undefined) ?? 'public';
  if ((visibility === 'private' || visibility === false) && !isOwnProfile) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <Shield size={48} style={{ margin: '0 auto 16px' }} className="text-muted-foreground" />
          <p className="text-base font-medium mb-2">Private profile</p>
          <p className="text-muted-foreground mb-4">This user has set their profile to private.</p>
          <Button onClick={() => navigate('/meet/members')}>
            <ArrowLeft size={16} className="mr-2" />
            Back to directory
          </Button>
        </div>
      </PageContainer>
    );
  }

  const privacySettings = (profile.privacy_settings ?? {}) as Record<string, unknown>;
  const lensVisible =
    ownView ||
    !isOwnProfile ||
    sectionVisible(
      typeof visibility === 'string' ? visibility : visibility ? 'public' : 'private',
      lens,
      'public',
    );

  return (
    <PageContainer>
      <div className="flex min-w-0 flex-col gap-6">
        {!isOwnProfile && (
          <Button variant="ghost" onClick={() => navigate(-1)} className="-ms-2 self-start">
            <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
            {t('common.back', 'Back')}
          </Button>
        )}

        {lensVisible ? (
          <>
            <ProfileHeader
              profile={
                isOwnProfile
                  ? previewFilterProfile(profile as unknown as Record<string, unknown>, lens)
                  : (profile as unknown as Record<string, unknown>)
              }
              isOwnProfile={ownView}
              status={status}
              onEditStatus={() => setStatusPickerOpen(true)}
              onEditAvatar={() => void openEditor('avatar')}
              previewing={isOwnProfile && !ownView}
              tools={
                <>
                  {ownView && (
                    <Button variant="outline" size="icon" asChild>
                      <LocalizedLink to="/settings" aria-label={t('settings.title', 'Settings')}>
                        <Settings size={16} aria-hidden="true" />
                      </LocalizedLink>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleShare}
                    aria-label={t('profile.share', 'Share profile')}
                  >
                    <Share2 size={16} aria-hidden="true" />
                  </Button>
                  {!isOwnProfile && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setReportOpen(true)}
                      aria-label={t('profile.report', 'Report profile')}
                    >
                      <Flag size={16} aria-hidden="true" />
                    </Button>
                  )}
                </>
              }
            />

            <Tabs
              value={tab}
              onValueChange={(next) => void setTab(next)}
              className="w-full min-w-0"
            >
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border">
                <ScrollableTabList
                  aria-label={t('profile.sections', 'Profile sections')}
                  className="w-auto gap-6 rounded-none bg-transparent p-0"
                >
                  {(
                    [
                      ['overview', t('profile.tabs.overview', 'Overview')],
                      ['travel', t('profile.tabs.travel', 'Travel')],
                      ['activity', t('profile.tabs.activity', 'Activity')],
                    ] as const
                  ).map(([v, l]) => (
                    <TabsTrigger
                      key={v}
                      value={v}
                      className="-mb-px h-11 shrink-0 snap-start whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-0 text-15 font-bold text-muted-foreground shadow-none active:scale-100 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                    >
                      {l}
                    </TabsTrigger>
                  ))}
                </ScrollableTabList>
                {isOwnProfile && (
                  <ViewAsToggle
                    lens={lens}
                    onChange={(next) => void changeLens(next)}
                    className="mb-1.5"
                  />
                )}
              </div>

              <TabsContent value="overview" className="mt-6">
                <h2 className="sr-only">{t('profile.tabs.overview', 'Overview')}</h2>
                <OverviewTab
                  profile={profile as unknown as Record<string, unknown>}
                  isOwnProfile={isOwnProfile}
                  lens={lens}
                  onPostsClick={() => void setTab('activity')}
                  onEdit={(section, field) => void openEditor(section, field)}
                  editor={editor}
                />
              </TabsContent>

              <TabsContent value="travel" className="mt-6">
                <h2 className="sr-only">{t('profile.tabs.travel', 'Travel')}</h2>
                <TravelTab
                  userId={profile.user_id}
                  isOwnProfile={ownView}
                  preferences={
                    ownView && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" asChild>
                          <LocalizedLink to="/settings/travel">
                            {t('profile.travel.preferences', 'Travel preferences')}
                          </LocalizedLink>
                        </Button>
                        <Button variant="ghost" asChild>
                          <LocalizedLink
                            to={profileEditPath(profile.user_id, 'privacy', 'travel_visibility')}
                          >
                            {t('profile.travel.visibility', 'Travel visibility')}
                          </LocalizedLink>
                        </Button>
                      </div>
                    )
                  }
                />
              </TabsContent>

              <TabsContent value="activity" className="mt-6">
                <h2 className="sr-only">{t('profile.tabs.activity', 'Activity')}</h2>
                <ActivityTab
                  userId={profile.user_id}
                  isOwnProfile={isOwnProfile}
                  lens={lens}
                  privacySettings={privacySettings}
                />
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <>
            <ViewAsToggle
              lens={lens}
              onChange={(next) => void changeLens(next)}
              className="self-end"
            />
            <p className="rounded-container bg-card p-6 text-muted-foreground">
              {t(
                'profile.lensHidden',
                'This profile isn’t visible in this view. Switch to You to continue editing.',
              )}
            </p>
          </>
        )}
      </div>
      {ownView && <StatusPicker open={statusPickerOpen} onOpenChange={setStatusPickerOpen} />}
      {!isOwnProfile && user && (
        <ReportContentDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          contentType="profile"
          contentId={profile.user_id}
          targetUserId={profile.user_id}
        />
      )}
    </PageContainer>
  );
}
