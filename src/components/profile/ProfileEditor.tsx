import { useState, useEffect, useCallback, useImperativeHandle, useRef, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, ChevronDown } from '@/components/icons';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';
import { OptimizedLoader } from '@/components/loading/OptimizedLoader';
import { ErrorBoundary, SectionErrorFallback } from '@/components/error/ErrorBoundary';
import { TravelForwardingSettings } from '@/components/profile/TravelForwardingSettings';
import { EmailPreferences } from '@/components/profile/EmailPreferences';
import { InboxPostSettings } from '@/components/profile/InboxPostSettings';
import { PushNotificationSettings } from '@/components/profile/PushNotificationSettings';
import { BasicInfoTab } from '@/components/profile/settings/BasicInfoTab';
import { IdentityTab } from '@/components/profile/settings/IdentityTab';
import { PrivacyTab } from '@/components/profile/settings/PrivacyTab';
import { DangerZone } from '@/components/profile/settings/DangerZone';
import { ModerationSettings } from '@/components/profile/settings/ModerationSettings';
import { BlueskyConnect } from '@/components/profile/settings/BlueskyConnect';
import { KinkVisibilitySettings } from '@/components/kinks/KinkVisibilitySettings';
import { PhotoGallery } from '@/components/profile/PhotoGallery';
import { DisplaySettings } from '@/components/profile/settings/DisplaySettings';
import { BlockedUsersSettings } from '@/components/profile/settings/BlockedUsersSettings';
import { ContentConsentSettings } from '@/components/profile/settings/ContentConsentSettings';
import { BodyProfileEditor } from '@/components/profile/BodyProfileEditor';
import { IntimateTab } from '@/components/profile/IntimateTab';
import { DatingMatchingEditor } from '@/components/profile/settings/DatingMatchingEditor';
import { TravelPreferencesEditor } from '@/components/profile/TravelPreferencesEditor';
import { StatusEditor } from '@/components/status/StatusEditor';
import { AvatarChooser, type AvatarSaveData } from '@/components/profile/AvatarChooser';
import { UsernamePanel } from '@/components/profile/UsernamePanel';
import { ChangePasswordPanel } from '@/components/profile/ChangePasswordPanel';
import { VibesLanguagesEditor } from '@/components/profile/settings/VibesLanguagesEditor';
import { PreferencesMirrorCard } from '@/components/profile/PreferencesMirrorCard';
import { pronounDisplay } from '@/components/ui/pronoun-utils';
import { initFormData } from '@/types/profileForm';
import type { ProfileFormData, ComingOutStatus } from '@/types/profileForm';
import type { Profile, ProfileUpdateResult } from '@/hooks/useProfile';
import type { AvatarConfig } from '@/components/profile/avatarConfig';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { ProfileEditorSection } from '@/lib/profileEditing';

export interface ProfileEditorHandle {
  savePending: () => Promise<boolean>;
}
interface EditorProps {
  section: ProfileEditorSection;
  onClose?: () => void;
  editorRef?: Ref<ProfileEditorHandle>;
  focusField?: string;
  /** Move focus to the panel on open. Off on /settings, where the page itself is the editor. */
  autoFocus?: boolean;
}
type ProfileX = Profile & { username?: string | null; username_auto_assigned?: boolean | null };
const TITLES: Record<ProfileEditorSection, string> = {
  profile: 'Profile',
  identity: 'Identity',
  dating: 'Dating & 18+',
  body: 'Body & about',
  privacy: 'Privacy & visibility',
  security: 'Sign-in & security',
  notifications: 'Notifications',
  travel: 'Travel',
  display: 'Language & display',
  data: 'Your data',
  avatar: 'Your avatar',
};
const SUBTITLES: Record<ProfileEditorSection, string> = {
  profile: 'Your vibe, name, pronouns, bio and links. Details save automatically.',
  identity: 'Gender, orientation, flags, coming out and relationships.',
  dating:
    'Choose who you want to meet. Your optional intimate details are shown only to opted-in adults.',
  body: 'Your build, age band, height and a few lines about you. Part of the 18+ intimate profile.',
  privacy: 'Who sees each part of your profile. Changes save automatically.',
  security: 'Your handle, passkey and password.',
  notifications: 'What we send to your device and inbox.',
  travel: 'Preferences that rank places and trips for you, and your booking inbox.',
  display: 'Language, currency, theme and accessibility.',
  data: 'Download everything we hold about you, or delete your account.',
  avatar: 'Choose how your profile appears.',
};

/** One contextual editor. Ownership and preview lenses are checked by ProfilePage. */
export default function ProfileEditor(props: EditorProps) {
  const navigate = useLocalizedNavigate();
  const { user, hasPasskey } = useAuth();
  const { profile, loading: isLoading, error, updateProfile, refetchProfile } = useProfile();
  const { toast } = useToast();
  if (!user) return null;
  return (
    <ErrorBoundary
      section="profile-editor"
      fallback={({ error, onRetry }) => (
        <SectionErrorFallback message={error?.message} onRetry={onRetry} />
      )}
    >
      {isLoading && !profile ? (
        <OptimizedLoader type="profile" />
      ) : error && !profile ? (
        <SectionErrorFallback message={error} onRetry={() => void refetchProfile()} />
      ) : (
        <ProfileSettingsContent
          {...props}
          profile={profile}
          updateProfile={updateProfile}
          refetchProfile={refetchProfile}
          toast={toast}
          navigate={navigate}
          hasPasskey={hasPasskey}
          user={user}
        />
      )}
    </ErrorBoundary>
  );
}
interface LoaderProps extends EditorProps {
  updateProfile: (updates: Partial<Profile>) => Promise<ProfileUpdateResult>;
  refetchProfile: () => Promise<unknown>;
  toast: ReturnType<typeof useToast>['toast'];
  navigate: ReturnType<typeof useLocalizedNavigate>;
  hasPasskey: boolean;
  user: SupabaseUser;
}
interface ContentProps extends LoaderProps {
  profile: Profile | null | undefined;
}
type SaveStatus = 'idle' | 'saved' | 'saving' | 'unsaved' | 'error' | 'auth-error';
function SaveStatusLine({
  status,
  onRetry,
  onSignIn,
}: {
  status: SaveStatus;
  onRetry: () => void;
  onSignIn: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 text-sm"
    >
      {status === 'saving' && (
        <>
          <TrackLoader size={14} />
          <span className="text-muted-foreground">Saving…</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check size={14} />
          <span className="text-muted-foreground">Profile changes saved</span>
        </>
      )}
      {status === 'unsaved' && (
        <Badge variant="outline" className="rounded-badge">
          Unsaved changes
        </Badge>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-4">
          <Badge variant="destructive" className="rounded-badge">
            Save failed
          </Badge>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {status === 'auth-error' && (
        <div className="flex items-center gap-4">
          <Badge variant="destructive" className="rounded-badge">
            Session expired
          </Badge>
          <Button variant="outline" size="sm" onClick={onSignIn}>
            Sign in
          </Button>
        </div>
      )}
    </div>
  );
}

function ProfileSettingsContent({
  profile,
  updateProfile,
  refetchProfile,
  toast,
  navigate,
  hasPasskey,
  user,
  section,
  onClose,
  editorRef,
  focusField,
  autoFocus = true,
}: ContentProps) {
  const { t } = useTranslation();
  const px = profile as ProfileX | null | undefined;
  const [formData, setFormData] = useState<ProfileFormData>(() => initFormData(profile));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const editVersion = useRef(0);
  const saving = useRef<Promise<boolean> | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const markDirty = () => {
    editVersion.current += 1;
    setHasUnsavedChanges(true);
    setSaveStatus('unsaved');
  };
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !autoFocus) return;
    const control = focusField ? document.getElementById(focusField) : null;
    if (control && panel.contains(control)) {
      control.focus({ preventScroll: true });
      control.scrollIntoView({ block: 'center' });
      return;
    }
    panel.focus({ preventScroll: true });
    panel.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  }, [section, focusField, autoFocus]);
  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    markDirty();
  };

  const handlePronounTagsChange = (tags: string[]) => {
    setFormData((prev) => ({ ...prev, pronoun_tags: tags, pronouns: pronounDisplay(tags) }));
    markDirty();
  };

  const handleIdentityFlagsChange = (flags: string[]) => {
    setFormData((prev) => ({ ...prev, identity_flags: flags }));
    markDirty();
  };

  const handleComingOutChange = (area: keyof ComingOutStatus, value: string) => {
    setFormData((prev) => ({
      ...prev,
      coming_out_status: { ...prev.coming_out_status, [area]: value },
    }));
    markDirty();
  };

  const handlePrivacyChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      privacy_settings: { ...prev.privacy_settings, [field]: value },
    }));
    markDirty();
  };

  const handleAvatarSave = async (data: AvatarSaveData) => {
    if (hasUnsavedChanges && !(await handleSave(false))) return;
    const { error } = await updateProfile({
      avatar_url: data.avatarUrl,
      avatar_config: data.avatarConfig,
      avatar_type: data.avatarType,
      avatar_auto_assigned: false,
    } as Partial<Profile>);
    if (error) {
      toast({ title: 'Avatar not saved', description: error, variant: 'destructive' });
      return;
    }
    onClose?.();
    toast({ title: 'Avatar updated' });
  };

  const handleSave = useCallback(
    async (silent = false) => {
      if (saving.current) return saving.current;
      const version = editVersion.current;
      setSaveStatus('saving');
      const request = (async () => {
        // display_name is a derived mirror of username (DB trigger) — never written here.
        const { error, errorKind } = await updateProfile({
          first_name: formData.first_name,
          last_name: formData.last_name,
          bio: formData.bio,
          location: formData.location,
          pronouns: formData.pronouns,
          pronoun_tags: formData.pronoun_tags,
          // Filter to the known vocabulary on save — TS is the vocabulary, the
          // DB only caps cardinality.
          identity_flags: formData.identity_flags.slice(0, 8),
          phone: formData.phone,
          website: formData.website,
          date_of_birth: formData.date_of_birth || null,
          age_range: formData.age_range,
          gender_identity: formData.gender_identity,
          sexual_orientation: formData.sexual_orientation,
          occupation: formData.occupation,
          education: formData.education,
          chosen_name: formData.chosen_name,
          name_pronunciation: formData.name_pronunciation,
          coming_out_status: { ...formData.coming_out_status },
          chosen_family_status: formData.chosen_family_status,
          disability_status: formData.disability_status,
          neurodivergent_status: formData.neurodivergent_status,
          romantic_orientation: formData.romantic_orientation,
          relationship_style: formData.relationship_style,
          current_relationship_status: formData.current_relationship_status,
          privacy_settings: { ...formData.privacy_settings },
        });

        if (error) {
          setSaveStatus(errorKind === 'auth' ? 'auth-error' : 'error');
          if (!silent) {
            toast({ title: 'Update failed', description: error, variant: 'destructive' });
          }
          return false;
        } else {
          if (version !== editVersion.current) {
            setSaveStatus('unsaved');
            return false;
          }
          setHasUnsavedChanges(false);
          setSaveStatus('saved');
          return true;
        }
      })();
      saving.current = request;
      try {
        return await request;
      } finally {
        saving.current = null;
      }
    },
    [formData, updateProfile, toast],
  );

  // Auto-save with 3s debounce — skip when auth is broken
  useEffect(() => {
    if (!hasUnsavedChanges || saveStatus === 'auth-error' || saveStatus === 'saving') return;
    const id = setTimeout(() => handleSave(true), 3000);
    return () => clearTimeout(id);
  }, [formData, hasUnsavedChanges, handleSave, saveStatus]);

  useImperativeHandle(
    editorRef,
    () => ({
      savePending: () => (hasUnsavedChanges ? handleSave(true) : Promise.resolve(true)),
    }),
    [hasUnsavedChanges, handleSave],
  );
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);
  const close = async () => {
    if (!hasUnsavedChanges || (await handleSave(false))) onClose?.();
  };
  const username = px?.username ?? null;
  const autosaves = section === 'profile' || section === 'identity' || section === 'privacy';
  const editor =
    section === 'profile' ? (
      <>
        <Card>
          <CardHeader>
            <CardTitle id="settings-avatar">Avatar & profile picture</CardTitle>
          </CardHeader>
          <CardContent>
            <section aria-labelledby="settings-avatar">
              <AvatarChooser
                email={user.email || ''}
                currentUrl={px?.avatar_url}
                currentConfig={px?.avatar_config as AvatarConfig | null}
                onSave={handleAvatarSave}
              />
            </section>
          </CardContent>
        </Card>
        <PhotoGallery userId={user.id} isOwnProfile />
        <Card>
          <CardHeader>
            <CardTitle>Your vibe & what you’re here for</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusEditor />
          </CardContent>
        </Card>
        <BasicInfoTab
          formData={formData}
          profile={profile}
          user={user}
          onChange={handleInputChange}
          onPronounTagsChange={handlePronounTagsChange}
          onPrivacyChange={handlePrivacyChange}
        />
      </>
    ) : section === 'identity' ? (
      <>
        <IdentityTab
          formData={formData}
          onChange={handleInputChange}
          onComingOutChange={handleComingOutChange}
          onFlagsChange={handleIdentityFlagsChange}
        />
      </>
    ) : section === 'dating' ? (
      <div className="flex flex-col gap-6">
        <DatingMatchingEditor />
        <IntimateTab dateOfBirth={formData.date_of_birth} />
      </div>
    ) : section === 'body' ? (
      <BodyProfileEditor />
    ) : section === 'privacy' ? (
      <>
        <PrivacyTab
          formData={formData}
          hasPasskey={hasPasskey}
          onPrivacyChange={handlePrivacyChange}
          focusField={focusField}
          showSecurity={false}
        />
        <KinkVisibilitySettings />
        <ContentConsentSettings />
        <BlockedUsersSettings />
        <ModerationSettings />
        <BlueskyConnect />
      </>
    ) : section === 'display' ? (
      <DisplaySettings />
    ) : section === 'avatar' ? (
      <AvatarChooser
        email={user.email || ''}
        currentUrl={px?.avatar_url}
        currentConfig={px?.avatar_config as AvatarConfig | null}
        onSave={handleAvatarSave}
      />
    ) : section === 'travel' ? (
      <>
        <TravelPreferencesEditor />
        <TravelForwardingSettings username={username} />
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="group justify-between">
              {t('settings.travel.reviewSearch', 'Review search preferences')}
              <ChevronDown className="ml-2 size-4 group-data-[state=open]:rotate-180" aria-hidden />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <VibesLanguagesEditor
              profile={profile}
              onUpdate={(u) => updateProfile(u as Partial<Profile>)}
            />
            <PreferencesMirrorCard
              profile={profile}
              onUpdate={(u) => updateProfile(u as Partial<Profile>)}
            />
          </CollapsibleContent>
        </Collapsible>
      </>
    ) : section === 'security' ? (
      <>
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div>
              <h3 className="font-semibold">{t('profile.account.username', 'Username')}</h3>
              <p className="text-13 text-muted-foreground">
                {t('profile.account.handle', 'Your unique queer.guide handle.')}
              </p>
            </div>
            <UsernamePanel
              username={username}
              autoAssigned={px?.username_auto_assigned ?? false}
              onChanged={() => void refetchProfile()}
            />
          </CardContent>
        </Card>
        <PrivacyTab
          formData={formData}
          hasPasskey={hasPasskey}
          onPrivacyChange={handlePrivacyChange}
          showVisibility={false}
        />
        <Card>
          <CardContent className="pt-6">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="group -mx-4 w-[calc(100%+2rem)] justify-between whitespace-normal text-start"
                >
                  {t('profile.account.changePassword', 'Change password')}
                  <ChevronDown
                    className="size-4 shrink-0 group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent forceMount className="mt-4 data-[state=closed]:hidden">
                <ChangePasswordPanel />
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </>
    ) : section === 'notifications' ? (
      <>
        <InboxPostSettings />
        <PushNotificationSettings />
        <EmailPreferences />
      </>
    ) : (
      <DangerZone username={username} />
    );
  return (
    <section
      ref={panelRef}
      id="profile-editor"
      tabIndex={-1}
      aria-labelledby="profile-editor-title"
      className="flex min-w-0 max-w-reading flex-col gap-6 scroll-mt-[calc(var(--header-pinned-bottom)+1rem)] outline-none"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="profile-editor-title" className="font-sans text-title font-bold">
            {t(`settings.sections.${section}.title`, TITLES[section])}
          </h2>
          <p className="mt-1 text-13 text-muted-foreground">
            {t(`settings.sections.${section}.description`, SUBTITLES[section])}
          </p>
        </div>
        {onClose && (
          <Button variant="outline" onClick={() => void close()} disabled={saveStatus === 'saving'}>
            <Check className="mr-2 size-4" aria-hidden />
            {autosaves ? 'Done' : 'Close'}
          </Button>
        )}
      </header>
      <div className="flex min-w-0 flex-col gap-6">{editor}</div>
      {/* Nothing to report until something is edited. */}
      {autosaves && saveStatus !== 'idle' && (
        <div className="sticky bottom-[var(--settings-sticky-bottom,calc(4.5rem+var(--island-inset)+env(safe-area-inset-bottom,0px)))] z-10 rounded-element bg-card px-4 py-4 md:bottom-[var(--settings-sticky-bottom,1rem)]">
          <SaveStatusLine
            status={saveStatus}
            onRetry={() => void handleSave(false)}
            onSignIn={() => navigate('/auth')}
          />
        </div>
      )}
    </section>
  );
}
