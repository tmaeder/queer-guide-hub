import { useState, useEffect, useCallback, useImperativeHandle, useRef, type Ref } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Check, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';
import { OptimizedLoader } from '@/components/loading/OptimizedLoader';
import { ErrorBoundary, SectionErrorFallback } from '@/components/error/ErrorBoundary';
import { TravelForwardingSettings } from '@/components/profile/TravelForwardingSettings';
import { EmailPreferences } from '@/components/profile/EmailPreferences';
import { PushNotificationSettings } from '@/components/profile/PushNotificationSettings';
import { DocumentsList } from '@/components/trips/DocumentsList';
import { BasicInfoTab } from '@/components/profile/settings/BasicInfoTab';
import { IdentityTab } from '@/components/profile/settings/IdentityTab';
import { PrivacyTab } from '@/components/profile/settings/PrivacyTab';
import { DangerZone } from '@/components/profile/settings/DangerZone';
import { ModerationSettings } from '@/components/profile/settings/ModerationSettings';
import { BlueskyConnect } from '@/components/profile/settings/BlueskyConnect';
import { IntimateTab } from '@/components/profile/IntimateTab';
import { TravelPreferencesEditor } from '@/components/profile/TravelPreferencesEditor';
import { StatusEditor } from '@/components/status/StatusEditor';
import { AvatarChooser, type AvatarSaveData } from '@/components/profile/AvatarChooser';
import { UsernamePanel } from '@/components/profile/UsernamePanel';
import { ChangePasswordPanel } from '@/components/profile/ChangePasswordPanel';
import { PreferencesMirrorCard } from '@/components/profile/PreferencesMirrorCard';
import { pronounDisplay } from '@/components/ui/pronoun-utils';
import { initFormData } from '@/types/profileForm';
import type { ProfileFormData, ComingOutStatus } from '@/types/profileForm';
import type { Profile, ProfileUpdateResult } from '@/hooks/useProfile';
import type { AvatarConfig } from '@/components/profile/avatarConfig';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { USER_MODE_VALUES } from '@/config/navigation';
import type { ProfileEditorSection } from '@/lib/profileEditing';

export interface ProfileEditorHandle {
  savePending: () => Promise<boolean>;
}
interface EditorProps {
  section: ProfileEditorSection;
  onClose?: () => void;
  editorRef?: Ref<ProfileEditorHandle>;
  focusField?: string;
}
type ProfileX = Profile & { username?: string | null; username_auto_assigned?: boolean | null };
const TITLES: Record<ProfileEditorSection, string> = {
  profile: 'Edit profile',
  avatar: 'Your avatar',
  status: 'Vibe & looking for',
  dating: 'Identity & dating',
  privacy: 'Privacy & visibility',
  account: 'Account',
  travel: 'Travel preferences',
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
type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'auth-error';
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
        <Badge variant="outline" className="rounded-element">
          Unsaved changes
        </Badge>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-4">
          <Badge variant="destructive" className="rounded-element">
            Save failed
          </Badge>
          <Button variant="outline" size="sm" onClick={onRetry} className="rounded-element">
            Retry
          </Button>
        </div>
      )}
      {status === 'auth-error' && (
        <div className="flex items-center gap-4">
          <Badge variant="destructive" className="rounded-element">
            Session expired
          </Badge>
          <Button variant="outline" size="sm" onClick={onSignIn} className="rounded-element">
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
}: ContentProps) {
  const px = profile as ProfileX | null | undefined;
  const [formData, setFormData] = useState<ProfileFormData>(() => initFormData(profile));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
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
    if (!panel) return;
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
  }, [section, focusField]);
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
          user_mode: USER_MODE_VALUES.find((mode) => mode === formData.user_mode),
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
  const autosaves = section === 'profile' || section === 'dating' || section === 'privacy';
  const editor =
    section === 'profile' ? (
      <BasicInfoTab
        formData={formData}
        profile={profile}
        user={user}
        onChange={handleInputChange}
        onPronounTagsChange={handlePronounTagsChange}
        onPrivacyChange={handlePrivacyChange}
      />
    ) : section === 'dating' ? (
      <>
        <IdentityTab
          formData={formData}
          onChange={handleInputChange}
          onComingOutChange={handleComingOutChange}
          onFlagsChange={handleIdentityFlagsChange}
        />
        <IntimateTab />
      </>
    ) : section === 'privacy' ? (
      <>
        <PrivacyTab
          formData={formData}
          hasPasskey={hasPasskey}
          onPrivacyChange={handlePrivacyChange}
          focusField={focusField}
          showSecurity={false}
        />
        <ModerationSettings />
        <BlueskyConnect />
      </>
    ) : section === 'avatar' ? (
      <AvatarChooser
        email={user.email || ''}
        currentUrl={px?.avatar_url}
        currentConfig={px?.avatar_config as AvatarConfig | null}
        onSave={handleAvatarSave}
      />
    ) : section === 'status' ? (
      <StatusEditor />
    ) : section === 'travel' ? (
      <>
        <TravelPreferencesEditor />
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost">
              Review search preferences
              <ChevronDown className="ml-2 size-4" aria-hidden />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <PreferencesMirrorCard
              profile={profile}
              onUpdate={(u) => updateProfile(u as Partial<Profile>)}
            />
          </CollapsibleContent>
        </Collapsible>
      </>
    ) : (
      <>
        <Card>
          <CardContent className="pt-6 flex flex-col gap-4">
            <div>
              <h3 className="font-semibold">Username</h3>
              <p className="text-sm text-muted-foreground">Your unique queer.guide handle.</p>
            </div>
            <UsernamePanel
              username={username}
              autoAssigned={px?.username_auto_assigned ?? false}
              onChanged={() => void refetchProfile()}
            />
          </CardContent>
        </Card>
        <ChangePasswordPanel />
        <PrivacyTab
          formData={formData}
          hasPasskey={hasPasskey}
          onPrivacyChange={handlePrivacyChange}
          showVisibility={false}
        />
        <PushNotificationSettings />
        <EmailPreferences />
        <TravelForwardingSettings username={username} />
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost">
              Personal documents
              <ChevronDown className="ml-2 size-4" aria-hidden />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <DocumentsList tripId={null} embedded readOnly />
          </CollapsibleContent>
        </Collapsible>
        <DangerZone username={username} />
      </>
    );
  return (
    <section
      ref={panelRef}
      id="profile-editor"
      tabIndex={-1}
      aria-labelledby="profile-editor-title"
      className="flex max-w-reading flex-col gap-6 scroll-mt-[calc(var(--header-pinned-bottom)+1rem)] outline-none"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="profile-editor-title" className="font-sans text-title font-bold">
            {TITLES[section]}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {section === 'account'
              ? 'Only you can access these controls.'
              : section === 'profile'
                ? 'Profile details save automatically. Social links use their Save button.'
                : section === 'dating'
                  ? 'Identity details save automatically. Dating preferences have their own controls.'
                  : section === 'avatar'
                    ? 'Choose how your profile appears.'
                    : section === 'travel'
                      ? 'Personalize the places and trips you discover.'
                      : section === 'status'
                        ? 'Set your vibe and what you’re looking for.'
                        : 'Changes save automatically.'}
          </p>
        </div>
        {onClose && (
          <Button variant="outline" onClick={() => void close()} disabled={saveStatus === 'saving'}>
            <Check className="mr-2 size-4" aria-hidden />
            {autosaves ? 'Done' : 'Close'}
          </Button>
        )}
      </header>
      <div className="flex flex-col gap-6">{editor}</div>
      {autosaves && (
        <div className="sticky bottom-[calc(4.5rem+var(--island-inset)+env(safe-area-inset-bottom,0px))] z-10 rounded-element bg-card px-4 py-4 md:bottom-4">
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
