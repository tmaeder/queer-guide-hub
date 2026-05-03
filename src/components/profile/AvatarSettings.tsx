import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Palette, User, RefreshCw, Mail } from 'lucide-react';
import { AvatarDisplay } from '@/components/profile/AvatarDisplay';
import { AvatarBuilder, generateRandomConfig } from '@/components/profile/AvatarBuilder';
import { generateAvatarUrl } from '@/lib/avatar';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { updateRowsBy } from '@/hooks/usePageFetchers';
import { useAuth } from '@/hooks/useAuth';

interface AvatarData {
  avatarUrl?: string;
  avatarConfig?: Record<string, unknown>;
  avatarType?: 'upload' | 'builder' | 'initials';
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

  const handleSaveAvatar = (avatarConfig: Record<string, unknown>) => {
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
      avatarType: 'initials',
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

        const {
          data: { publicUrl },
        } = supabase.storage.from('avatars').getPublicUrl(fileName);

        finalAvatarUrl = publicUrl;
      }

      // Update profile in database
      const profileUpdate: Record<string, unknown> = {
        avatar_url: data.avatarType === 'upload' ? finalAvatarUrl : null,
        avatar_config: data.avatarType === 'builder' ? data.avatarConfig : null,
        avatar_type: data.avatarType,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await updateRowsBy(
        'profiles',
        { col: 'user_id', val: user.id },
        profileUpdate,
      );

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
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <AvatarDisplay
          avatarUrl={data.avatarUrl}
          avatarConfig={data.avatarConfig}
          email={data.email}
          size="lg"
        />
      </div>

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
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <p className="text-sm">
                Upload Your Photo
              </p>
              <p className="text-xs text-muted-foreground">
                Use your own image as your profile picture
              </p>
            </div>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground rounded-lg cursor-pointer transition-colors hover:bg-muted">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload
                    style={{
                      width: 32,
                      height: 32,
                      marginBottom: 8,
                      color: 'var(--muted-foreground)',
                    }}
                  />
                  <p className="text-sm">
                    <span className="font-semibold">Click to upload</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG up to 5MB
                  </p>
                </div>
                <input
                  type="file"
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handleFileSelect}
                />
              </label>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="builder" style={{ marginTop: 16 }}>
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <p className="text-sm">
                Avatar Builder
              </p>
              <p className="text-xs text-muted-foreground">
                Create a custom avatar with our builder
              </p>
            </div>
            <AvatarBuilder onSave={handleSaveAvatar} initialConfig={data.avatarConfig} />
          </div>
        </TabsContent>

        <TabsContent value="initials" style={{ marginTop: 16 }}>
          <div className="flex flex-col gap-4 text-center">
            <div>
              <p className="text-sm">
                Initials Avatar
              </p>
              <p className="text-xs text-muted-foreground">
                Auto-generated avatar based on your name
              </p>
            </div>
            <div className="flex justify-center">
              <img src={generateAvatarUrl(data.email, 64) || ''} alt="Initials avatar preview" className="w-16 h-16 rounded-full" />
            </div>
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
          </div>
        </TabsContent>

        <TabsContent value="random" style={{ marginTop: 16 }}>
          <div className="flex flex-col gap-4 text-center">
            <div>
              <p className="text-sm">
                Random Avatar
              </p>
              <p className="text-xs text-muted-foreground">
                Generate a random avatar instantly
              </p>
            </div>
            <Button onClick={generateRandomAvatar} size="lg" style={{ width: '100%' }}>
              <RefreshCw style={{ height: 16, width: 16, marginRight: 8 }} />
              Generate Random Avatar
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {showSaveButton && (
        <div className="flex justify-end pt-4 border-t border-border">
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
        </div>
      )}
    </div>
  );
};
