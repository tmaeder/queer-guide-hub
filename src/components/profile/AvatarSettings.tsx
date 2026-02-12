import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Palette, User, RefreshCw, Mail } from 'lucide-react';
import { AvatarDisplay } from '@/components/profile/AvatarDisplay';
import { AvatarBuilder, generateRandomConfig } from '@/components/profile/AvatarBuilder';
import { hasGravatar, getGravatarUrl } from '@/lib/gravatar';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
  showSaveButton = false
}: AvatarSettingsProps) => {
  const [data, setData] = useState<AvatarData>(initialData);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [gravatarExists, setGravatarExists] = useState<boolean>(false);
  const [checkingGravatar, setCheckingGravatar] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const { toast } = useToast();
  const { user } = useAuth();

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

  const handleSave = async () => {
    if (!user || !onSave) return;

    setSaving(true);
    try {
      // Upload file to Supabase storage if there's a selected file
      let finalAvatarUrl = data.avatarUrl;

      if (selectedFile && data.avatarType === 'upload') {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${user.id}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, selectedFile, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);

        finalAvatarUrl = publicUrl;
      }

      // Update profile in database
      const profileUpdate: any = {
        avatar_url: data.avatarType === 'upload' ? finalAvatarUrl : null,
        avatar_config: data.avatarType === 'builder' ? data.avatarConfig : null,
        avatar_type: data.avatarType,
        updated_at: new Date().toISOString()
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
        title: "Avatar updated",
        description: "Your profile picture has been successfully updated.",
      });
    } catch (error) {
      console.error('Error saving avatar:', error);
      toast({
        title: "Error",
        description: "Failed to save avatar. Please try again.",
        variant: "destructive",
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

      <Tabs defaultValue={data.avatarType || "builder"} style={{ width: '100%' }}>
        <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <TabsTrigger value="upload">
            <Upload style={{ height: 16, width: 16, marginRight: 8 }} />
            Upload
          </TabsTrigger>
          <TabsTrigger value="builder">
            <Palette style={{ height: 16, width: 16, marginRight: 8 }} />
            Build
          </TabsTrigger>
          <TabsTrigger value="gravatar" disabled={!gravatarExists && !checkingGravatar}>
            <Mail style={{ height: 16, width: 16, marginRight: 8 }} />
            Gravatar
          </TabsTrigger>
          <TabsTrigger value="random">
            <User style={{ height: 16, width: 16, marginRight: 8 }} />
            Random
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" style={{ marginTop: 16 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>Upload Your Photo</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Use your own image as your profile picture
              </Typography>
            </Box>
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
                  transition: 'background-color 0.2s',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pt: 2.5, pb: 3 }}>
                  <Upload style={{ width: 32, height: 32, marginBottom: 8, color: 'var(--muted-foreground)' }} />
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                    <Box component="span" sx={{ fontWeight: 600 }}>Click to upload</Box>
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>PNG, JPG up to 5MB</Typography>
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
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>Avatar Builder</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Create a custom avatar with our builder
              </Typography>
            </Box>
            <AvatarBuilder
              onSave={handleSaveAvatar}
              initialConfig={data.avatarConfig}
            />
          </Box>
        </TabsContent>

        <TabsContent value="gravatar" style={{ marginTop: 16 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>Gravatar</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Use your globally recognized avatar from Gravatar.com
              </Typography>
            </Box>

            {checkingGravatar ? (
              <Box sx={{ py: 4 }}>
                <RefreshCw style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', margin: '0 auto', marginBottom: 8, color: 'var(--muted-foreground)' }} />
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Checking for Gravatar...</Typography>
              </Box>
            ) : gravatarExists ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Box
                    component="img"
                    src={getGravatarUrl(data.email, 64) || ''}
                    alt="Gravatar preview"
                    sx={{ width: 64, height: 64, borderRadius: '50%' }}
                  />
                </Box>
                <Button
                  onClick={useGravatar}
                  size="lg"
                  style={{ width: '100%' }}
                  variant={data.avatarType === 'gravatar' ? 'default' : 'outline'}
                >
                  <Mail style={{ height: 16, width: 16, marginRight: 8 }} />
                  {data.avatarType === 'gravatar' ? 'Using Gravatar' : 'Use This Gravatar'}
                </Button>
              </Box>
            ) : (
              <Box sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Mail style={{ width: 32, height: 32, margin: '0 auto', marginBottom: 8, color: 'var(--muted-foreground)' }} />
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                    No Gravatar found for <strong>{data.email}</strong>
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Create one at{' '}
                    <a
                      href="https://gravatar.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'underline' }}
                    >
                      gravatar.com
                    </a>{' '}
                    to use this option
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </TabsContent>

        <TabsContent value="random" style={{ marginTop: 16 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>Random Avatar</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Generate a random avatar instantly
              </Typography>
            </Box>
            <Button
              onClick={generateRandomAvatar}
              size="lg"
              style={{ width: '100%' }}
            >
              <RefreshCw style={{ height: 16, width: 16, marginRight: 8 }} />
              Generate Random Avatar
            </Button>
          </Box>
        </TabsContent>
      </Tabs>

      {showSaveButton && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button
            onClick={handleSave}
            disabled={saving}
            size="lg"
          >
            {saving && <RefreshCw style={{ height: 16, width: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />}
            Save Avatar
          </Button>
        </Box>
      )}
    </Box>
  );
};
