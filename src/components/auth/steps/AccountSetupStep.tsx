import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Palette, User, RefreshCw } from 'lucide-react';
import { AvatarDisplay } from '@/components/profile/AvatarDisplay';
import { AvatarBuilder, generateRandomConfig } from '@/components/profile/AvatarBuilder';
import type { SignupData } from '../MultiStepSignup';

interface AccountSetupStepProps {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
}

export default function AccountSetupStep({ data, updateData }: AccountSetupStepProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Generate random avatar if none exists
  if (!data.avatarConfig && !data.avatarUrl) {
    updateData({ avatarConfig: generateRandomConfig() });
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Create preview URL for immediate display
      const previewUrl = URL.createObjectURL(file);
      updateData({ 
        avatarUrl: previewUrl,
        avatarConfig: undefined
      });
    }
  };

  const handleSaveAvatar = (avatarConfig: any) => {
    updateData({ 
      avatarConfig,
      avatarUrl: undefined
    });
  };

  const generateRandomAvatar = () => {
    const randomConfig = generateRandomConfig();
    updateData({ 
      avatarConfig: randomConfig,
      avatarUrl: undefined
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
            size="lg"
          />
        </div>

        <Tabs defaultValue="build" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="build">
              <Palette className="h-4 w-4 mr-2" />
              Build
            </TabsTrigger>
            <TabsTrigger value="random">
              <User className="h-4 w-4 mr-2" />
              Random
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Upload a custom image to use as your avatar
              </p>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground rounded-lg cursor-pointer hover:bg-muted/50">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-4 text-muted-foreground" />
                    <p className="mb-2 text-sm text-muted-foreground">
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

          <TabsContent value="build" className="mt-4">
            <AvatarBuilder 
              onSave={handleSaveAvatar}
              initialConfig={data.avatarConfig}
            />
          </TabsContent>

          <TabsContent value="random" className="mt-4">
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Generate a random avatar instantly
              </p>
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