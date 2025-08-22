import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Palette, User, RefreshCw, Mail } from 'lucide-react';
import { AvatarDisplay } from '@/components/profile/AvatarDisplay';
import { AvatarBuilder, generateRandomConfig } from '@/components/profile/AvatarBuilder';
import { hasGravatar, getGravatarUrl } from '@/lib/gravatar';
import type { SignupData } from '../MultiStepSignup';

interface AccountSetupStepProps {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
}

export default function AccountSetupStep({ data, updateData }: AccountSetupStepProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [gravatarExists, setGravatarExists] = useState<boolean>(false);
  const [checkingGravatar, setCheckingGravatar] = useState<boolean>(false);

  // Check if Gravatar exists for the email
  useEffect(() => {
    if (data.email) {
      setCheckingGravatar(true);
      hasGravatar(data.email).then(exists => {
        setGravatarExists(exists);
        setCheckingGravatar(false);
      });
    }
  }, [data.email]);

  // Generate random avatar if none exists
  if (!data.avatarConfig && !data.avatarUrl && !data.avatarType) {
    updateData({ 
      avatarConfig: generateRandomConfig(),
      avatarType: 'builder'
    });
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Create preview URL for immediate display
      const previewUrl = URL.createObjectURL(file);
      updateData({ 
        avatarUrl: previewUrl,
        avatarConfig: undefined,
        avatarType: 'upload'
      });
    }
  };

  const handleSaveAvatar = (avatarConfig: any) => {
    updateData({ 
      avatarConfig,
      avatarUrl: undefined,
      avatarType: 'builder'
    });
  };

  const generateRandomAvatar = () => {
    const randomConfig = generateRandomConfig();
    updateData({ 
      avatarConfig: randomConfig,
      avatarUrl: undefined,
      avatarType: 'builder'
    });
  };

  const useGravatar = () => {
    updateData({ 
      avatarUrl: undefined,
      avatarConfig: undefined,
      avatarType: 'gravatar'
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Finish setting up your account</h3>
        <p className="text-sm text-muted-foreground">
          Add some final touches to your profile
        </p>
      </div>

      {/* Avatar Section */}
      <div className="space-y-4">
        <div className="text-center">
          <Label className="text-base font-medium">Profile Avatar</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Choose an avatar or upload your own photo
          </p>
        </div>
        
        <div className="flex justify-center mb-4">
          <AvatarDisplay 
            avatarUrl={data.avatarUrl} 
            avatarConfig={data.avatarConfig}
            email={data.email}
            size="lg"
          />
        </div>

        <Tabs defaultValue={data.avatarType || "builder"} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="builder">
              <Palette className="h-4 w-4 mr-2" />
              Build
            </TabsTrigger>
            <TabsTrigger value="gravatar" disabled={!gravatarExists && !checkingGravatar}>
              <Mail className="h-4 w-4 mr-2" />
              Gravatar
            </TabsTrigger>
            <TabsTrigger value="random">
              <User className="h-4 w-4 mr-2" />
              Random
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4">
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-medium mb-1">Upload Your Photo</p>
                <p className="text-xs text-muted-foreground">
                  Use your own image as your profile picture
                </p>
              </div>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                    <p className="mb-1 text-sm text-muted-foreground">
                      <span className="font-semibold">Click to upload</span>
                    </p>
                    <p className="text-xs text-muted-foreground">PNG, JPG up to 5MB</p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileSelect}
                  />
                </label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="builder" className="mt-4">
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-medium mb-1">Avatar Builder</p>
                <p className="text-xs text-muted-foreground">
                  Create a custom avatar with our builder
                </p>
              </div>
              <AvatarBuilder 
                onSave={handleSaveAvatar}
                initialConfig={data.avatarConfig}
              />
            </div>
          </TabsContent>

          <TabsContent value="gravatar" className="mt-4">
            <div className="space-y-4 text-center">
              <div>
                <p className="text-sm font-medium mb-1">Gravatar</p>
                <p className="text-xs text-muted-foreground">
                  Use your globally recognized avatar from Gravatar.com
                </p>
              </div>
              
              {checkingGravatar ? (
                <div className="py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Checking for Gravatar...</p>
                </div>
              ) : gravatarExists ? (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <img 
                      src={getGravatarUrl(data.email, 64) || ''} 
                      alt="Gravatar preview" 
                      className="w-16 h-16 rounded-full"
                    />
                  </div>
                  <Button 
                    onClick={useGravatar}
                    size="lg"
                    className="w-full"
                    variant={data.avatarType === 'gravatar' ? 'default' : 'outline'}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {data.avatarType === 'gravatar' ? 'Using Gravatar' : 'Use This Gravatar'}
                  </Button>
                </div>
              ) : (
                <div className="py-4 space-y-3">
                  <div className="text-center">
                    <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-2">
                      No Gravatar found for <strong>{data.email}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Create one at{' '}
                      <a 
                        href="https://gravatar.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        gravatar.com
                      </a>{' '}
                      to use this option
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="random" className="mt-4">
            <div className="space-y-4 text-center">
              <div>
                <p className="text-sm font-medium mb-1">Random Avatar</p>
                <p className="text-xs text-muted-foreground">
                  Generate a random avatar instantly
                </p>
              </div>
              <Button 
                onClick={generateRandomAvatar}
                size="lg"
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate Random Avatar
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          placeholder="Tell us a bit about yourself... What makes you unique? What are you passionate about?"
          value={data.bio}
          onChange={(e) => updateData({ bio: e.target.value })}
          rows={4}
          maxLength={500}
        />
        <div className="text-right text-xs text-muted-foreground">
          {data.bio.length}/500 characters
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="profileVisibility">Profile Visibility</Label>
        <Select value={data.profileVisibility} onValueChange={(value) => updateData({ profileVisibility: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Who can see your profile?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public - Anyone can find and view my profile</SelectItem>
            <SelectItem value="community">Community only - Only registered members can see my profile</SelectItem>
            <SelectItem value="private">Private - Only people I approve can see my profile</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <Label className="text-base font-medium">Notification Preferences</Label>
        
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="emailNotifications"
              checked={data.emailNotifications}
              onCheckedChange={(checked) => updateData({ emailNotifications: checked as boolean })}
            />
            <Label htmlFor="emailNotifications" className="text-sm">
              Email notifications for important updates
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="matchNotifications"
              checked={data.matchNotifications}
              onCheckedChange={(checked) => updateData({ matchNotifications: checked as boolean })}
            />
            <Label htmlFor="matchNotifications" className="text-sm">
              Notifications for new matches and messages
            </Label>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Privacy & Safety</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Your email address will never be shared publicly</li>
          <li>• You can change your privacy settings anytime</li>
          <li>• You control who can contact you</li>
          <li>• Report any inappropriate behavior to our moderation team</li>
        </ul>
      </div>
    </div>
  );
}