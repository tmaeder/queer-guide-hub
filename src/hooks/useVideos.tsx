import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VideoRendition {
  id: string;
  format: string;
  codec: string;
  container: string;
  resolution: string;
  width?: number;
  height?: number;
  bitrate_kbps?: number;
  file_path: string;
  file_size?: number;
}

interface Video {
  id: string;
  title: string;
  description?: string;
  duration_seconds?: number;
  status: string;
  created_at: string;
  updated_at: string;
  poster_image_path?: string;
  captions_path?: string;
  storage_path?: string;
  original_filename: string;
  renditions: VideoRendition[];
}

export function useVideos() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVideos = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('videos')
        .select(`
          *,
          renditions:video_renditions(*)
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      
      setVideos(data || []);
    } catch (err) {
      console.error('Error loading videos:', err);
      setError(err instanceof Error ? err.message : 'Failed to load videos');
      toast.error('Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  const getVideo = async (id: string): Promise<Video | null> => {
    try {
      const { data, error } = await supabase
        .from('videos')
        .select(`
          *,
          renditions:video_renditions(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error fetching video:', err);
      return null;
    }
  };

  const deleteVideo = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setVideos(prev => prev.filter(v => v.id !== id));
      toast.success('Video deleted successfully');
      return true;
    } catch (err) {
      console.error('Error deleting video:', err);
      toast.error('Failed to delete video');
      return false;
    }
  };

  const updateVideo = async (id: string, updates: Partial<Pick<Video, 'title' | 'description'>>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('videos')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      setVideos(prev => prev.map(v => 
        v.id === id ? { ...v, ...updates } : v
      ));
      
      toast.success('Video updated successfully');
      return true;
    } catch (err) {
      console.error('Error updating video:', err);
      toast.error('Failed to update video');
      return false;
    }
  };

  useEffect(() => {
    loadVideos();
  }, []);

  return {
    videos,
    loading,
    error,
    loadVideos,
    getVideo,
    deleteVideo,
    updateVideo
  };
}