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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SignupData } from '../MultiStepSignup';

interface AccountSetupStepProps {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
}

export default function AccountSetupStep({
  data,
  updateData
}: AccountSetupStepProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Generate random avatar if none exists
  if (!data.avatarConfig && !data.avatarUrl) {
    updateData({
      avatarConfig: generateRandomConfig()
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>Finish setting up your account</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Add some final touches to your profile
        </Typography>
      </Box>

      {/* Avatar Section */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Label sx={{ fontSize: '1rem', fontWeight: 500 }}>Profile Avatar</Label>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Choose an avatar or upload your own photo
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <AvatarDisplay avatarUrl={data.avatarUrl} avatarConfig={data.avatarConfig} email={data.email} size="lg" />
        </Box>

        <Tabs defaultValue="build" style={{ width: '100%' }}>
          <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <TabsTrigger value="upload">
              <Upload style={{ height: 16, width: 16, marginRight: 8 }} />
              Upload
            </TabsTrigger>
            <TabsTrigger value="build">
              <Palette style={{ height: 16, width: 16, marginRight: 8 }} />
              Build
            </TabsTrigger>
            <TabsTrigger value="random">
              <User style={{ height: 16, width: 16, marginRight: 8 }} />
              Random
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" style={{ marginTop: 16 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                Upload a custom image to use as your avatar
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <Box
                  component="label"
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: 128,
                    border: 2,
                    borderStyle: 'dashed',
                    borderColor: 'text.disabled',
                    borderRadius: 2,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pt: 2.5, pb: 3 }}>
                    <Upload style={{ width: 32, height: 32, marginBottom: 16 }} sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                      <Box component="span" sx={{ fontWeight: 600 }}>Click to upload</Box>
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>PNG, JPG up to 5MB</Typography>
                  </Box>
                  <input type="file" style={{ display: 'none' }} accept="image/*" onChange={handleFileSelect} />
                </Box>
              </Box>
            </Box>
          </TabsContent>

          <TabsContent value="build" style={{ marginTop: 16 }}>
            <AvatarBuilder onSave={handleSaveAvatar} initialConfig={data.avatarConfig} />
          </TabsContent>

          <TabsContent value="random" style={{ marginTop: 16 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'center' }}>
              <Button onClick={generateRandomAvatar} size="lg" style={{ width: '100%' }}>
                <RefreshCw style={{ height: 16, width: 16, marginRight: 8 }} />
                Generate Random Avatar
              </Button>
            </Box>
          </TabsContent>
        </Tabs>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          placeholder="Tell us a bit about yourself... What makes you unique? What are you passionate about?"
          value={data.bio}
          onChange={e => updateData({ bio: e.target.value })}
          rows={4}
          maxLength={500}
        />
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {data.bio.length}/500 characters
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Label htmlFor="profileVisibility">Profile Visibility</Label>
        <Select value={data.profileVisibility} onValueChange={value => updateData({ profileVisibility: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Who can see your profile?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public - Anyone can find and view my profile</SelectItem>
            <SelectItem value="community">Community only - Only registered members can see my profile</SelectItem>
            <SelectItem value="private">Private - Only people I approve can see my profile</SelectItem>
          </SelectContent>
        </Select>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Label sx={{ fontSize: '1rem', fontWeight: 500 }}>Notification Preferences</Label>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox
              id="emailNotifications"
              checked={data.emailNotifications}
              onCheckedChange={checked => updateData({ emailNotifications: checked as boolean })}
            />
            <Label htmlFor="emailNotifications" sx={{ fontSize: '0.875rem' }}>
              Email notifications for important updates
            </Label>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox
              id="matchNotifications"
              checked={data.matchNotifications}
              onCheckedChange={checked => updateData({ matchNotifications: checked as boolean })}
            />
            <Label htmlFor="matchNotifications" sx={{ fontSize: '0.875rem' }}>
              Notifications for new matches and messages
            </Label>
          </Box>
        </Box>
      </Box>

      <Box sx={{ bgcolor: 'action.hover', opacity: 0.5, p: 2, borderRadius: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>Privacy & Safety</Typography>
        <Box component="ul" sx={{ fontSize: '0.875rem', color: 'text.secondary', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography component="li">• Your email address will never be shared publicly</Typography>
          <Typography component="li">• You can change your privacy settings anytime</Typography>
          <Typography component="li">• You control who can contact you</Typography>
          <Typography component="li">• Report any inappropriate behavior to our moderation team</Typography>
        </Box>
      </Box>
    </Box>
  );
}
