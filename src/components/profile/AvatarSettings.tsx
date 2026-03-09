import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Palette, User, RefreshCw, Mail } from 'lucide-react';
import { AvatarDisplay } from '@/components/profile/AvatarDisplay';
import { AvatarBuilder, generateRandomConfig } from '@/components/profile/AvatarBuilder';
import { generateAvatarUrl } from '@/lib/avatar';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface AvatarData {
  avatarUrl?: string;
  avatarConfig?: any;
  avatarType?: 'upload' | 'builder' | 'gravatar';
  email: string;
}

interface AvatarSettingsProps {
  initialData: AvatarData;
  onSave?: (data: AvatarData) => void;
  showSaveButton?: boolean;
}

export const AvatarSettings = ({
  initialData,
  onSave,
  showSaveButton = false,
}: AvatarSettingsProps) => {
  const [data, setData] = useState<AvatarData>(initialData);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const updateData = (updates: Partial<AvatarData>) => {
    const newData = { ...data, ...updates };
    setData(newData);

    // Auto-save when used in profile settings
    if (!showSaveButton && onSave) {
      onSave(newData);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Create preview URL for immediate display
      const previewUrl = URL.createObjectURL(file);
      updateData({
        avatarUrl: previewUrl,
        avatarConfig: undefined,
        avatarType: 'upload',
      });
    }
  };

  const handleSaveAvatar = (avatarConfig: any) => {
    updateData({
      avatarConfig,
      avatarUrl: undefined,
      avatarType: 'builder',
    });
  };

  const generateRandomAvatar = () => {
    const randomConfig = generateRandomConfig();
    updateData({
      avatarConfig: randomConfig,
      avatarUrl: undefined,
      avatarType: 'builder',
    });
  };

  const useInitials = () => {
    updateData({
      avatarUrl: undefined,
      avatarConfig: undefined,
      avatarType: 'initials' as any,
    });
  };

  const handleSave = async () => {
    if (!user || !onSave) return;

    setSaving(true);
    try {
      // Upload file to Supabase storage if there's a selected file
      let finalAvatarUrl = data.avatarUrl;

      if (selectedFile && data.avatarType === 'upload') {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${user.id}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await api.storage
          .from('avatars')
          .upload(fileName, selectedFile, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: { publicUrl },
        } = api.storage.from('avatars').getPublicUrl(fileName);

        finalAvatarUrl = publicUrl;
      }

      // Update profile in database
      const profileUpdate: any = {
        avatar_url: data.avatarType === 'upload' ? finalAvatarUrl : null,
        avatar_config: data.avatarType === 'builder' ? data.avatarConfig : null,
        avatar_type: data.avatarType,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('user_id', user.id);

      if (updateError) {
        throw updateError;
      }

      onSave({ ...data, avatarUrl: finalAvatarUrl });

      toast({
        title: 'Avatar updated',
        description: 'Your profile picture has been successfully updated.',
      });
    } catch (error) {
      console.error('Error saving avatar:', error);
      toast({
        title: 'Error',
        description: 'Failed to save avatar. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <AvatarDisplay
          avatarUrl={data.avatarUrl}
          avatarConfig={data.avatarConfig}
          email={data.email}
          size="lg"
        />
      </Box>

      <Tabs defaultValue={data.avatarType || 'builder'} style={{ width: '100%' }}>
        <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <TabsTrigger value="upload">
            <Upload style={{ height: 16, width: 16, marginRight: 8 }} />
            Upload
          </TabsTrigger>
          <TabsTrigger value="builder">
            <Palette style={{ height: 16, width: 16, marginRight: 8 }} />
            Build
          </TabsTrigger>
          <TabsTrigger value="initials">
            <Mail style={{ height: 16, width: 16, marginRight: 8 }} />
            Initials
          </TabsTrigger>
          <TabsTrigger value="random">
            <User style={{ height: 16, width: 16, marginRight: 8 }} />
            Random
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" style={{ marginTop: 16 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                Upload Your Photo
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Use your own image as your profile picture
              </Typography>
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
              }}
            >
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
                  transition: 'background-color 0.2s',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pt: 2.5,
                    pb: 3,
                  }}
                >
                  <Upload
                    style={{
                      width: 32,
                      height: 32,
                      marginBottom: 8,
                      color: 'var(--muted-foreground)',
                    }}
                  />
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      Click to upload
                    </Box>
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    PNG, JPG up to 5MB
                  </Typography>
                </Box>
                <input
                  type="file"
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handleFileSelect}
                />
              </Box>
            </Box>
          </Box>
        </TabsContent>

        <TabsContent value="builder" style={{ marginTop: 16 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                Avatar Builder
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Create a custom avatar with our builder
              </Typography>
            </Box>
            <AvatarBuilder onSave={handleSaveAvatar} initialConfig={data.avatarConfig} />
          </Box>
        </TabsContent>

        <TabsContent value="initials" style={{ marginTop: 16 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                Initials Avatar
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Auto-generated avatar based on your name
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Box
                component="img"
                src={generateAvatarUrl(data.email, 64) || ''}
                alt="Initials avatar preview"
                sx={{ width: 64, height: 64, borderRadius: '50%' }}
              />
            </Box>
            <Button
              onClick={useInitials}
              size="lg"
              style={{ width: '100%' }}
              variant={(data.avatarType as string) === 'initials' ? 'default' : 'outline'}
            >
              <Mail style={{ height: 16, width: 16, marginRight: 8 }} />
              {(data.avatarType as string) === 'initials'
                ? 'Using Initials'
                : 'Use Initials Avatar'}
            </Button>
          </Box>
        </TabsContent>

        <TabsContent value="random" style={{ marginTop: 16 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                Random Avatar
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Generate a random avatar instantly
              </Typography>
            </Box>
            <Button onClick={generateRandomAvatar} size="lg" style={{ width: '100%' }}>
              <RefreshCw style={{ height: 16, width: 16, marginRight: 8 }} />
              Generate Random Avatar
            </Button>
          </Box>
        </TabsContent>
      </Tabs>

      {showSaveButton && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Button onClick={handleSave} disabled={saving} size="lg">
            {saving && (
              <RefreshCw
                style={{
                  height: 16,
                  width: 16,
                  marginRight: 8,
                  animation: 'spin 1s linear infinite',
                }}
              />
            )}
            Save Avatar
          </Button>
        </Box>
      )}
    </Box>
  );
};
