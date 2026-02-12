import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Palette, User } from "lucide-react";
import { AvatarBuilder, generateRandomConfig, type AvatarConfig } from "./AvatarBuilder";
import { AvatarDisplay } from "./AvatarDisplay";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface AvatarManagerProps {
  currentAvatarUrl?: string;
  currentAvatarConfig?: AvatarConfig;
}

export const AvatarManager = ({ currentAvatarUrl, currentAvatarConfig }: AvatarManagerProps) => {
  const { user } = useAuth();
  const { uploadAvatar, saveAvatarConfig } = useProfile();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please choose an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please choose an image file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadAvatar(file);
      if (result.error) {
        toast({
          title: "Upload failed",
          description: result.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Avatar uploaded successfully",
        });
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveAvatar = async (config: AvatarConfig) => {
    setIsSaving(true);
    try {
      const result = await saveAvatarConfig(config);
      if (result.error) {
        toast({
          title: "Save failed",
          description: result.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Avatar saved successfully",
        });
      }
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const generateRandomAvatar = async () => {
    const randomConfig = generateRandomConfig();
    await handleSaveAvatar(randomConfig);
  };

  return (
    <Card>
      <CardHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <User style={{ width: 20, height: 20 }} />
          <Typography variant="h6">Avatar Settings</Typography>
        </Box>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <AvatarDisplay
            avatarUrl={currentAvatarUrl}
            avatarConfig={currentAvatarConfig}
            email={user?.email}
            size="lg"
          />
        </Box>

        <Tabs defaultValue="upload" style={{ width: '100%' }}>
          <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: '1fr 1fr 1fr' }}>
            <TabsTrigger value="upload">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Upload style={{ width: 16, height: 16 }} />
                Upload
              </Box>
            </TabsTrigger>
            <TabsTrigger value="build">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Palette style={{ width: 16, height: 16 }} />
                Build
              </Box>
            </TabsTrigger>
            <TabsTrigger value="random">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <User style={{ width: 16, height: 16 }} />
                Random
              </Box>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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
                    border: '2px dashed',
                    borderColor: 'text.secondary',
                    borderRadius: 2,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pt: 2.5, pb: 3 }}>
                    <Upload style={{ width: 32, height: 32, marginBottom: 16 }} />
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                      <Box component="span" sx={{ fontWeight: 600 }}>Click to upload</Box>
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>PNG, JPG up to 5MB</Typography>
                  </Box>
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                </Box>
              </Box>
            </Box>
          </TabsContent>

          <TabsContent value="build">
            <Box sx={{ mt: 2 }}>
              <AvatarBuilder
                onSave={handleSaveAvatar}
                initialConfig={currentAvatarConfig}
              />
            </Box>
          </TabsContent>

          <TabsContent value="random">
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Generate a random avatar instantly
              </Typography>
              <Button
                onClick={generateRandomAvatar}
                disabled={isSaving}
                size="lg"
                style={{ width: '100%' }}
              >
                {isSaving ? "Generating..." : "Generate Random Avatar"}
              </Button>
            </Box>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
