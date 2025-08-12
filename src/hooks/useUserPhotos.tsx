import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface UserPhoto {
  id: string;
  user_id: string;
  filename: string;
  caption?: string;
  storage_path: string;
  file_size?: number;
  content_type?: string;
  is_profile_picture: boolean;
  display_order: number;
  is_public?: boolean;
  created_at: string;
  updated_at: string;
}

export function useUserPhotos(userId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: photos, isLoading } = useQuery({
    queryKey: ['user-photos', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_photos')
        .select('*')
        .eq('user_id', userId)
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as UserPhoto[];
    },
    enabled: !!userId,
  });

  const uploadPhoto = useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption?: string }) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Save metadata to database
      const { data, error } = await supabase
        .from('user_photos')
        .insert({
          user_id: userId,
          filename: file.name,
          caption,
          storage_path: filePath,
          file_size: file.size,
          content_type: file.type,
          display_order: (photos?.length || 0) + 1,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-photos', userId] });
      toast({
        title: "Photo uploaded",
        description: "Your photo has been added to your gallery.",
      });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePhoto = useMutation({
    mutationFn: async (photoId: string) => {
      const photo = photos?.find(p => p.id === photoId);
      if (!photo) throw new Error('Photo not found');

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('user-photos')
        .remove([photo.storage_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error } = await supabase
        .from('user_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-photos', userId] });
      toast({
        title: "Photo deleted",
        description: "Photo has been removed from your gallery.",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateCaption = useMutation({
    mutationFn: async ({ photoId, caption }: { photoId: string; caption: string }) => {
      const { error } = await supabase
        .from('user_photos')
        .update({ caption })
        .eq('id', photoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-photos', userId] });
      toast({
        title: "Caption updated",
        description: "Photo caption has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getPhotoUrl = (storagePath: string) => {
    const { data } = supabase.storage
      .from('user-photos')
      .getPublicUrl(storagePath);
    return data.publicUrl;
  };

  const getSignedPhotoUrl = async (storagePath: string, expiresIn: number = 3600) => {
    const { data, error } = await supabase.storage
      .from('user-photos')
      .createSignedUrl(storagePath, expiresIn);
    if (error) return null;
    return data?.signedUrl ?? null;
  };
  return {
    photos,
    isLoading,
    uploadPhoto,
    deletePhoto,
    updateCaption,
    getPhotoUrl,
    getSignedPhotoUrl,
  };
}