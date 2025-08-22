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
    <div className="space-y-6">
      <div className="flex justify-center">
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

      {showSaveButton && (
        <div className="flex justify-end pt-4 border-t">
          <Button 
            onClick={handleSave} 
            disabled={saving}
            size="lg"
          >
            {saving && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Save Avatar
          </Button>
        </div>
      )}
    </div>
  );
};