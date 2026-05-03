import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent } from '@/components/ui/card';
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
import { useOptimizedProfileData } from '@/hooks/useOptimizedProfileData';
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
import { initFormData, calculateCompletion } from '@/types/profileForm';
import type { ProfileFormData, ComingOutStatus } from '@/types/profileForm';
import type { Profile } from '@/hooks/useProfile';
import { PageHeader } from '@/components/layout/PageHeader';
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
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: string | null }>;
  toast: ReturnType<typeof useToast>['toast'];
  navigate: ReturnType<typeof useLocalizedNavigate>;
  hasPasskey: boolean;
  user: SupabaseUser;
}

function ProfileSettingsLoader({ updateProfile, toast, navigate, hasPasskey, user }: LoaderProps) {
  const { profile, isLoading, isError, errors, profileLoading, profileError } =
    useOptimizedProfileData();

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
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: string | null }>;
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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');

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

      const { error } = await updateProfile({
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
        setSaveStatus('error');
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

  // Auto-save with 3s debounce
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const id = setTimeout(() => handleSave(true), 3000);
    return () => clearTimeout(id);
  }, [formData, hasUnsavedChanges, handleSave]);

  return (
    <div className="container mx-auto py-8 px-4 flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        title="Profile Settings"
        subtitle="Manage your account information and privacy settings"
        actions={
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back
          </Button>
        }
      >
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Profile Completion</p>
              <p className="text-sm text-muted-foreground">{profileCompletion}%</p>
            </div>
            <Progress value={profileCompletion} style={{ height: 8 }} />
            <p className="text-xs text-muted-foreground mt-2 block">
              Complete your profile to connect better with the community
            </p>
          </CardContent>
        </Card>
      </PageHeader>

      {/* Tabs */}
      <div className="bg-background p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} style={{ width: '100%' }}>
          <TabsList>
            <TabsTrigger value="basic">
              <span className="flex items-center gap-2"><User style={{ width: 16, height: 16 }} /> Basic</span>
            </TabsTrigger>
            <TabsTrigger value="identity">
              <span className="flex items-center gap-2"><Heart style={{ width: 16, height: 16 }} /> Identity</span>
            </TabsTrigger>
            <TabsTrigger value="travel">
              <span className="flex items-center gap-2"><Plane style={{ width: 16, height: 16 }} /> Travel</span>
            </TabsTrigger>
            <TabsTrigger value="relationships">
              <span className="flex items-center gap-2"><Users style={{ width: 16, height: 16 }} /> Relationships</span>
            </TabsTrigger>
            <TabsTrigger value="privacy">
              <span className="flex items-center gap-2"><Lock style={{ width: 16, height: 16 }} /> Privacy</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
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
        </Tabs>

        {/* Search personalization entry point */}
        <div className="mt-8 p-6 rounded-lg bg-muted">
          <p className="font-semibold mb-2">Personalize your search</p>
          <p className="text-sm mb-4 text-muted-foreground">
            Pick vibes, home city, and languages so search results learn what you like.
          </p>
          <LocalizedLink to="/onboarding/search" style={{ color: 'inherit', fontWeight: 500 }}>
            Personalize →
          </LocalizedLink>
        </div>
      </div>

      {/* Auto-save status bar */}
      <div className="bg-background p-4 flex justify-center items-center gap-2">
        {saveStatus === 'saving' && (
          <>
            <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
            <p className="text-sm text-muted-foreground">Saving...</p>
          </>
        )}
        {saveStatus === 'saved' && (
          <>
            <Check style={{ width: 14, height: 14 }} />
            <p className="text-sm text-muted-foreground">All changes saved</p>
          </>
        )}
        {saveStatus === 'unsaved' && (
          <Badge variant="outline" className="text-orange-600">Unsaved changes</Badge>
        )}
        {saveStatus === 'error' && (
          <Badge variant="destructive">Save failed — retrying...</Badge>
        )}
      </div>
    </div>
  );
}
