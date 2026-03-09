import { useState, useEffect } from "react";
import { api } from "@/integrations/api/client";
import { Tables } from "@/types/database";
import { useAuth } from "./useAuth";

export type Profile = Tables<"profiles">;

export const useProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await api
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) {
      return { error: "No user found" };
    }

    try {
      const { data, error } = await api
        .from("profiles")
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      return { data, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      return { data: null, error: errorMessage };
    }
  };

  const saveAvatarConfig = async (avatarConfig: any) => {
    if (!user) {
      return { error: "No user found" };
    }

    try {
      const { data, error } = await api
        .from("profiles")
        .update({
          avatar_config: avatarConfig,
          avatar_url: null, // Clear uploaded avatar when using generated one
          updated_at: new Date().toISOString()
        })
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      return { data, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      return { data: null, error: errorMessage };
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) {
      return { error: "No user found" };
    }

    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload the file
      const { error: uploadError } = await api.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get the public URL
      const { data } = api.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update profile with new avatar URL
      const { error: updateError } = await api
        .from("profiles")
        .update({ 
          avatar_url: data.publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      // Refresh profile data
      await fetchProfile();
      return { data: data.publicUrl, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      return { data: null, error: errorMessage };
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  return {
    profile,
    loading,
    error,
    updateProfile,
    uploadAvatar,
    saveAvatarConfig,
    refetchProfile: fetchProfile
  };
};