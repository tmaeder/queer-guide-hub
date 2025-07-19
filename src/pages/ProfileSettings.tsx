import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { User, Camera, Save, ArrowLeft, Loader2, CheckCircle, AlertCircle, Heart, Users, Lock, Globe, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';
import { PasskeyButton } from '@/components/auth/PasskeyButton';
import { SocialLinksManager } from '@/components/profile/SocialLinksManager';

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { user, hasPasskey } = useAuth();
  const { profile, loading, updateProfile, uploadAvatar } = useProfile();
  const { toast } = useToast();

  // Early returns before any state hooks
  if (!user) {
    navigate('/auth');
    return null;
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return <ProfileSettingsContent profile={profile} updateProfile={updateProfile} uploadAvatar={uploadAvatar} toast={toast} navigate={navigate} hasPasskey={hasPasskey} />;
}

// Separate component with all the state logic
function ProfileSettingsContent({ profile, updateProfile, uploadAvatar, toast, navigate, hasPasskey }: any) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  
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
      public: 'not_out'
    },
    family_acceptance_level: (profile as any)?.family_acceptance_level || '',
    workplace_safety: (profile as any)?.workplace_safety || '',
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
    
    // Health & Accessibility
    neurodivergent_status: (profile as any)?.neurodivergent_status || '',
    disability_status: (profile as any)?.disability_status || '',
    mental_health_openness: (profile as any)?.mental_health_openness || '',
    housing_situation: (profile as any)?.housing_situation || '',
    financial_situation: (profile as any)?.financial_situation || '',
    immigration_status: (profile as any)?.immigration_status || '',
    
    privacy_settings: {
      profile_visibility: (profile?.privacy_settings as any)?.profile_visibility || 'public',
      email_visible: (profile?.privacy_settings as any)?.email_visible || false,
      phone_visible: (profile?.privacy_settings as any)?.phone_visible || false,
    }
  });

  // Calculate profile completion percentage
  const calculateProfileCompletion = useCallback(() => {
    const fields = [
      formData.display_name, formData.first_name, formData.last_name, formData.bio,
      formData.location, formData.pronouns, formData.gender_identity, formData.sexual_orientation,
      formData.age_range, formData.occupation, formData.education
    ];
    
    let completed = 0;
    const totalFields = fields.length;
    
    fields.forEach(field => {
      if (field && field.trim()) completed++;
    });
    
    return Math.round((completed / totalFields) * 100);
  }, [formData]);

  const profileCompletion = calculateProfileCompletion();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setHasUnsavedChanges(true);
  };

  const handlePrivacyChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      privacy_settings: {
        ...prev.privacy_settings,
        [field]: value
      }
    }));
    setHasUnsavedChanges(true);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 2MB.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await uploadAvatar(file);
    if (error) {
      toast({
        title: "Upload failed",
        description: error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Avatar updated",
        description: "Your profile picture has been updated successfully.",
      });
    }
  };

  const handleSave = useCallback(async (silent = false) => {
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
      family_acceptance_level: formData.family_acceptance_level,
      workplace_safety: formData.workplace_safety,
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
      
      // Health & Accessibility
      neurodivergent_status: formData.neurodivergent_status,
      disability_status: formData.disability_status,
      mental_health_openness: formData.mental_health_openness,
      housing_situation: formData.housing_situation,
      financial_situation: formData.financial_situation,
      immigration_status: formData.immigration_status,
      
      privacy_settings: formData.privacy_settings
    };

    const { error } = await updateProfile(updates);
    
    if (error) {
      if (!silent) {
        toast({
          title: "Update failed",
          description: error,
          variant: "destructive",
        });
      }
    } else {
      setHasUnsavedChanges(false);
      if (!silent) {
        toast({
          title: "Profile updated",
          description: "Your profile has been updated successfully.",
        });
      }
    }
    
    setIsUpdating(false);
  }, [formData, updateProfile, toast]);

  // Auto-save functionality
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const timeoutId = setTimeout(() => {
      handleSave(true); // Silent save
    }, 3000); // Save after 3 seconds of inactivity

    return () => clearTimeout(timeoutId);
  }, [formData, hasUnsavedChanges, handleSave]);


  return (
    <div className="w-full p-6 space-y-6">
      {/* Header with Progress */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Profile Settings</h1>
            <p className="text-muted-foreground">Manage your account information and privacy settings</p>
          </div>
          {hasUnsavedChanges && (
            <Alert className="w-auto">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>You have unsaved changes</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Profile Completion Progress */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Profile Completion</span>
              <span className="text-sm text-muted-foreground">{profileCompletion}%</span>
            </div>
            <Progress value={profileCompletion} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Complete your profile to connect better with the community
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="basic" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Basic
          </TabsTrigger>
          <TabsTrigger value="identity" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Identity
          </TabsTrigger>
          <TabsTrigger value="relationships" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Relationships
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Health & Safety
          </TabsTrigger>
          <TabsTrigger value="privacy" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Privacy
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-6">
          {/* Profile Picture */}
          <Card>
            <CardHeader>
              <CardTitle>Profile Picture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback>
                    <User className="h-10 w-10" />
                  </AvatarFallback>
                </Avatar>
                
                <div className="space-y-2">
                  <Label htmlFor="avatar-upload" className="cursor-pointer">
                    <Button variant="outline" className="cursor-pointer">
                      <Camera className="h-4 w-4 mr-2" />
                      Change Picture
                    </Button>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Recommended: Square image, at least 400×400px, max 2MB
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => handleInputChange('first_name', e.target.value)}
                    placeholder="Your first name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => handleInputChange('last_name', e.target.value)}
                    placeholder="Your last name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display_name">Display Name</Label>
                  <Input
                    id="display_name"
                    value={formData.display_name}
                    onChange={(e) => handleInputChange('display_name', e.target.value)}
                    placeholder="How you'd like to be called"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="chosen_name">Chosen Name</Label>
                  <Input
                    id="chosen_name"
                    value={formData.chosen_name}
                    onChange={(e) => handleInputChange('chosen_name', e.target.value)}
                    placeholder="Name you'd like to be called"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pronouns">Pronouns</Label>
                  <Input
                    id="pronouns"
                    value={formData.pronouns}
                    onChange={(e) => handleInputChange('pronouns', e.target.value)}
                    placeholder="e.g., they/them, she/her, he/him"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  placeholder="Tell us about yourself..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    placeholder="City, Country"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age_range">Age Range</Label>
                  <Select value={formData.age_range} onValueChange={(value) => handleInputChange('age_range', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select age range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="18-24">18-24</SelectItem>
                      <SelectItem value="25-34">25-34</SelectItem>
                      <SelectItem value="35-44">35-44</SelectItem>
                      <SelectItem value="45-54">45-54</SelectItem>
                      <SelectItem value="55-64">55-64</SelectItem>
                      <SelectItem value="65+">65+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
        </TabsContent>

        {/* Identity Tab */}
        <TabsContent value="identity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>LGBTQ+ Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gender_identity">Gender Identity</Label>
                  <Input
                    id="gender_identity"
                    value={formData.gender_identity}
                    onChange={(e) => handleInputChange('gender_identity', e.target.value)}
                    placeholder="How you identify"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sexual_orientation">Sexual Orientation</Label>
                  <Input
                    id="sexual_orientation"
                    value={formData.sexual_orientation}
                    onChange={(e) => handleInputChange('sexual_orientation', e.target.value)}
                    placeholder="Your orientation"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="family_acceptance_level">Family Acceptance</Label>
                  <Select value={formData.family_acceptance_level} onValueChange={(value) => handleInputChange('family_acceptance_level', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="very_supportive">Very supportive</SelectItem>
                      <SelectItem value="supportive">Supportive</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                      <SelectItem value="unsupportive">Unsupportive</SelectItem>
                      <SelectItem value="very_unsupportive">Very unsupportive</SelectItem>
                      <SelectItem value="no_contact">No contact</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workplace_safety">Workplace Safety</Label>
                  <Select value={formData.workplace_safety} onValueChange={(value) => handleInputChange('workplace_safety', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select safety level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completely_out">Completely out & safe</SelectItem>
                      <SelectItem value="partially_out">Partially out</SelectItem>
                      <SelectItem value="not_out">Not out</SelectItem>
                      <SelectItem value="unsafe_to_be_out">Unsafe to be out</SelectItem>
                      <SelectItem value="not_applicable">Not applicable</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Relationships Tab */}
        <TabsContent value="relationships" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sexuality & Romance</CardTitle>
              <p className="text-sm text-muted-foreground">Share what you're comfortable with about your romantic and sexual preferences</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="romantic_orientation">Romantic Orientation</Label>
                  <Input
                    id="romantic_orientation"
                    value={formData.romantic_orientation}
                    onChange={(e) => handleInputChange('romantic_orientation', e.target.value)}
                    placeholder="e.g., panromantic, biromantic, aromantic"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="current_relationship_status">Current Status</Label>
                  <Select value={formData.current_relationship_status} onValueChange={(value) => handleInputChange('current_relationship_status', value)}>
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
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="relationship_style">Relationship Style</Label>
                  <Select value={formData.relationship_style} onValueChange={(value) => handleInputChange('relationship_style', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monogamous">Monogamous</SelectItem>
                      <SelectItem value="polyamorous">Polyamorous</SelectItem>
                      <SelectItem value="relationship_anarchist">Relationship anarchist</SelectItem>
                      <SelectItem value="open_relationship">Open relationship</SelectItem>
                      <SelectItem value="swinging">Swinging</SelectItem>
                      <SelectItem value="exploring">Exploring</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kink_experience_level">Kink Experience</Label>
                  <Select value={formData.kink_experience_level} onValueChange={(value) => handleInputChange('kink_experience_level', value)}>
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
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health & Safety Tab */}
        <TabsContent value="health" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Health & Accessibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="neurodivergent_status">Neurodivergent Status</Label>
                  <Select value={formData.neurodivergent_status} onValueChange={(value) => handleInputChange('neurodivergent_status', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="self_diagnosed">Self-diagnosed</SelectItem>
                      <SelectItem value="questioning">Questioning</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="disability_status">Disability Status</Label>
                  <Select value={formData.disability_status} onValueChange={(value) => handleInputChange('disability_status', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mental_health_openness">Mental Health Openness</Label>
                  <Select value={formData.mental_health_openness} onValueChange={(value) => handleInputChange('mental_health_openness', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="very_open">Very open</SelectItem>
                      <SelectItem value="somewhat_open">Somewhat open</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="prefer_not_to_discuss">Prefer not to discuss</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="housing_situation">Housing Situation</Label>
                  <Select value={formData.housing_situation} onValueChange={(value) => handleInputChange('housing_situation', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select situation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stable_housing">Stable housing</SelectItem>
                      <SelectItem value="temporary_housing">Temporary housing</SelectItem>
                      <SelectItem value="looking_for_housing">Looking for housing</SelectItem>
                      <SelectItem value="housing_insecure">Housing insecure</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="financial_situation">Financial Situation</Label>
                  <Select value={formData.financial_situation} onValueChange={(value) => handleInputChange('financial_situation', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select situation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="financially_stable">Financially stable</SelectItem>
                      <SelectItem value="getting_by">Getting by</SelectItem>
                      <SelectItem value="struggling">Struggling</SelectItem>
                      <SelectItem value="in_crisis">In crisis</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Privacy Tab */}
        <TabsContent value="privacy" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Privacy Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="profile_visibility" className="text-sm font-medium">
                      Profile Visibility
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Who can see your profile
                    </p>
                  </div>
                  <Select 
                    value={formData.privacy_settings.profile_visibility} 
                    onValueChange={(value) => handlePrivacyChange('profile_visibility', value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="friends">Friends</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="email_visible" className="text-sm font-medium">
                      Show Email
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Display your email on your profile
                    </p>
                  </div>
                  <Switch
                    id="email_visible"
                    checked={formData.privacy_settings.email_visible}
                    onCheckedChange={(checked) => handlePrivacyChange('email_visible', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="phone_visible" className="text-sm font-medium">
                      Show Phone
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Display your phone number on your profile
                    </p>
                  </div>
                  <Switch
                    id="phone_visible"
                    checked={formData.privacy_settings.phone_visible}
                    onCheckedChange={(checked) => handlePrivacyChange('phone_visible', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Passkey Authentication</Label>
                  <p className="text-xs text-muted-foreground">
                    {hasPasskey 
                      ? "Passkey is enabled for secure login" 
                      : "Add a passkey for enhanced security"
                    }
                  </p>
                </div>
                <PasskeyButton mode="enroll" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Badge variant="outline" className="text-orange-600">
              <AlertCircle className="h-3 w-3 mr-1" />
              Unsaved changes
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            Changes are automatically saved
          </span>
        </div>
        <Button onClick={() => handleSave()} disabled={isUpdating}>
          {isUpdating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}