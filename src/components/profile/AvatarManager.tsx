import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Palette, User } from "lucide-react";
import { AvatarBuilder, generateRandomConfig, type AvatarConfig } from "./AvatarBuilder";
import { AvatarDisplay } from "./AvatarDisplay";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";

interface AvatarManagerProps {
  currentAvatarUrl?: string;
  currentAvatarConfig?: AvatarConfig;
}

export const AvatarManager = ({ currentAvatarUrl, currentAvatarConfig }: AvatarManagerProps) => {
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
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Avatar Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center mb-6">
          <AvatarDisplay 
            avatarUrl={currentAvatarUrl} 
            avatarConfig={currentAvatarConfig}
            size="lg"
          />
        </div>

        <Tabs defaultValue="upload" className="w-full">
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
              <p className="text-sm text-muted-foreground">
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
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                </label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="build" className="mt-4">
            <AvatarBuilder 
              onSave={handleSaveAvatar}
              initialConfig={currentAvatarConfig}
            />
          </TabsContent>

          <TabsContent value="random" className="mt-4">
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Generate a random avatar instantly
              </p>
              <Button 
                onClick={generateRandomAvatar}
                disabled={isSaving}
                size="lg"
                className="w-full"
              >
                {isSaving ? "Generating..." : "Generate Random Avatar"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};