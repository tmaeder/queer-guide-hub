import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AvatarDisplay } from '@/components/profile/AvatarDisplay';
import { AvatarSettings } from '@/components/profile/AvatarSettings';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  User,
  Save,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Heart,
  Users,
  Lock,
  CalendarIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';
import { useOptimizedProfileData } from '@/hooks/useOptimizedProfileData';
import { OptimizedLoader } from '@/components/loading/OptimizedLoader';
import OptimizedErrorBoundary, {
  DataErrorFallback,
} from '@/components/error/OptimizedErrorBoundary';
import { PasskeyButton } from '@/components/auth/PasskeyButton';
import { SocialLinksManager } from '@/components/profile/SocialLinksManager';
import { LocationAutocomplete } from '@/components/ui/location-autocomplete';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { PageHeader } from '@/components/layout/PageHeader';

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { user, hasPasskey } = useAuth();
  const { updateProfile, uploadAvatar } = useProfile();
  const { toast } = useToast();

  // Early returns before any state hooks
  if (!user) {
    navigate('/auth');
    return null;
  }

  return (
    <OptimizedErrorBoundary fallback={DataErrorFallback}>
      <ProfileSettingsWrapper
        updateProfile={updateProfile}
        uploadAvatar={uploadAvatar}
        toast={toast}
        navigate={navigate}
        hasPasskey={hasPasskey}
        user={user}
      />
    </OptimizedErrorBoundary>
  );
}

function ProfileSettingsWrapper({
  updateProfile,
  uploadAvatar,
  toast,
  navigate,
  hasPasskey,
  user,
}: any) {
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
      uploadAvatar={uploadAvatar}
      toast={toast}
      navigate={navigate}
      hasPasskey={hasPasskey}
      user={user}
    />
  );
}

// Separate component with all the state logic
function ProfileSettingsContent({
  profile,
  updateProfile,
  uploadAvatar,
  toast,
  navigate,
  hasPasskey,
  user,
}: any) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

  const [formData, setFormData] = useState({
    display_name: profile?.display_name || '',
    first_name: (profile as any)?.first_name || '',
    last_name: (profile as any)?.last_name || '',
    bio: profile?.bio || '',
    location: profile?.location || '',
    pronouns: profile?.pronouns || '',
    phone: profile?.phone || '',
    website: profile?.website || '',
    date_of_birth: profile?.date_of_birth || '',
    age_range: (profile as any)?.age_range || '',
    gender_identity: (profile as any)?.gender_identity || '',
    sexual_orientation: (profile as any)?.sexual_orientation || '',
    relationship_status: (profile as any)?.relationship_status || '',
    occupation: (profile as any)?.occupation || '',
    education: (profile as any)?.education || '',

    // New LGBTQ+ specific fields
    chosen_name: (profile as any)?.chosen_name || '',
    name_pronunciation: (profile as any)?.name_pronunciation || '',
    coming_out_status: (profile as any)?.coming_out_status || {
      family: 'not_out',
      friends: 'not_out',
      work: 'not_out',
      public: 'not_out',
    },
    chosen_family_status: (profile as any)?.chosen_family_status || '',

    // Sexuality and relationships fields
    romantic_orientation: (profile as any)?.romantic_orientation || '',
    relationship_style: (profile as any)?.relationship_style || '',
    current_relationship_status: (profile as any)?.current_relationship_status || '',
    romance_style: (profile as any)?.romance_style || '',
    physical_affection_preference: (profile as any)?.physical_affection_preference || '',
    sexual_frequency_preference: (profile as any)?.sexual_frequency_preference || '',
    communication_about_sex: (profile as any)?.communication_about_sex || '',
    sexual_exploration_openness: (profile as any)?.sexual_exploration_openness || '',
    sexual_health_status: (profile as any)?.sexual_health_status || '',
    kink_experience_level: (profile as any)?.kink_experience_level || '',
    bdsm_role: (profile as any)?.bdsm_role || '',
    jealousy_comfort_level: (profile as any)?.jealousy_comfort_level || '',

    privacy_settings: {
      profile_visibility: (profile?.privacy_settings as any)?.profile_visibility || 'public',
      email_visible: (profile?.privacy_settings as any)?.email_visible || false,
      phone_visible: (profile?.privacy_settings as any)?.phone_visible || false,
    },
    user_mode: (profile as any)?.user_mode || 'exploration',
  });

  // Calculate profile completion percentage
  const calculateProfileCompletion = useCallback(() => {
    const fields = [
      formData.display_name,
      formData.first_name,
      formData.last_name,
      formData.bio,
      formData.location,
      formData.pronouns,
      formData.gender_identity,
      formData.sexual_orientation,
      formData.age_range,
      formData.occupation,
      formData.education,
    ];

    let completed = 0;
    const totalFields = fields.length;

    fields.forEach((field) => {
      if (field && field.trim()) completed++;
    });

    return Math.round((completed / totalFields) * 100);
  }, [formData]);

  const profileCompletion = calculateProfileCompletion();

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setHasUnsavedChanges(true);
  };

  const handlePrivacyChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      privacy_settings: {
        ...prev.privacy_settings,
        [field]: value,
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleAvatarSave = async (avatarData: any) => {
    // Update the local form data to reflect the avatar change
    setFormData((prev) => ({
      ...prev,
      avatar_url: avatarData.avatarUrl,
      avatar_config: avatarData.avatarConfig,
      avatar_type: avatarData.avatarType,
    }));

    // No need to call handleSave here as AvatarSettings handles its own saving
    setHasUnsavedChanges(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 2MB.',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await uploadAvatar(file);
    if (error) {
      toast({
        title: 'Upload failed',
        description: error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Avatar updated',
        description: 'Your profile picture has been updated successfully.',
      });
    }
  };

  const handleSave = useCallback(
    async (silent = false) => {
      setIsUpdating(true);

      const updates = {
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
        relationship_status: formData.relationship_status,
        occupation: formData.occupation,
        education: formData.education,

        // New LGBTQ+ specific fields
        chosen_name: formData.chosen_name,
        name_pronunciation: formData.name_pronunciation,
        coming_out_status: formData.coming_out_status,
        chosen_family_status: formData.chosen_family_status,

        // Sexuality and relationships fields
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
      };

      const { error } = await updateProfile(updates);

      if (error) {
        if (!silent) {
          toast({
            title: 'Update failed',
            description: error,
            variant: 'destructive',
          });
        }
      } else {
        setHasUnsavedChanges(false);
        if (!silent) {
          toast({
            title: 'Profile updated',
            description: 'Your profile has been updated successfully.',
          });
        }
      }

      setIsUpdating(false);
    },
    [formData, updateProfile, toast],
  );

  // Auto-save functionality
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const timeoutId = setTimeout(() => {
      handleSave(true); // Silent save
    }, 3000); // Save after 3 seconds of inactivity

    return () => clearTimeout(timeoutId);
  }, [formData, hasUnsavedChanges, handleSave]);

  return (
    <Container maxWidth="lg" sx={{ py: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header with Progress */}
      <PageHeader
        title="Profile Settings"
        subtitle="Manage your account information and privacy settings"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
              Back
            </Button>
            {hasUnsavedChanges && (
              <Alert style={{ width: 'auto' }}>
                <AlertCircle style={{ width: 16, height: 16 }} />
                <AlertDescription>You have unsaved changes</AlertDescription>
              </Alert>
            )}
          </>
        }
      >
        {/* Profile Completion Progress */}
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
            >
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Profile Completion
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {profileCompletion}%
              </Typography>
            </Box>
            <Progress value={profileCompletion} style={{ height: 8 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Complete your profile to connect better with the community
            </Typography>
          </CardContent>
        </Card>
      </PageHeader>

      {/* Tabbed Interface */}
      <Paper elevation={0} sx={{ bgcolor: 'background.paper', borderRadius: 2, p: 3 }}>
        <Tabs value={activeTab} onValueChange={setActiveTab} style={{ width: '100%' }}>
          <TabsList
            style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}
          >
            <TabsTrigger value="basic">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <User style={{ width: 16, height: 16 }} />
                Basic
              </Box>
            </TabsTrigger>
            <TabsTrigger value="identity">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Heart style={{ width: 16, height: 16 }} />
                Identity
              </Box>
            </TabsTrigger>
            <TabsTrigger value="relationships">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Users style={{ width: 16, height: 16 }} />
                Relationships
              </Box>
            </TabsTrigger>
            <TabsTrigger value="privacy">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Lock style={{ width: 16, height: 16 }} />
                Privacy
              </Box>
            </TabsTrigger>
          </TabsList>

          {/* Basic Information Tab */}
          <TabsContent value="basic">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Profile Picture */}
              <Card>
                <CardHeader>
                  <CardTitle>Profile Avatar</CardTitle>
                  <Typography variant="body2" color="text.secondary">
                    Choose how you want to appear to other users. Upload your own photo, use our
                    avatar builder, or connect your Gravatar account.
                  </Typography>
                </CardHeader>
                <CardContent>
                  <AvatarSettings
                    initialData={{
                      avatarUrl: profile?.avatar_url,
                      avatarConfig: profile?.avatar_config,
                      avatarType: profile?.avatar_type as
                        | 'upload'
                        | 'builder'
                        | 'gravatar'
                        | undefined,
                      email: user?.email || '',
                    }}
                    onSave={handleAvatarSave}
                  />
                </CardContent>
              </Card>

              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="first_name">First Name</Label>
                        <Input
                          id="first_name"
                          value={formData.first_name}
                          onChange={(e) => handleInputChange('first_name', e.target.value)}
                          placeholder="Your first name"
                        />
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="last_name">Last Name</Label>
                        <Input
                          id="last_name"
                          value={formData.last_name}
                          onChange={(e) => handleInputChange('last_name', e.target.value)}
                          placeholder="Your last name"
                        />
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="display_name">Display Name</Label>
                        <Input
                          id="display_name"
                          value={formData.display_name}
                          onChange={(e) => handleInputChange('display_name', e.target.value)}
                          placeholder="How you'd like to be called"
                        />
                      </Box>
                    </Box>

                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="chosen_name">Chosen Name</Label>
                        <Input
                          id="chosen_name"
                          value={formData.chosen_name}
                          onChange={(e) => handleInputChange('chosen_name', e.target.value)}
                          placeholder="Name you'd like to be called"
                        />
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="pronouns">Pronouns</Label>
                        <Input
                          id="pronouns"
                          value={formData.pronouns || ''}
                          onChange={(e) => handleInputChange('pronouns', e.target.value)}
                          placeholder="e.g., they/them, she/her, he/him"
                          style={{ pointerEvents: 'auto' }}
                          tabIndex={0}
                        />
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Label htmlFor="bio">Bio</Label>
                      <Textarea
                        id="bio"
                        value={formData.bio}
                        onChange={(e) => handleInputChange('bio', e.target.value)}
                        placeholder="Tell us about yourself..."
                        rows={3}
                      />
                    </Box>

                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                          position: 'relative',
                        }}
                      >
                        <Label htmlFor="location">Location</Label>
                        <LocationAutocomplete
                          value={formData.location}
                          onChange={(value) => handleInputChange('location', value)}
                          placeholder="Search for your city, country"
                        />
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="date_of_birth">Date of Birth</Label>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Input
                              id="date_of_birth"
                              type="date"
                              value={formData.date_of_birth || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value) {
                                  const selectedDate = new Date(value);
                                  const today = new Date();
                                  const eighteenYearsAgo = new Date(
                                    today.getFullYear() - 18,
                                    today.getMonth(),
                                    today.getDate(),
                                  );

                                  if (
                                    selectedDate <= eighteenYearsAgo &&
                                    selectedDate >= new Date('1900-01-01')
                                  ) {
                                    handleInputChange('date_of_birth', value);
                                  }
                                } else {
                                  handleInputChange('date_of_birth', '');
                                }
                              }}
                              max={(() => {
                                const today = new Date();
                                const eighteenYearsAgo = new Date(
                                  today.getFullYear() - 18,
                                  today.getMonth(),
                                  today.getDate(),
                                );
                                return eighteenYearsAgo.toISOString().split('T')[0];
                              })()}
                              min="1900-01-01"
                              style={{ flex: 1 }}
                              placeholder="YYYY-MM-DD"
                            />
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  style={{ height: 40, width: 40, flexShrink: 0 }}
                                  type="button"
                                >
                                  <CalendarIcon style={{ width: 16, height: 16 }} />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent style={{ width: 'auto', padding: 0 }} align="start">
                                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                    Select Date of Birth
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    You must be at least 18 years old
                                  </Typography>
                                </Box>
                                <Calendar
                                  mode="single"
                                  selected={
                                    formData.date_of_birth
                                      ? new Date(formData.date_of_birth)
                                      : undefined
                                  }
                                  onSelect={(date) =>
                                    handleInputChange(
                                      'date_of_birth',
                                      date ? date.toISOString().split('T')[0] : '',
                                    )
                                  }
                                  disabled={(date) => {
                                    const today = new Date();
                                    const eighteenYearsAgo = new Date(
                                      today.getFullYear() - 18,
                                      today.getMonth(),
                                      today.getDate(),
                                    );
                                    return date > eighteenYearsAgo || date < new Date('1900-01-01');
                                  }}
                                  initialFocus
                                  style={{ padding: 12, pointerEvents: 'auto' }}
                                  defaultMonth={new Date(2000, 0)}
                                />
                                {formData.date_of_birth && (
                                  <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleInputChange('date_of_birth', '')}
                                      style={{ width: '100%' }}
                                    >
                                      <Typography variant="body2" color="text.secondary">
                                        Clear date
                                      </Typography>
                                    </Button>
                                  </Box>
                                )}
                              </PopoverContent>
                            </Popover>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            Type directly or use the calendar. You must be at least 18 years old.
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              {/* Social Media Links */}
              <SocialLinksManager
                initialSocialLinks={profile?.social_links || {}}
                onUpdate={(socialLinks) => {
                  // Update the profile context if needed
                  console.log('Social links updated:', socialLinks);
                }}
              />
            </Box>
          </TabsContent>

          {/* Identity Tab */}
          <TabsContent value="identity">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Card>
                <CardHeader>
                  <CardTitle>LGBTQ+ Identity</CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="gender_identity">Gender Identity</Label>
                        <Select
                          value={formData.gender_identity}
                          onValueChange={(value) => handleInputChange('gender_identity', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select your gender identity" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="woman">Woman</SelectItem>
                            <SelectItem value="man">Man</SelectItem>
                            <SelectItem value="non_binary">Non-binary</SelectItem>
                            <SelectItem value="genderfluid">Genderfluid</SelectItem>
                            <SelectItem value="agender">Agender</SelectItem>
                            <SelectItem value="bigender">Bigender</SelectItem>
                            <SelectItem value="genderqueer">Genderqueer</SelectItem>
                            <SelectItem value="demigender">Demigender</SelectItem>
                            <SelectItem value="transgender_woman">Transgender woman</SelectItem>
                            <SelectItem value="transgender_man">Transgender man</SelectItem>
                            <SelectItem value="questioning">Questioning</SelectItem>
                            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="sexual_orientation">Sexual Orientation</Label>
                        <Select
                          value={formData.sexual_orientation}
                          onValueChange={(value) => handleInputChange('sexual_orientation', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select your orientation" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="straight">Straight</SelectItem>
                            <SelectItem value="gay">Gay</SelectItem>
                            <SelectItem value="lesbian">Lesbian</SelectItem>
                            <SelectItem value="bisexual">Bisexual</SelectItem>
                            <SelectItem value="pansexual">Pansexual</SelectItem>
                            <SelectItem value="asexual">Asexual</SelectItem>
                            <SelectItem value="demisexual">Demisexual</SelectItem>
                            <SelectItem value="queer">Queer</SelectItem>
                            <SelectItem value="questioning">Questioning</SelectItem>
                            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </TabsContent>

          {/* Relationships Tab */}
          <TabsContent value="relationships">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Sexuality & Romance</CardTitle>
                  <Typography variant="body2" color="text.secondary">
                    Share what you're comfortable with about your romantic and sexual preferences
                  </Typography>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="romantic_orientation">Romantic Orientation</Label>
                        <Input
                          id="romantic_orientation"
                          value={formData.romantic_orientation}
                          onChange={(e) =>
                            handleInputChange('romantic_orientation', e.target.value)
                          }
                          placeholder="e.g., panromantic, biromantic, aromantic"
                        />
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="current_relationship_status">Current Status</Label>
                        <Select
                          value={formData.current_relationship_status}
                          onValueChange={(value) =>
                            handleInputChange('current_relationship_status', value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="single">Single</SelectItem>
                            <SelectItem value="taken">Taken</SelectItem>
                            <SelectItem value="its_complicated">It's complicated</SelectItem>
                            <SelectItem value="open_to_explore">Open to explore</SelectItem>
                            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                          </SelectContent>
                        </Select>
                      </Box>
                    </Box>

                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="relationship_style">Relationship Style</Label>
                        <Select
                          value={formData.relationship_style}
                          onValueChange={(value) => handleInputChange('relationship_style', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select style" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monogamous">Monogamous</SelectItem>
                            <SelectItem value="polyamorous">Polyamorous</SelectItem>
                            <SelectItem value="relationship_anarchist">
                              Relationship anarchist
                            </SelectItem>
                            <SelectItem value="open_relationship">Open relationship</SelectItem>
                            <SelectItem value="swinging">Swinging</SelectItem>
                            <SelectItem value="exploring">Exploring</SelectItem>
                            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                          </SelectContent>
                        </Select>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Label htmlFor="kink_experience_level">Kink Experience</Label>
                        <Select
                          value={formData.kink_experience_level}
                          onValueChange={(value) =>
                            handleInputChange('kink_experience_level', value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select experience level" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No experience</SelectItem>
                            <SelectItem value="curious">Curious</SelectItem>
                            <SelectItem value="beginner">Beginner</SelectItem>
                            <SelectItem value="intermediate">Intermediate</SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                            <SelectItem value="expert">Expert</SelectItem>
                            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                          </SelectContent>
                        </Select>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </TabsContent>

          {/* Privacy Tab */}
          <TabsContent value="privacy">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Privacy Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Box>
                          <Label htmlFor="profile_visibility">
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              Profile Visibility
                            </Typography>
                          </Label>
                          <Typography variant="caption" color="text.secondary">
                            Who can see your profile
                          </Typography>
                        </Box>
                        <Select
                          value={formData.privacy_settings.profile_visibility}
                          onValueChange={(value) =>
                            handlePrivacyChange('profile_visibility', value)
                          }
                        >
                          <SelectTrigger style={{ width: 128 }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="public">Public</SelectItem>
                            <SelectItem value="friends">Friends</SelectItem>
                            <SelectItem value="private">Private</SelectItem>
                          </SelectContent>
                        </Select>
                      </Box>

                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Box>
                          <Label htmlFor="email_visible">
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              Show Email
                            </Typography>
                          </Label>
                          <Typography variant="caption" color="text.secondary">
                            Display your email on your profile
                          </Typography>
                        </Box>
                        <Switch
                          id="email_visible"
                          checked={formData.privacy_settings.email_visible}
                          onCheckedChange={(checked) =>
                            handlePrivacyChange('email_visible', checked)
                          }
                        />
                      </Box>

                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Box>
                          <Label htmlFor="phone_visible">
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              Show Phone
                            </Typography>
                          </Label>
                          <Typography variant="caption" color="text.secondary">
                            Display your phone number on your profile
                          </Typography>
                        </Box>
                        <Switch
                          id="phone_visible"
                          checked={formData.privacy_settings.phone_visible}
                          onCheckedChange={(checked) =>
                            handlePrivacyChange('phone_visible', checked)
                          }
                        />
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              {/* Security Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Security Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Box>
                        <Label>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            Passkey Authentication
                          </Typography>
                        </Label>
                        <Typography variant="caption" color="text.secondary">
                          {hasPasskey
                            ? 'Passkey is enabled for secure login'
                            : 'Add a passkey for enhanced security'}
                        </Typography>
                      </Box>
                      <PasskeyButton mode="enroll" />
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </TabsContent>
        </Tabs>
      </Paper>

      {/* Save Button */}
      <Paper elevation={0} sx={{ bgcolor: 'background.paper', borderRadius: 2, p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasUnsavedChanges && (
              <Badge variant="outline" className="text-orange-600">
                <AlertCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                Unsaved changes
              </Badge>
            )}
            <Typography variant="body2" color="text.secondary">
              Changes are automatically saved
            </Typography>
          </Box>
          <Button onClick={() => handleSave()} disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2
                  style={{
                    width: 16,
                    height: 16,
                    marginRight: 8,
                    animation: 'spin 1s linear infinite',
                  }}
                />
                Saving...
              </>
            ) : (
              <>
                <Save style={{ width: 16, height: 16, marginRight: 8 }} />
                Save Changes
              </>
            )}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}
