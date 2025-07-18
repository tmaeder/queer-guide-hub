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