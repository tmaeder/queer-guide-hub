import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  User,
  ArrowLeft,
  Loader2,
  Heart,
  Lock,
  Check,
  Settings,
  ChevronRight,
  AtSign,
  Sparkles,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
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
import { IntimateTab } from '@/components/profile/IntimateTab';
import { IdentityPreviewCard } from '@/components/profile/IdentityPreviewCard';
import { AvatarChooser, type AvatarSaveData } from '@/components/profile/AvatarChooser';
import { UsernamePanel } from '@/components/profile/UsernamePanel';
import { PreferencesMirrorCard } from '@/components/profile/PreferencesMirrorCard';
import { pronounDisplay } from '@/components/ui/pronoun-combobox';
import { initFormData, calculateCompletion } from '@/types/profileForm';
import type { ProfileFormData, ComingOutStatus } from '@/types/profileForm';
import type { Profile, ProfileUpdateResult } from '@/hooks/useProfile';
import type { AvatarConfig } from '@/components/profile/AvatarBuilder';
import { PageHeader } from '@/components/layout/PageHeader';
import type { User as SupabaseUser } from '@supabase/supabase-js';

/** Columns newer than the generated Supabase types. */
type ProfileX = Profile & {
  username?: string | null;
  pronoun_tags?: string[] | null;
  avatar_auto_assigned?: boolean | null;
  username_auto_assigned?: boolean | null;
};

type SheetKind = 'profile' | 'dating' | 'privacy' | 'account' | 'avatar' | null;

/** Personal documents are removed after this date (T+30 export window). */
const DOCS_REMOVAL_DATE = 'July 11, 2026';

export default function ProfileSettings() {
  const navigate = useLocalizedNavigate();
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

/** Glanceable state row — never an input. Tap opens the focused editor sheet. */
function SummaryCard({
  icon: Icon,
  title,
  summary,
  onOpen,
}: {
  icon: typeof User;
  title: string;
  summary: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-container border border-border bg-card p-4 flex items-center gap-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
    >
      <div className="w-10 h-10 rounded-element bg-muted flex items-center justify-center shrink-0">
        <Icon size={18} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground truncate">{summary}</p>
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
    </button>
  );
}

const PROMPT_DISMISS_KEY = 'qg.settings.prompt.dismissed';
const PROMPT_REDISPLAY_MS = 7 * 24 * 60 * 60 * 1000;

function promptDismissed(kind: string): boolean {
  try {
    const raw = localStorage.getItem(`${PROMPT_DISMISS_KEY}.${kind}`);
    return !!raw && Date.now() - Number(raw) < PROMPT_REDISPLAY_MS;
  } catch {
    return false;
  }
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
  const [saveStatus, setSaveStatus] = useState<
    'saved' | 'saving' | 'unsaved' | 'error' | 'auth-error'
  >('saved');
  // Old deep links (?tab=privacy etc.) open the matching sheet.
  const LEGACY_TAB_TO_SHEET: Record<string, SheetKind> = {
    profile: 'profile',
    basic: 'profile',
    identity: 'profile',
    account: 'account',
    notifications: 'account',
    privacy: 'privacy',
    dating: 'dating',
    relationships: 'dating',
    intimate: 'dating',
  };
  const [openSheet, setOpenSheet] = useState<SheetKind>(
    () => LEGACY_TAB_TO_SHEET[searchParams.get('tab') ?? ''] ?? null,
  );
  const [promptTick, setPromptTick] = useState(0);

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
    setOpenSheet(null);
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

  // ---- Prompt slot: one gap-driven nudge, priority username > avatar > pronouns
  const username = px?.username ?? null;
  let prompt: { kind: string; title: string; body: string; cta: string; sheet: SheetKind } | null =
    null;
  if (!username) {
    prompt = {
      kind: 'username',
      title: 'Claim your @username',
      body: 'Your permanent handle for mentions and your profile link.',
      cta: 'Claim now',
      sheet: 'account',
    };
  } else if (px?.avatar_auto_assigned && !promptDismissed('avatar')) {
    prompt = {
      kind: 'avatar',
      title: 'Make your avatar yours',
      body: 'We gave you a starter look. Upload a photo, import one, or build your own.',
      cta: 'Choose avatar',
      sheet: 'avatar',
    };
  } else if (formData.pronoun_tags.length === 0 && !promptDismissed('pronouns')) {
    prompt = {
      kind: 'pronouns',
      title: 'Add your pronouns',
      body: 'Optional, takes 30 seconds. You decide who sees them.',
      cta: 'Add pronouns',
      sheet: 'profile',
    };
  }
  void promptTick;

  const dismissPrompt = (kind: string) => {
    try {
      localStorage.setItem(`${PROMPT_DISMISS_KEY}.${kind}`, String(Date.now()));
    } catch {
      /* storage unavailable — prompt just stays */
    }
    setPromptTick((t) => t + 1);
  };

  const privacySummary = [
    `Profile: ${formData.privacy_settings.profile_visibility || 'public'}`,
    `Identity: ${formData.privacy_settings.identity_visibility || 'friends'}`,
    `Travel: ${formData.privacy_settings.travel_visibility || 'public'}`,
  ].join(' · ');

  const sheetTitleId: Record<Exclude<SheetKind, null>, string> = {
    profile: 'Profile',
    dating: 'Identity & dating',
    privacy: 'Privacy & visibility',
    account: 'Account',
    avatar: 'Your avatar',
  };

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
        occupation={formData.occupation}
        bio={formData.bio}
        avatarUrl={px?.avatar_url}
        avatarConfig={px?.avatar_config as AvatarConfig | null}
        email={user.email || ''}
        completion={profileCompletion}
        onEditAvatar={() => setOpenSheet('avatar')}
        onEditProfile={() => setOpenSheet('profile')}
        onEditAccount={() => setOpenSheet('account')}
      />

      {/* Prompt slot — at most one gap-driven nudge, never a wall */}
      {prompt && (
        <Card className="rounded-container border-foreground/20">
          <CardContent className="pt-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-element bg-muted flex items-center justify-center shrink-0">
              {prompt.kind === 'username' ? (
                <AtSign size={18} aria-hidden="true" />
              ) : (
                <Sparkles size={18} aria-hidden="true" />
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold">{prompt.title}</p>
              <p className="text-sm text-muted-foreground">{prompt.body}</p>
              <div className="flex gap-2 mt-4">
                <Button size="sm" className="rounded-element" onClick={() => setOpenSheet(prompt!.sheet)}>
                  {prompt.cta}
                </Button>
                {prompt.kind !== 'username' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-element"
                    onClick={() => dismissPrompt(prompt!.kind)}
                  >
                    Later
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* State-of-your-account — summaries, not inputs */}
      <div className="flex flex-col gap-2">
        <SummaryCard
          icon={User}
          title="Profile"
          summary={
            [formData.bio && 'bio', formData.location, formData.website && 'links']
              .filter(Boolean)
              .join(' · ') || 'Bio, location, links'
          }
          onOpen={() => setOpenSheet('profile')}
        />
        <SummaryCard
          icon={Heart}
          title="Identity & dating"
          summary={`Mode: ${formData.user_mode}${formData.gender_identity ? ' · identity set' : ''}`}
          onOpen={() => setOpenSheet('dating')}
        />
        <SummaryCard
          icon={Lock}
          title="Privacy & visibility"
          summary={privacySummary}
          onOpen={() => setOpenSheet('privacy')}
        />
        <SummaryCard
          icon={Settings}
          title="Account"
          summary={username ? `@${username} · email, notifications` : 'Username, email, notifications'}
          onOpen={() => setOpenSheet('account')}
        />
      </div>

      {/* Preferences — review-only mirror of in-context choices */}
      <PreferencesMirrorCard profile={profile} onUpdate={(u) => updateProfile(u as Partial<Profile>)} />

      {/* Personal documents — deprecation notice + export window */}
      <Card>
        <CardContent className="pt-6 flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-element bg-muted flex items-center justify-center shrink-0">
              <FileText size={18} aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Personal documents are going away</p>
              <p className="text-sm text-muted-foreground">
                This feature is being removed on {DOCS_REMOVAL_DATE}. Download anything you want to
                keep before then — after that date your files and their records are permanently
                deleted (they also disappear from backups within 35 days). Documents attached to
                trips are not affected.
              </p>
            </div>
          </div>
          <DocumentsList tripId={null} embedded readOnly />
        </CardContent>
      </Card>

      {/* ---------- Sheets ---------- */}
      <Sheet open={openSheet !== null} onOpenChange={(open) => !open && setOpenSheet(null)}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto px-4 pb-8 sm:px-6">
          {openSheet && (
            <SheetHeader className="text-left">
              <SheetTitle>{sheetTitleId[openSheet]}</SheetTitle>
              <SheetDescription className="sr-only">
                Edit your {sheetTitleId[openSheet].toLowerCase()} settings
              </SheetDescription>
            </SheetHeader>
          )}

          <div className="mt-4">
            {openSheet === 'profile' && (
              <BasicInfoTab
                formData={formData}
                profile={profile}
                user={user}
                onChange={handleInputChange}
                onPronounTagsChange={handlePronounTagsChange}
                onPrivacyChange={handlePrivacyChange}
              />
            )}

            {openSheet === 'dating' && (
              <div className="flex flex-col gap-6">
                <IdentityTab
                  formData={formData}
                  onChange={handleInputChange}
                  onComingOutChange={handleComingOutChange}
                />
                <IntimateTab />
              </div>
            )}

            {openSheet === 'privacy' && (
              <PrivacyTab
                formData={formData}
                hasPasskey={hasPasskey}
                onPrivacyChange={handlePrivacyChange}
              />
            )}

            {openSheet === 'account' && (
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
              </div>
            )}

            {openSheet === 'avatar' && (
              <AvatarChooser
                email={user.email || ''}
                currentUrl={px?.avatar_url}
                currentConfig={px?.avatar_config as AvatarConfig | null}
                onSave={handleAvatarSave}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Sticky auto-save status bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95">
        <div className="container mx-auto px-4 py-4 flex items-center justify-center gap-2 text-sm">
          {saveStatus === 'saving' && (
            <>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              <span className="text-muted-foreground">Saving…</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Check size={14} />
              <span className="text-muted-foreground">All changes saved</span>
            </>
          )}
          {saveStatus === 'unsaved' && (
            <Badge variant="outline" className="rounded-element">Unsaved changes</Badge>
          )}
          {saveStatus === 'error' && (
            <Badge variant="destructive" className="rounded-element">Save failed</Badge>
          )}
          {saveStatus === 'auth-error' && (
            <div className="flex items-center gap-4">
              <Badge variant="destructive" className="rounded-element">Session expired</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/auth')}
                className="rounded-element"
              >
                Sign in
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
