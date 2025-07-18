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
import { User, Camera, Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/hooks/use-toast';
import UserEventsSection from '@/components/profile/UserEventsSection';

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
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