import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  User,
  ArrowLeft,
  Loader2,
  Heart,
  Lock,
  Check,
  Settings as SettingsIcon,
  ChevronDown,
  Luggage,
  FileText,
  X,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';
import { useProfileData } from '@/hooks/useProfileData';
import { OptimizedLoader } from '@/components/loading/OptimizedLoader';
import OptimizedErrorBoundary, {
  DataErrorFallback,
} from '@/components/error/OptimizedErrorBoundary';
import { EmailForwardingSettings } from '@/components/profile/EmailForwardingSettings';
import { PushNotificationSettings } from '@/components/profile/PushNotificationSettings';
import { DocumentsList } from '@/components/trips/DocumentsList';
import { BasicInfoTab } from '@/components/profile/settings/BasicInfoTab';
import { IdentityTab } from '@/components/profile/settings/IdentityTab';
import { PrivacyTab } from '@/components/profile/settings/PrivacyTab';
import { DangerZone } from '@/components/profile/settings/DangerZone';
import { IntimateTab } from '@/components/profile/IntimateTab';
import { TravelPreferencesEditor } from '@/components/profile/TravelPreferencesEditor';
import { IdentityPreviewCard } from '@/components/profile/IdentityPreviewCard';
import { AvatarChooser, type AvatarSaveData } from '@/components/profile/AvatarChooser';
import { UsernamePanel } from '@/components/profile/UsernamePanel';
import { PreferencesMirrorCard } from '@/components/profile/PreferencesMirrorCard';
import { userModeLabel } from '@/lib/userMode';
import { pronounDisplay } from '@/components/ui/pronoun-utils';
import { shortLocation } from '@/lib/shortLocation';
import { initFormData, calculateCompletion } from '@/types/profileForm';
import type { ProfileFormData, ComingOutStatus } from '@/types/profileForm';
import type { Profile, ProfileUpdateResult } from '@/hooks/useProfile';
import type { AvatarConfig } from '@/components/profile/AvatarBuilder';
import { PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';
import type { User as SupabaseUser } from '@supabase/supabase-js';

/** Columns newer than the generated Supabase types. */
type ProfileX = Profile & {
  username?: string | null;
  pronoun_tags?: string[] | null;
  avatar_auto_assigned?: boolean | null;
  username_auto_assigned?: boolean | null;
};

type SectionKind = 'profile' | 'dating' | 'privacy' | 'travel' | 'account' | 'avatar' | null;

/** Personal documents are removed after this date (T+30 export window). */
const DOCS_REMOVAL_DATE = 'July 11, 2026';

export default function Settings() {
  const navigate = useLocalizedNavigate();
  useMeta({ title: 'Settings', noIndex: true });
  const { user, hasPasskey } = useAuth();
  const { updateProfile, refetchProfile } = useProfile();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) navigate('/auth');
  }, [user, navigate]);

  if (!user) return null;

  return (
    <OptimizedErrorBoundary fallback={DataErrorFallback}>
      <ProfileSettingsLoader
        updateProfile={updateProfile}
        refetchProfile={refetchProfile}
        toast={toast}
        navigate={navigate}
        hasPasskey={hasPasskey}
        user={user}
      />
    </OptimizedErrorBoundary>
  );
}

interface LoaderProps {
  updateProfile: (updates: Partial<Profile>) => Promise<ProfileUpdateResult>;
  refetchProfile: () => Promise<unknown>;
  toast: ReturnType<typeof useToast>['toast'];
  navigate: ReturnType<typeof useLocalizedNavigate>;
  hasPasskey: boolean;
  user: SupabaseUser;
}

function ProfileSettingsLoader({ updateProfile, refetchProfile, toast, navigate, hasPasskey, user }: LoaderProps) {
  const { profile, isLoading, isError, errors, profileLoading, profileError } = useProfileData();

  if (isLoading || profileLoading) {
    return <OptimizedLoader type="profile" />;
  }

  if (isError || profileError) {
    return (
      <DataErrorFallback
        error={profileError}
        errors={errors}
        resetErrorBoundary={() => window.location.reload()}
      />
    );
  }

  return (
    <ProfileSettingsContent
      profile={profile}
      updateProfile={updateProfile}
      refetchProfile={refetchProfile}
      toast={toast}
      navigate={navigate}
      hasPasskey={hasPasskey}
      user={user}
    />
  );
}

interface ContentProps {
  profile: Profile | null | undefined;
  updateProfile: (updates: Partial<Profile>) => Promise<ProfileUpdateResult>;
  refetchProfile: () => Promise<unknown>;
  toast: ReturnType<typeof useToast>['toast'];
  navigate: ReturnType<typeof useLocalizedNavigate>;
  hasPasskey: boolean;
  user: SupabaseUser;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'auth-error';

/**
 * Auto-save feedback. Rendered both in the page-bottom bar AND inside open
 * sheets — sheets cover the bottom bar, and that's exactly where edits happen.
 */
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
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-sm">
      {status === 'saving' && (
        <>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          <span className="text-muted-foreground">Saving…</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check size={14} />
          <span className="text-muted-foreground">All changes saved</span>
        </>
      )}
      {status === 'unsaved' && (
        <Badge variant="outline" className="rounded-element">Unsaved changes</Badge>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-4">
          <Badge variant="destructive" className="rounded-element">Save failed</Badge>
          <Button variant="outline" size="sm" onClick={onRetry} className="rounded-element">
            Retry
          </Button>
        </div>
      )}
      {status === 'auth-error' && (
        <div className="flex items-center gap-4">
          <Badge variant="destructive" className="rounded-element">Session expired</Badge>
          <Button variant="outline" size="sm" onClick={onSignIn} className="rounded-element">
            Sign in
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Glanceable summary row that expands its editor inline (no pop-over). The
 * header is never an input; the editor lives in the collapsible body.
 */
function AccordionSection({
  id,
  icon: Icon,
  title,
  summary,
  active,
  onToggle,
  children,
}: {
  id: Exclude<SectionKind, null>;
  icon: typeof User;
  title: string;
  summary: string;
  active: boolean;
  onToggle: (next: SectionKind) => void;
  children: ReactNode;
}) {
  return (
    <Collapsible open={active} onOpenChange={(open) => onToggle(open ? id : null)}>
      <div
        id={`settings-section-${id}`}
        className={cn(
          'rounded-container border bg-card transition-colors scroll-mt-24',
          active ? 'border-foreground/30' : 'border-border',
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left p-4 flex items-center gap-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 rounded-container"
          >
            <div className="w-10 h-10 rounded-element bg-muted flex items-center justify-center shrink-0">
              <Icon size={18} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground truncate">{summary}</p>
            </div>
            <ChevronDown
              size={16}
              className={cn(
                'text-muted-foreground shrink-0 transition-transform',
                active && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-6 pt-2 border-t border-border">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
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
}: ContentProps) {
  const px = profile as ProfileX | null | undefined;
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState<ProfileFormData>(() => initFormData(profile));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  // ?section= deep links (and old ?tab= links) expand the matching section.
  const SECTION_TO_KEY: Record<string, SectionKind> = {
    profile: 'profile',
    basic: 'profile',
    identity: 'dating',
    account: 'account',
    notifications: 'account',
    privacy: 'privacy',
    travel: 'travel',
    dating: 'dating',
    relationships: 'dating',
    intimate: 'dating',
    avatar: 'avatar',
  };
  const [activeSection, setActiveSection] = useState<SectionKind>(
    () =>
      SECTION_TO_KEY[searchParams.get('section') ?? ''] ??
      SECTION_TO_KEY[searchParams.get('tab') ?? ''] ??
      null,
  );

  // Scroll the opened section into view (deep link, hero button, or off-screen card).
  useEffect(() => {
    if (!activeSection) return;
    const el = document.getElementById(`settings-section-${activeSection}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [activeSection]);

  const profileCompletion = calculateCompletion(formData, profile);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
    setSaveStatus('unsaved');
  };

  const handlePronounTagsChange = (tags: string[]) => {
    setFormData((prev) => ({ ...prev, pronoun_tags: tags, pronouns: pronounDisplay(tags) }));
    setHasUnsavedChanges(true);
    setSaveStatus('unsaved');
  };

  const handleComingOutChange = (area: keyof ComingOutStatus, value: string) => {
    setFormData((prev) => ({
      ...prev,
      coming_out_status: { ...prev.coming_out_status, [area]: value },
    }));
    setHasUnsavedChanges(true);
    setSaveStatus('unsaved');
  };

  const handlePrivacyChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      privacy_settings: { ...prev.privacy_settings, [field]: value },
    }));
    setHasUnsavedChanges(true);
    setSaveStatus('unsaved');
  };

  const handleAvatarSave = async (data: AvatarSaveData) => {
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
    setActiveSection(null);
    toast({ title: 'Avatar updated' });
  };

  const handleSave = useCallback(
    async (silent = false) => {
      setSaveStatus('saving');

      const { error, errorKind } = await updateProfile({
        display_name: formData.display_name,
        first_name: formData.first_name,
        last_name: formData.last_name,
        bio: formData.bio,
        location: formData.location,
        pronouns: formData.pronouns,
        pronoun_tags: formData.pronoun_tags,
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
        coming_out_status: formData.coming_out_status,
        chosen_family_status: formData.chosen_family_status,
        disability_status: formData.disability_status,
        neurodivergent_status: formData.neurodivergent_status,
        romantic_orientation: formData.romantic_orientation,
        relationship_style: formData.relationship_style,
        current_relationship_status: formData.current_relationship_status,
        privacy_settings: formData.privacy_settings,
        user_mode: formData.user_mode,
      } as Partial<Profile>);

      if (error) {
        setSaveStatus(errorKind === 'auth' ? 'auth-error' : 'error');
        if (!silent) {
          toast({ title: 'Update failed', description: error, variant: 'destructive' });
        }
      } else {
        setHasUnsavedChanges(false);
        setSaveStatus('saved');
      }
    },
    [formData, updateProfile, toast],
  );

  // Auto-save with 3s debounce — skip when auth is broken
  useEffect(() => {
    if (!hasUnsavedChanges || saveStatus === 'auth-error') return;
    const id = setTimeout(() => handleSave(true), 3000);
    return () => clearTimeout(id);
  }, [formData, hasUnsavedChanges, handleSave, saveStatus]);

  // Gap-driven nudges moved to the profile Overview (GapPromptCard).
  const username = px?.username ?? null;

  const privacySummary = [
    `Profile: ${formData.privacy_settings.profile_visibility || 'public'}`,
    `Identity: ${formData.privacy_settings.identity_visibility || 'friends'}`,
    `Travel: ${formData.privacy_settings.travel_visibility || 'public'}`,
  ].join(' · ');

  const toggleSection = (next: SectionKind) => setActiveSection(next);

  return (
    <div className="container mx-auto py-8 px-4 flex flex-col gap-6 pb-24 max-w-2xl">
      <PageHeader
        title="Settings"
        subtitle="Your profile, the way you want to be seen"
        actions={
          <Button variant="outline" onClick={() => navigate(-1)} className="rounded-element">
            <ArrowLeft size={16} className="mr-2" />
            Back
          </Button>
        }
      />

      {/* Identity hero — live preview, tap to edit */}
      <IdentityPreviewCard
        displayName={formData.display_name}
        username={username}
        pronouns={formData.pronouns}
        pronounsVisibility={formData.privacy_settings.pronouns_visibility}
        profileVisibility={formData.privacy_settings.profile_visibility}
        occupation={formData.occupation}
        bio={formData.bio}
        avatarUrl={px?.avatar_url}
        avatarConfig={px?.avatar_config as AvatarConfig | null}
        email={user.email || ''}
        completion={profileCompletion}
        onEditAvatar={() => setActiveSection(activeSection === 'avatar' ? null : 'avatar')}
        onEditProfile={() => setActiveSection('profile')}
        onEditAccount={() => setActiveSection('account')}
      />

      {/* Avatar editor — opened from the hero, inline (no pop-over) */}
      {activeSection === 'avatar' && (
        <Card id="settings-section-avatar" className="scroll-mt-24 border-foreground/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold">Your avatar</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveSection(null)}
                className="rounded-element"
              >
                <X size={14} className="mr-1" aria-hidden="true" />
                Close
              </Button>
            </div>
            <AvatarChooser
              email={user.email || ''}
              currentUrl={px?.avatar_url}
              currentConfig={px?.avatar_config as AvatarConfig | null}
              onSave={handleAvatarSave}
            />
          </CardContent>
        </Card>
      )}

      {/* State-of-your-account — summaries that expand their editor inline */}
      <div className="flex flex-col gap-2">
        <AccordionSection
          id="profile"
          icon={User}
          title="Profile"
          summary={
            [formData.bio && 'bio', shortLocation(formData.location), formData.website && 'links']
              .filter(Boolean)
              .join(' · ') || 'Bio, location, links'
          }
          active={activeSection === 'profile'}
          onToggle={toggleSection}
        >
          <BasicInfoTab
            formData={formData}
            profile={profile}
            user={user}
            onChange={handleInputChange}
            onPronounTagsChange={handlePronounTagsChange}
            onPrivacyChange={handlePrivacyChange}
          />
        </AccordionSection>

        <AccordionSection
          id="dating"
          icon={Heart}
          title="Identity & dating"
          summary={`${userModeLabel(formData.user_mode)}${formData.gender_identity ? ' · identity set' : ''}`}
          active={activeSection === 'dating'}
          onToggle={toggleSection}
        >
          <div className="flex flex-col gap-6">
            <IdentityTab
              formData={formData}
              onChange={handleInputChange}
              onComingOutChange={handleComingOutChange}
            />
            <IntimateTab />
          </div>
        </AccordionSection>

        <AccordionSection
          id="privacy"
          icon={Lock}
          title="Privacy & visibility"
          summary={privacySummary}
          active={activeSection === 'privacy'}
          onToggle={toggleSection}
        >
          <PrivacyTab
            formData={formData}
            hasPasskey={hasPasskey}
            onPrivacyChange={handlePrivacyChange}
          />
        </AccordionSection>

        <AccordionSection
          id="travel"
          icon={Luggage}
          title="Travel preferences"
          summary="Budget, style, accessibility needs"
          active={activeSection === 'travel'}
          onToggle={toggleSection}
        >
          <TravelPreferencesEditor />
        </AccordionSection>

        <AccordionSection
          id="account"
          icon={SettingsIcon}
          title="Account"
          summary={username ? `@${username} · email, notifications` : 'Username, email, notifications'}
          active={activeSection === 'account'}
          onToggle={toggleSection}
        >
          <div className="flex flex-col gap-6">
            <Card>
              <CardContent className="pt-6 flex flex-col gap-4">
                <div>
                  <p className="font-semibold">Username</p>
                  <p className="text-sm text-muted-foreground">
                    Your unique queer.guide handle.
                  </p>
                </div>
                <UsernamePanel
                  username={username}
                  autoAssigned={px?.username_auto_assigned ?? false}
                  onChanged={() => void refetchProfile()}
                />
              </CardContent>
            </Card>
            <EmailForwardingSettings />
            <PushNotificationSettings />
            <DangerZone username={username} />
          </div>
        </AccordionSection>
      </div>

      {/* Preferences — review-only mirror of in-context choices */}
      <PreferencesMirrorCard profile={profile} onUpdate={(u) => updateProfile(u as Partial<Profile>)} />

      {/* Personal documents — deprecation notice; the list itself is behind a disclosure */}
      <Card>
        <CardContent className="pt-6">
          <Collapsible>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-element bg-muted flex items-center justify-center shrink-0">
                <FileText size={18} aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Personal documents are going away</p>
                <p className="text-sm text-muted-foreground">
                  Removed on {DOCS_REMOVAL_DATE}. Download anything you want to keep — files are
                  permanently deleted after that date. Trip documents are not affected.
                </p>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-element mt-4 group">
                    Show my documents
                    <ChevronDown
                      size={14}
                      className="ml-2 transition-transform group-data-[state=open]:rotate-180"
                      aria-hidden="true"
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
            <CollapsibleContent className="mt-4">
              <DocumentsList tripId={null} embedded readOnly />
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Sticky auto-save status bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95">
        <div className="container mx-auto px-4 py-4">
          <SaveStatusLine
            status={saveStatus}
            onRetry={() => handleSave(false)}
            onSignIn={() => navigate('/auth')}
          />
        </div>
      </div>
    </div>
  );
}
