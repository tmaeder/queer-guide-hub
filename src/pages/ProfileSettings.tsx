import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  User,
  ArrowLeft,
  Loader2,
  Heart,
  Users,
  Lock,
  Plane,
  Check,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';
import { useProfileData } from '@/hooks/useProfileData';
import { OptimizedLoader } from '@/components/loading/OptimizedLoader';
import OptimizedErrorBoundary, {
  DataErrorFallback,
} from '@/components/error/OptimizedErrorBoundary';
import { TravelPreferencesEditor } from '@/components/profile/TravelPreferencesEditor';
import { EmailForwardingSettings } from '@/components/profile/EmailForwardingSettings';
import { PushNotificationSettings } from '@/components/profile/PushNotificationSettings';
import { DocumentsList } from '@/components/trips/DocumentsList';
import { BasicInfoTab } from '@/components/profile/settings/BasicInfoTab';
import { IdentityTab } from '@/components/profile/settings/IdentityTab';
import { RelationshipsTab } from '@/components/profile/settings/RelationshipsTab';
import { PrivacyTab } from '@/components/profile/settings/PrivacyTab';
import { IntimateTab } from '@/components/profile/IntimateTab';
import { initFormData, calculateCompletion } from '@/types/profileForm';
import type { ProfileFormData, ComingOutStatus } from '@/types/profileForm';
import type { Profile, ProfileUpdateResult } from '@/hooks/useProfile';
import { PageHeader } from '@/components/layout/PageHeader';
import { UsernameSelector } from '@/components/auth/UsernameSelector';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export default function ProfileSettings() {
  const navigate = useLocalizedNavigate();
  const { user, hasPasskey } = useAuth();
  const { updateProfile } = useProfile();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) navigate('/auth');
  }, [user, navigate]);

  if (!user) return null;

  return (
    <OptimizedErrorBoundary fallback={DataErrorFallback}>
      <ProfileSettingsLoader
        updateProfile={updateProfile}
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
  toast: ReturnType<typeof useToast>['toast'];
  navigate: ReturnType<typeof useLocalizedNavigate>;
  hasPasskey: boolean;
  user: SupabaseUser;
}

function ProfileSettingsLoader({ updateProfile, toast, navigate, hasPasskey, user }: LoaderProps) {
  const { profile, isLoading, isError, errors, profileLoading, profileError } =
    useProfileData();

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
  toast: ReturnType<typeof useToast>['toast'];
  navigate: ReturnType<typeof useLocalizedNavigate>;
  hasPasskey: boolean;
  user: SupabaseUser;
}

function ProfileSettingsContent({ profile, updateProfile, toast, navigate, hasPasskey, user }: ContentProps) {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'basic');
  const [formData, setFormData] = useState<ProfileFormData>(() => initFormData(profile));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error' | 'auth-error'>('saved');

  const profileCompletion = calculateCompletion(formData);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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

  const handleAvatarSave = async (avatarData: { avatarUrl?: string; avatarConfig?: Record<string, unknown>; avatarType?: string }) => {
    setFormData((prev) => ({
      ...prev,
      avatar_url: avatarData.avatarUrl,
      avatar_config: avatarData.avatarConfig,
      avatar_type: avatarData.avatarType,
    } as ProfileFormData));
    setHasUnsavedChanges(false);
    setSaveStatus('saved');
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
        romance_style: formData.romance_style,
        physical_affection_preference: formData.physical_affection_preference,
        sexual_frequency_preference: formData.sexual_frequency_preference,
        communication_about_sex: formData.communication_about_sex,
        sexual_exploration_openness: formData.sexual_exploration_openness,
        sexual_health_status: formData.sexual_health_status,
        kink_experience_level: formData.kink_experience_level,
        bdsm_role: formData.bdsm_role,
        jealousy_comfort_level: formData.jealousy_comfort_level,
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

  const lineTab =
    'h-10 rounded-none border-b-2 border-transparent bg-transparent px-3 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-foreground data-[state=active]:shadow-none';

  return (
    <div className="container mx-auto py-8 px-4 flex flex-col gap-6 pb-24">
      {/* Header */}
      <PageHeader
        title="Profile Settings"
        subtitle="Manage your account information and privacy settings"
        actions={
          <Button variant="outline" onClick={() => navigate(-1)} className="rounded-element">
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back
          </Button>
        }
      >
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Profile Completion</p>
            <p className="text-sm text-muted-foreground">{profileCompletion}%</p>
          </div>
          <Progress value={profileCompletion} className="h-1" />
          <p className="text-xs text-muted-foreground mt-2 block">
            Complete your profile to connect better with the community
          </p>
        </div>
      </PageHeader>

      {/* Tabs — line style */}
      <div>
        <Tabs value={activeTab} onValueChange={setActiveTab} style={{ width: '100%' }}>
          <TabsList className="h-auto gap-0 rounded-none border-0 border-b border-border bg-transparent p-0 backdrop-blur-none w-full justify-start overflow-x-auto">
            <TabsTrigger value="basic" className={lineTab}>
              <span className="flex items-center gap-2"><User style={{ width: 16, height: 16 }} /> Basic</span>
            </TabsTrigger>
            <TabsTrigger value="identity" className={lineTab}>
              <span className="flex items-center gap-2"><Heart style={{ width: 16, height: 16 }} /> Identity</span>
            </TabsTrigger>
            <TabsTrigger value="travel" className={lineTab}>
              <span className="flex items-center gap-2"><Plane style={{ width: 16, height: 16 }} /> Travel</span>
            </TabsTrigger>
            <TabsTrigger value="relationships" className={lineTab}>
              <span className="flex items-center gap-2"><Users style={{ width: 16, height: 16 }} /> Relationships</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className={lineTab}>
              <span className="flex items-center gap-2"><Lock style={{ width: 16, height: 16 }} /> Privacy</span>
            </TabsTrigger>
            <TabsTrigger value="intimate" className={lineTab}>
              <span className="flex items-center gap-2">Intimate</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <Card className="mb-6">
              <CardContent className="pt-6 flex flex-col gap-4">
                <div>
                  <p className="font-semibold">Username</p>
                  <p className="text-sm text-muted-foreground">
                    Your unique queer.guide handle.
                  </p>
                </div>
                <UsernameSelector
                  value={(profile as Profile & { username?: string | null })?.username ?? null}
                  onChange={(username) => updateProfile({ username } as Partial<Profile>)}
                />
              </CardContent>
            </Card>
            <BasicInfoTab formData={formData} profile={profile} user={user} onChange={handleInputChange} onAvatarSave={handleAvatarSave} />
          </TabsContent>

          <TabsContent value="identity">
            <IdentityTab formData={formData} onChange={handleInputChange} onComingOutChange={handleComingOutChange} />
          </TabsContent>

          <TabsContent value="travel">
            <TravelPreferencesEditor />
            <EmailForwardingSettings />
            <PushNotificationSettings />
            <div className="mt-8">
              <DocumentsList tripId={null} />
            </div>
          </TabsContent>

          <TabsContent value="relationships">
            <RelationshipsTab formData={formData} onChange={handleInputChange} />
          </TabsContent>

          <TabsContent value="privacy">
            <PrivacyTab formData={formData} hasPasskey={hasPasskey} onPrivacyChange={handlePrivacyChange} />
          </TabsContent>

          <TabsContent value="intimate">
            <IntimateTab />
          </TabsContent>
        </Tabs>

        {/* Search personalization entry point */}
        <section className="mt-10 border-t border-border pt-6">
          <p className="font-semibold mb-1">Personalize your search</p>
          <p className="text-sm mb-4 text-muted-foreground">
            Pick vibes, home city, and languages so search results learn what you like.
          </p>
          <LocalizedLink to="/onboarding/search" className="text-sm underline underline-offset-4">
            Personalize →
          </LocalizedLink>
        </section>
      </div>

      {/* Sticky auto-save status bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-center gap-2 text-sm">
          {saveStatus === 'saving' && (
            <>
              <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
              <span className="text-muted-foreground">Saving…</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Check style={{ width: 14, height: 14 }} />
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
            <div className="flex items-center gap-3">
              <Badge variant="destructive" className="rounded-element">Session expired</Badge>
              <Button variant="outline" size="sm" onClick={() => navigate('/auth')} className="rounded-element">
                Sign in
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
