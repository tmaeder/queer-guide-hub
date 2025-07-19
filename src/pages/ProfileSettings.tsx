import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, Camera, Save, ArrowLeft, Loader2, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';
import UserEventsSection from '@/components/profile/UserEventsSection';
import { PasskeyButton } from '@/components/auth/PasskeyButton';

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { user, hasPasskey } = useAuth();
  const { profile, loading, updateProfile, uploadAvatar } = useProfile();
  const { toast } = useToast();
  
  const [isUpdating, setIsUpdating] = useState(false);
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
    languages: (profile as any)?.languages || [],
    interests: (profile as any)?.interests || [],
    looking_for: (profile as any)?.looking_for || [],
    accessibility_needs: (profile as any)?.accessibility_needs || '',
    emergency_contact_name: (profile as any)?.emergency_contact_name || '',
    emergency_contact_phone: (profile as any)?.emergency_contact_phone || '',
    emergency_contact_relationship: (profile as any)?.emergency_contact_relationship || '',
    
    // Physical attributes
    height_cm: (profile as any)?.height_cm || '',
    body_type: (profile as any)?.body_type || '',
    hair_color: (profile as any)?.hair_color || '',
    eye_color: (profile as any)?.eye_color || '',
    ethnicity: (profile as any)?.ethnicity || '',
    
    // Lifestyle
    smoking_preference: (profile as any)?.smoking_preference || '',
    drinking_preference: (profile as any)?.drinking_preference || '',
    diet_preferences: (profile as any)?.diet_preferences || [],
    exercise_frequency: (profile as any)?.exercise_frequency || '',
    sleep_schedule: (profile as any)?.sleep_schedule || '',
    
    // Relationship & Family
    relationship_goals: (profile as any)?.relationship_goals || [],
    has_children: (profile as any)?.has_children || false,
    wants_children: (profile as any)?.wants_children || '',
    pet_preferences: (profile as any)?.pet_preferences || '',
    has_pets: (profile as any)?.has_pets || false,
    
    // Professional
    industry: (profile as any)?.industry || '',
    company: (profile as any)?.company || '',
    job_title: (profile as any)?.job_title || '',
    work_schedule: (profile as any)?.work_schedule || '',
    income_range: (profile as any)?.income_range || '',
    
    // Interests
    hobbies: (profile as any)?.hobbies || [],
    favorite_music_genres: (profile as any)?.favorite_music_genres || [],
    favorite_books: (profile as any)?.favorite_books || [],
    favorite_movies: (profile as any)?.favorite_movies || [],
    food_preferences: (profile as any)?.food_preferences || [],
    
    // Personality & Beliefs
    personality_type: (profile as any)?.personality_type || '',
    zodiac_sign: (profile as any)?.zodiac_sign || '',
    political_views: (profile as any)?.political_views || '',
    religious_beliefs: (profile as any)?.religious_beliefs || '',
    life_philosophy: (profile as any)?.life_philosophy || '',
    
    // Health & Wellness
    mental_health_advocacy: (profile as any)?.mental_health_advocacy || false,
    therapy_friendly: (profile as any)?.therapy_friendly || false,
    medication_status: (profile as any)?.medication_status || '',
    
    // Location & Mobility
    willing_to_relocate: (profile as any)?.willing_to_relocate || false,
    transportation_method: (profile as any)?.transportation_method || '',
    neighborhood_preference: (profile as any)?.neighborhood_preference || '',
    
    // Communication
    communication_style: (profile as any)?.communication_style || '',
    response_time_preference: (profile as any)?.response_time_preference || '',
    
    // Community
    community_involvement: (profile as any)?.community_involvement || [],
    volunteer_work: (profile as any)?.volunteer_work || [],
    causes_supported: (profile as any)?.causes_supported || [],
    
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
    relationship_structure_preference: (profile as any)?.relationship_structure_preference || [],
    chosen_family_status: (profile as any)?.chosen_family_status || '',
    activism_involvement: (profile as any)?.activism_involvement || [],
    support_offering: (profile as any)?.support_offering || [],
    support_seeking: (profile as any)?.support_seeking || [],
    safe_space_preferences: (profile as any)?.safe_space_preferences || [],
    neurodivergent_status: (profile as any)?.neurodivergent_status || '',
    disability_status: (profile as any)?.disability_status || '',
    mental_health_openness: (profile as any)?.mental_health_openness || '',
    cultural_background: (profile as any)?.cultural_background || [],
    immigration_status: (profile as any)?.immigration_status || '',
    housing_situation: (profile as any)?.housing_situation || '',
    financial_situation: (profile as any)?.financial_situation || '',
    content_warnings: (profile as any)?.content_warnings || [],
    communication_preferences: (profile as any)?.communication_preferences || {
      preferred_methods: [],
      response_time: '',
      boundaries: ''
    },
    mutual_aid_interests: (profile as any)?.mutual_aid_interests || [],
    community_roles: (profile as any)?.community_roles || [],

    // Sexuality and relationships fields
    sexual_orientation_details: (profile as any)?.sexual_orientation_details || {},
    romantic_orientation: (profile as any)?.romantic_orientation || '',
    relationship_style: (profile as any)?.relationship_style || '',
    current_relationship_status: (profile as any)?.current_relationship_status || '',
    partner_preferences: (profile as any)?.partner_preferences || {},
    love_languages: (profile as any)?.love_languages || [],
    intimacy_preferences: (profile as any)?.intimacy_preferences || {},
    kink_experience_level: (profile as any)?.kink_experience_level || '',
    kink_interests: (profile as any)?.kink_interests || [],
    bdsm_role: (profile as any)?.bdsm_role || '',
    sexual_health_status: (profile as any)?.sexual_health_status || '',
    protection_preferences: (profile as any)?.protection_preferences || [],
    boundaries_and_limits: (profile as any)?.boundaries_and_limits || [],
    consent_practices: (profile as any)?.consent_practices || [],
    relationship_goals_detailed: (profile as any)?.relationship_goals_detailed || [],
    dating_preferences: (profile as any)?.dating_preferences || {},
    romance_style: (profile as any)?.romance_style || '',
    physical_affection_preference: (profile as any)?.physical_affection_preference || '',
    sexual_frequency_preference: (profile as any)?.sexual_frequency_preference || '',
    communication_about_sex: (profile as any)?.communication_about_sex || '',
    jealousy_comfort_level: (profile as any)?.jealousy_comfort_level || '',
    sexual_exploration_openness: (profile as any)?.sexual_exploration_openness || '',

    privacy_settings: {
      profile_visibility: (profile?.privacy_settings as any)?.profile_visibility || 'public',
      email_visible: (profile?.privacy_settings as any)?.email_visible || false,
      phone_visible: (profile?.privacy_settings as any)?.phone_visible || false,
    }
  });

  // Redirect if not authenticated
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

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePrivacyChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      privacy_settings: {
        ...prev.privacy_settings,
        [field]: value
      }
    }));
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

  const handleSave = async () => {
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
      languages: formData.languages,
      interests: formData.interests,
      looking_for: formData.looking_for,
      accessibility_needs: formData.accessibility_needs,
      emergency_contact_name: formData.emergency_contact_name,
      emergency_contact_phone: formData.emergency_contact_phone,
      emergency_contact_relationship: formData.emergency_contact_relationship,
      
      // Physical attributes
      height_cm: formData.height_cm ? parseInt(formData.height_cm) : null,
      body_type: formData.body_type,
      hair_color: formData.hair_color,
      eye_color: formData.eye_color,
      ethnicity: formData.ethnicity,
      
      // Lifestyle
      smoking_preference: formData.smoking_preference,
      drinking_preference: formData.drinking_preference,
      diet_preferences: formData.diet_preferences,
      exercise_frequency: formData.exercise_frequency,
      sleep_schedule: formData.sleep_schedule,
      
      // Relationship & Family
      relationship_goals: formData.relationship_goals,
      has_children: formData.has_children,
      wants_children: formData.wants_children,
      pet_preferences: formData.pet_preferences,
      has_pets: formData.has_pets,
      
      // Professional
      industry: formData.industry,
      company: formData.company,
      job_title: formData.job_title,
      work_schedule: formData.work_schedule,
      income_range: formData.income_range,
      
      // Interests
      hobbies: formData.hobbies,
      favorite_music_genres: formData.favorite_music_genres,
      favorite_books: formData.favorite_books,
      favorite_movies: formData.favorite_movies,
      food_preferences: formData.food_preferences,
      
      // Personality & Beliefs
      personality_type: formData.personality_type,
      zodiac_sign: formData.zodiac_sign,
      political_views: formData.political_views,
      religious_beliefs: formData.religious_beliefs,
      life_philosophy: formData.life_philosophy,
      
      // Health & Wellness
      mental_health_advocacy: formData.mental_health_advocacy,
      therapy_friendly: formData.therapy_friendly,
      medication_status: formData.medication_status,
      
      // Location & Mobility
      willing_to_relocate: formData.willing_to_relocate,
      transportation_method: formData.transportation_method,
      neighborhood_preference: formData.neighborhood_preference,
      
      // Communication
      communication_style: formData.communication_style,
      response_time_preference: formData.response_time_preference,
      
      // Community
      community_involvement: formData.community_involvement,
      volunteer_work: formData.volunteer_work,
      causes_supported: formData.causes_supported,
      
      // New LGBTQ+ specific fields
      chosen_name: formData.chosen_name,
      name_pronunciation: formData.name_pronunciation,
      coming_out_status: formData.coming_out_status,
      family_acceptance_level: formData.family_acceptance_level,
      workplace_safety: formData.workplace_safety,
      relationship_structure_preference: formData.relationship_structure_preference,
      chosen_family_status: formData.chosen_family_status,
      activism_involvement: formData.activism_involvement,
      support_offering: formData.support_offering,
      support_seeking: formData.support_seeking,
      safe_space_preferences: formData.safe_space_preferences,
      neurodivergent_status: formData.neurodivergent_status,
      disability_status: formData.disability_status,
      mental_health_openness: formData.mental_health_openness,
      cultural_background: formData.cultural_background,
      immigration_status: formData.immigration_status,
      housing_situation: formData.housing_situation,
      financial_situation: formData.financial_situation,
      content_warnings: formData.content_warnings,
      communication_preferences: formData.communication_preferences,
      mutual_aid_interests: formData.mutual_aid_interests,
      community_roles: formData.community_roles,
      
      // Sexuality and relationships fields
      sexual_orientation_details: formData.sexual_orientation_details,
      romantic_orientation: formData.romantic_orientation,
      relationship_style: formData.relationship_style,
      current_relationship_status: formData.current_relationship_status,
      partner_preferences: formData.partner_preferences,
      love_languages: formData.love_languages,
      intimacy_preferences: formData.intimacy_preferences,
      kink_experience_level: formData.kink_experience_level,
      kink_interests: formData.kink_interests,
      bdsm_role: formData.bdsm_role,
      sexual_health_status: formData.sexual_health_status,
      protection_preferences: formData.protection_preferences,
      boundaries_and_limits: formData.boundaries_and_limits,
      consent_practices: formData.consent_practices,
      relationship_goals_detailed: formData.relationship_goals_detailed,
      dating_preferences: formData.dating_preferences,
      romance_style: formData.romance_style,
      physical_affection_preference: formData.physical_affection_preference,
      sexual_frequency_preference: formData.sexual_frequency_preference,
      communication_about_sex: formData.communication_about_sex,
      jealousy_comfort_level: formData.jealousy_comfort_level,
      sexual_exploration_openness: formData.sexual_exploration_openness,
      
      privacy_settings: formData.privacy_settings
    };

    const { error } = await updateProfile(updates);
    
    if (error) {
      toast({
        title: "Update failed",
        description: error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    }
    
    setIsUpdating(false);
  };

  return (
    <div className="w-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Profile Settings</h1>
          <p className="text-muted-foreground">Manage your account information and privacy settings</p>
        </div>
      </div>

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
              <Label htmlFor="pronouns">Pronouns</Label>
              <Input
                id="pronouns"
                value={formData.pronouns}
                onChange={(e) => handleInputChange('pronouns', e.target.value)}
                placeholder="e.g., they/them, she/her, he/him"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <Input
                id="date_of_birth"
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
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

      {/* Identity & Demographics */}
      <Card>
        <CardHeader>
          <CardTitle>Identity & Demographics</CardTitle>
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
              <Label htmlFor="relationship_status">Relationship Status</Label>
              <Select value={formData.relationship_status} onValueChange={(value) => handleInputChange('relationship_status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="partnered">Partnered</SelectItem>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="polyamorous">Polyamorous</SelectItem>
                  <SelectItem value="its-complicated">It's Complicated</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer Not to Say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="occupation">Occupation</Label>
              <Input
                id="occupation"
                value={formData.occupation}
                onChange={(e) => handleInputChange('occupation', e.target.value)}
                placeholder="Your job or profession"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="education">Education</Label>
            <Input
              id="education"
              value={formData.education}
              onChange={(e) => handleInputChange('education', e.target.value)}
              placeholder="Your educational background"
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={formData.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
                placeholder="https://your-website.com"
              />
            </div>
          </div>

          <Alert>
            <AlertDescription>
              Email: {user.email} (managed through account settings)
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Accessibility & Emergency Contact */}
      <Card>
        <CardHeader>
          <CardTitle>Accessibility & Emergency Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accessibility_needs">Accessibility Needs</Label>
            <Textarea
              id="accessibility_needs"
              value={formData.accessibility_needs}
              onChange={(e) => handleInputChange('accessibility_needs', e.target.value)}
              placeholder="Any accessibility accommodations you need at events or venues"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emergency_contact_name">Emergency Contact Name</Label>
              <Input
                id="emergency_contact_name"
                value={formData.emergency_contact_name}
                onChange={(e) => handleInputChange('emergency_contact_name', e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergency_contact_phone">Emergency Contact Phone</Label>
              <Input
                id="emergency_contact_phone"
                type="tel"
                value={formData.emergency_contact_phone}
                onChange={(e) => handleInputChange('emergency_contact_phone', e.target.value)}
                placeholder="+1 (555) 987-6543"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergency_contact_relationship">Relationship</Label>
              <Input
                id="emergency_contact_relationship"
                value={formData.emergency_contact_relationship}
                onChange={(e) => handleInputChange('emergency_contact_relationship', e.target.value)}
                placeholder="Parent, Partner, Friend, etc."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Privacy Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile_visibility">Profile Visibility</Label>
            <Select
              value={formData.privacy_settings.profile_visibility}
              onValueChange={(value) => handlePrivacyChange('profile_visibility', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public - Anyone can view</SelectItem>
                <SelectItem value="private">Private - Only you can view</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email_visible">Show Email on Profile</Label>
                <p className="text-sm text-muted-foreground">
                  Allow others to see your email address
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
                <Label htmlFor="phone_visible">Show Phone on Profile</Label>
                <p className="text-sm text-muted-foreground">
                  Allow others to see your phone number
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
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <div className="font-medium">Passkey Authentication</div>
                <div className="text-sm text-muted-foreground">
                  {hasPasskey 
                    ? 'Passkey is set up for passwordless sign-in'
                    : 'Set up a passkey for secure, passwordless authentication using your device biometrics'
                  }
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasPasskey && (
                  <div className="text-sm text-green-600 font-medium">✓ Active</div>
                )}
                <PasskeyButton mode="enroll" variant="outline" />
              </div>
            </div>
            
            <Alert>
              <AlertDescription>
                <strong>What are passkeys?</strong> Passkeys are a modern, secure way to sign in using your device's biometrics (fingerprint, face recognition) or device PIN. They're more secure than passwords and can't be phished or stolen.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>

      {/* Physical Attributes */}
      <Card>
        <CardHeader>
          <CardTitle>Physical Attributes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="height_cm">Height (cm)</Label>
              <Input
                id="height_cm"
                type="number"
                value={formData.height_cm}
                onChange={(e) => handleInputChange('height_cm', e.target.value)}
                placeholder="170"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body_type">Body Type</Label>
              <Select value={formData.body_type} onValueChange={(value) => handleInputChange('body_type', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select body type" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="slim">Slim</SelectItem>
                  <SelectItem value="athletic">Athletic</SelectItem>
                  <SelectItem value="average">Average</SelectItem>
                  <SelectItem value="curvy">Curvy</SelectItem>
                  <SelectItem value="plus-size">Plus Size</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ethnicity">Ethnicity</Label>
              <Input
                id="ethnicity"
                value={formData.ethnicity}
                onChange={(e) => handleInputChange('ethnicity', e.target.value)}
                placeholder="Your ethnic background"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hair_color">Hair Color</Label>
              <Select value={formData.hair_color} onValueChange={(value) => handleInputChange('hair_color', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select hair color" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="black">Black</SelectItem>
                  <SelectItem value="brown">Brown</SelectItem>
                  <SelectItem value="blonde">Blonde</SelectItem>
                  <SelectItem value="red">Red</SelectItem>
                  <SelectItem value="gray">Gray</SelectItem>
                  <SelectItem value="white">White</SelectItem>
                  <SelectItem value="other">Other/Dyed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eye_color">Eye Color</Label>
              <Select value={formData.eye_color} onValueChange={(value) => handleInputChange('eye_color', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select eye color" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="brown">Brown</SelectItem>
                  <SelectItem value="blue">Blue</SelectItem>
                  <SelectItem value="green">Green</SelectItem>
                  <SelectItem value="hazel">Hazel</SelectItem>
                  <SelectItem value="gray">Gray</SelectItem>
                  <SelectItem value="amber">Amber</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lifestyle & Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Lifestyle & Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smoking_preference">Smoking</Label>
              <Select value={formData.smoking_preference} onValueChange={(value) => handleInputChange('smoking_preference', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select preference" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="non-smoker">Non-smoker</SelectItem>
                  <SelectItem value="social-smoker">Social smoker</SelectItem>
                  <SelectItem value="regular-smoker">Regular smoker</SelectItem>
                  <SelectItem value="trying-to-quit">Trying to quit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="drinking_preference">Drinking</Label>
              <Select value={formData.drinking_preference} onValueChange={(value) => handleInputChange('drinking_preference', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select preference" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="non-drinker">Non-drinker</SelectItem>
                  <SelectItem value="social-drinker">Social drinker</SelectItem>
                  <SelectItem value="regular-drinker">Regular drinker</SelectItem>
                  <SelectItem value="sober">Sober</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exercise_frequency">Exercise Frequency</Label>
              <Select value={formData.exercise_frequency} onValueChange={(value) => handleInputChange('exercise_frequency', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="How often?" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Few times a week</SelectItem>
                  <SelectItem value="occasionally">Occasionally</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Professional Information */}
      <Card>
        <CardHeader>
          <CardTitle>Professional Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={formData.industry}
                onChange={(e) => handleInputChange('industry', e.target.value)}
                placeholder="Technology, Healthcare, etc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => handleInputChange('company', e.target.value)}
                placeholder="Company name"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="job_title">Job Title</Label>
              <Input
                id="job_title"
                value={formData.job_title}
                onChange={(e) => handleInputChange('job_title', e.target.value)}
                placeholder="Your role"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="work_schedule">Work Schedule</Label>
              <Select value={formData.work_schedule} onValueChange={(value) => handleInputChange('work_schedule', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="full-time">Full-time</SelectItem>
                  <SelectItem value="part-time">Part-time</SelectItem>
                  <SelectItem value="freelance">Freelance</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                  <SelectItem value="unemployed">Unemployed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personality & Beliefs */}
      <Card>
        <CardHeader>
          <CardTitle>Personality & Beliefs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="personality_type">Personality Type</Label>
              <Input
                id="personality_type"
                value={formData.personality_type}
                onChange={(e) => handleInputChange('personality_type', e.target.value)}
                placeholder="MBTI, Enneagram, etc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zodiac_sign">Zodiac Sign</Label>
              <Select value={formData.zodiac_sign} onValueChange={(value) => handleInputChange('zodiac_sign', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sign" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="aries">Aries</SelectItem>
                  <SelectItem value="taurus">Taurus</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="cancer">Cancer</SelectItem>
                  <SelectItem value="leo">Leo</SelectItem>
                  <SelectItem value="virgo">Virgo</SelectItem>
                  <SelectItem value="libra">Libra</SelectItem>
                  <SelectItem value="scorpio">Scorpio</SelectItem>
                  <SelectItem value="sagittarius">Sagittarius</SelectItem>
                  <SelectItem value="capricorn">Capricorn</SelectItem>
                  <SelectItem value="aquarius">Aquarius</SelectItem>
                  <SelectItem value="pisces">Pisces</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="political_views">Political Views</Label>
              <Select value={formData.political_views} onValueChange={(value) => handleInputChange('political_views', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select views" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="liberal">Liberal</SelectItem>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="progressive">Progressive</SelectItem>
                  <SelectItem value="libertarian">Libertarian</SelectItem>
                  <SelectItem value="apolitical">Apolitical</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="religious_beliefs">Religious Beliefs</Label>
              <Input
                id="religious_beliefs"
                value={formData.religious_beliefs}
                onChange={(e) => handleInputChange('religious_beliefs', e.target.value)}
                placeholder="Your beliefs or faith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="life_philosophy">Life Philosophy</Label>
              <Input
                id="life_philosophy"
                value={formData.life_philosophy}
                onChange={(e) => handleInputChange('life_philosophy', e.target.value)}
                placeholder="Your approach to life"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health & Wellness */}
      <Card>
        <CardHeader>
          <CardTitle>Health & Wellness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="mental_health_advocacy">Mental Health Advocacy</Label>
                <p className="text-sm text-muted-foreground">
                  I support mental health awareness
                </p>
              </div>
              <Switch
                id="mental_health_advocacy"
                checked={formData.mental_health_advocacy}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, mental_health_advocacy: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="therapy_friendly">Therapy Friendly</Label>
                <p className="text-sm text-muted-foreground">
                  I'm open about therapy and mental health
                </p>
              </div>
              <Switch
                id="therapy_friendly"
                checked={formData.therapy_friendly}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, therapy_friendly: checked }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Location & Mobility */}
      <Card>
        <CardHeader>
          <CardTitle>Location & Mobility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transportation_method">Transportation</Label>
              <Select value={formData.transportation_method} onValueChange={(value) => handleInputChange('transportation_method', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="How do you get around?" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="car">Car</SelectItem>
                  <SelectItem value="public-transit">Public transit</SelectItem>
                  <SelectItem value="bike">Bike</SelectItem>
                  <SelectItem value="walk">Walking</SelectItem>
                  <SelectItem value="rideshare">Rideshare</SelectItem>
                  <SelectItem value="multiple">Multiple methods</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="neighborhood_preference">Neighborhood Preference</Label>
              <Input
                id="neighborhood_preference"
                value={formData.neighborhood_preference}
                onChange={(e) => handleInputChange('neighborhood_preference', e.target.value)}
                placeholder="Urban, suburban, rural, etc."
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="willing_to_relocate">Willing to Relocate</Label>
              <p className="text-sm text-muted-foreground">
                Open to moving to a new city or area
              </p>
            </div>
            <Switch
              id="willing_to_relocate"
              checked={formData.willing_to_relocate}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, willing_to_relocate: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Communication Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Communication Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="communication_style">Communication Style</Label>
              <Select value={formData.communication_style} onValueChange={(value) => handleInputChange('communication_style', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="How do you communicate?" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="thoughtful">Thoughtful</SelectItem>
                  <SelectItem value="playful">Playful</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="response_time_preference">Response Time</Label>
              <Select value={formData.response_time_preference} onValueChange={(value) => handleInputChange('response_time_preference', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Response expectations" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="immediate">Immediate</SelectItem>
                  <SelectItem value="same-day">Same day</SelectItem>
                  <SelectItem value="within-24h">Within 24 hours</SelectItem>
                  <SelectItem value="no-pressure">No pressure</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* LGBTQ+ Identity & Community */}
      <Card>
        <CardHeader>
          <CardTitle>LGBTQ+ Identity & Community</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <Label htmlFor="name_pronunciation">Name Pronunciation</Label>
              <Input
                id="name_pronunciation"
                value={formData.name_pronunciation}
                onChange={(e) => handleInputChange('name_pronunciation', e.target.value)}
                placeholder="How to pronounce your name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Coming Out Status</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="coming_out_family" className="text-sm">Family</Label>
                <Select 
                  value={formData.coming_out_status.family} 
                  onValueChange={(value) => setFormData(prev => ({
                    ...prev,
                    coming_out_status: { ...prev.coming_out_status, family: value }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completely_out">Completely out</SelectItem>
                    <SelectItem value="partially_out">Partially out</SelectItem>
                    <SelectItem value="not_out">Not out</SelectItem>
                    <SelectItem value="no_contact">No contact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coming_out_friends" className="text-sm">Friends</Label>
                <Select 
                  value={formData.coming_out_status.friends} 
                  onValueChange={(value) => setFormData(prev => ({
                    ...prev,
                    coming_out_status: { ...prev.coming_out_status, friends: value }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completely_out">Completely out</SelectItem>
                    <SelectItem value="partially_out">Partially out</SelectItem>
                    <SelectItem value="not_out">Not out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coming_out_work" className="text-sm">Work</Label>
                <Select 
                  value={formData.coming_out_status.work} 
                  onValueChange={(value) => setFormData(prev => ({
                    ...prev,
                    coming_out_status: { ...prev.coming_out_status, work: value }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completely_out">Completely out</SelectItem>
                    <SelectItem value="partially_out">Partially out</SelectItem>
                    <SelectItem value="not_out">Not out</SelectItem>
                    <SelectItem value="not_applicable">N/A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coming_out_public" className="text-sm">Public</Label>
                <Select 
                  value={formData.coming_out_status.public} 
                  onValueChange={(value) => setFormData(prev => ({
                    ...prev,
                    coming_out_status: { ...prev.coming_out_status, public: value }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completely_out">Completely out</SelectItem>
                    <SelectItem value="partially_out">Partially out</SelectItem>
                    <SelectItem value="not_out">Not out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="family_acceptance_level">Family Acceptance Level</Label>
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

          <div className="space-y-2">
            <Label htmlFor="chosen_family_status">Chosen Family Status</Label>
            <Select value={formData.chosen_family_status} onValueChange={(value) => handleInputChange('chosen_family_status', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="have_chosen_family">Have chosen family</SelectItem>
                <SelectItem value="building_chosen_family">Building chosen family</SelectItem>
                <SelectItem value="looking_for_chosen_family">Looking for chosen family</SelectItem>
                <SelectItem value="not_interested">Not interested</SelectItem>
                <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Health & Accessibility */}
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
        </CardContent>
      </Card>

      {/* Community & Support */}
      <Card>
        <CardHeader>
          <CardTitle>Community & Support</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <div className="space-y-2">
            <Label htmlFor="immigration_status">Immigration Status</Label>
            <Select value={formData.immigration_status} onValueChange={(value) => handleInputChange('immigration_status', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="citizen">Citizen</SelectItem>
                <SelectItem value="permanent_resident">Permanent resident</SelectItem>
                <SelectItem value="temporary_resident">Temporary resident</SelectItem>
                <SelectItem value="undocumented">Undocumented</SelectItem>
                <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sexuality & Romance */}
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
              <Label htmlFor="romance_style">Romance Style</Label>
              <Select value={formData.romance_style} onValueChange={(value) => handleInputChange('romance_style', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="very_romantic">Very romantic</SelectItem>
                  <SelectItem value="somewhat_romantic">Somewhat romantic</SelectItem>
                  <SelectItem value="practical">Practical</SelectItem>
                  <SelectItem value="anti_romantic">Anti-romantic</SelectItem>
                  <SelectItem value="depends_on_partner">Depends on partner</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="physical_affection_preference">Physical Affection</Label>
              <Select value={formData.physical_affection_preference} onValueChange={(value) => handleInputChange('physical_affection_preference', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="very_affectionate">Very affectionate</SelectItem>
                  <SelectItem value="moderately_affectionate">Moderately affectionate</SelectItem>
                  <SelectItem value="minimal_affection">Minimal affection</SelectItem>
                  <SelectItem value="touch_averse">Touch averse</SelectItem>
                  <SelectItem value="depends_on_relationship">Depends on relationship</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="jealousy_comfort_level">Jealousy & Sharing</Label>
              <Select value={formData.jealousy_comfort_level} onValueChange={(value) => handleInputChange('jealousy_comfort_level', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select comfort level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="very_comfortable">Very comfortable with sharing</SelectItem>
                  <SelectItem value="somewhat_comfortable">Somewhat comfortable</SelectItem>
                  <SelectItem value="gets_jealous">Gets jealous</SelectItem>
                  <SelectItem value="very_jealous">Very jealous</SelectItem>
                  <SelectItem value="depends">Depends on situation</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sexual Health & Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Sexual Health & Preferences</CardTitle>
          <p className="text-sm text-muted-foreground">Information to help find compatible partners (all optional and private)</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sexual_frequency_preference">Sexual Frequency</Label>
              <Select value={formData.sexual_frequency_preference} onValueChange={(value) => handleInputChange('sexual_frequency_preference', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multiple_times_daily">Multiple times daily</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="few_times_week">Few times a week</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="few_times_month">Few times a month</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="rarely">Rarely</SelectItem>
                  <SelectItem value="asexual">Asexual</SelectItem>
                  <SelectItem value="depends">Depends</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sexual_exploration_openness">Sexual Exploration</Label>
              <Select value={formData.sexual_exploration_openness} onValueChange={(value) => handleInputChange('sexual_exploration_openness', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select openness" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="very_open">Very open to new experiences</SelectItem>
                  <SelectItem value="somewhat_open">Somewhat open</SelectItem>
                  <SelectItem value="selective">Selective about new things</SelectItem>
                  <SelectItem value="not_interested">Not interested in exploring</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="communication_about_sex">Communication About Sex</Label>
              <Select value={formData.communication_about_sex} onValueChange={(value) => handleInputChange('communication_about_sex', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select comfort level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="very_open">Very open to discuss</SelectItem>
                  <SelectItem value="open_with_partners">Open with partners</SelectItem>
                  <SelectItem value="private">Keep it private</SelectItem>
                  <SelectItem value="uncomfortable">Uncomfortable discussing</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sexual_health_status">Sexual Health</Label>
              <Select value={formData.sexual_health_status} onValueChange={(value) => handleInputChange('sexual_health_status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recently_tested_clean">Recently tested, clean</SelectItem>
                  <SelectItem value="regularly_tested">Regularly tested</SelectItem>
                  <SelectItem value="prefer_not_to_discuss">Prefer not to discuss</SelectItem>
                  <SelectItem value="will_discuss_privately">Will discuss privately</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kink & BDSM */}
      <Card>
        <CardHeader>
          <CardTitle>Kink & BDSM</CardTitle>
          <p className="text-sm text-muted-foreground">For those interested in alternative relationship dynamics and practices</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="kink_experience_level">Kink Experience Level</Label>
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
            <div className="space-y-2">
              <Label htmlFor="bdsm_role">BDSM Role/Dynamic</Label>
              <Select value={formData.bdsm_role} onValueChange={(value) => handleInputChange('bdsm_role', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dominant">Dominant</SelectItem>
                  <SelectItem value="submissive">Submissive</SelectItem>
                  <SelectItem value="switch">Switch</SelectItem>
                  <SelectItem value="top">Top</SelectItem>
                  <SelectItem value="bottom">Bottom</SelectItem>
                  <SelectItem value="versatile">Versatile</SelectItem>
                  <SelectItem value="not_interested">Not interested</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Events */}
      <UserEventsSection />

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isUpdating}>
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