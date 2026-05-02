import { useState, useEffect } from 'react';
import { Search, Play, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ModernVideoPlayer } from '@/components/ui/modern-video-player';

interface Video {
  id: string;
  title: string;
  description?: string;
  duration_seconds?: number;
  status: string;
  created_at: string;
  poster_image_path?: string;
  captions_path?: string;
  storage_path?: string;
  original_filename: string;
  renditions: Array<{
    id: string;
    format: string;
    codec: string;
    container: string;
    resolution: string;
    file_path: string;
    file_size?: number;
    bitrate_kbps?: number;
  }>;
}

export function VideoManager() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [_selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('videos')
        .select(`
          *,
          renditions:video_renditions(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVideos(data || []);
    } catch (error) {
      console.error('Error loading videos:', error);
      toast.error('Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  const deleteVideo = async (videoId: string) => {
    if (!confirm('Are you sure you want to delete this video?')) return;

    try {
      const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);

      if (error) throw error;

      toast.success('Video deleted successfully');
      loadVideos();
    } catch (error) {
      console.error('Error deleting video:', error);
      toast.error('Failed to delete video');
    }
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return '#22c55e';
      case 'processing': return '#eab308';
      case 'failed': return '#ef4444';
      case 'uploaded': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const filteredVideos = videos.filter(video =>
    video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    video.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p>Loading videos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Video Library</h2>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search videos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredVideos.map((video) => (
          <Card key={video.id}>
            <div className="aspect-video bg-muted flex items-center justify-center relative">
              {video.poster_image_path ? (
                <img
                  src={`https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/videos/${video.poster_image_path}`}
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Play className="h-12 w-12 text-muted-foreground" />
              )}

              <div className="absolute top-2 right-2">
                <Badge style={{ backgroundColor: getStatusColor(video.status), color: 'white' }}>
                  {video.status}
                </Badge>
              </div>

              {video.duration_seconds && (
                <div className="absolute bottom-2 right-2 bg-black/75 text-white px-2 py-0.5 rounded text-xs">
                  {formatDuration(video.duration_seconds)}
                </div>
              )}
            </div>

            <CardContent>
              <h3 className="font-semibold mb-2 line-clamp-2">{video.title}</h3>

              {video.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {video.description}
                </p>
              )}

              <div className="text-xs text-muted-foreground mb-3">
                <div>Renditions: {video.renditions.length}</div>
                <div>Created: {new Date(video.created_at).toLocaleDateString()}</div>
              </div>

              <div className="flex gap-2">
                {video.status === 'completed' && video.renditions.length > 0 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedVideo(video)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{video.title}</DialogTitle>
                      </DialogHeader>
                      <div className="aspect-video">
                        <ModernVideoPlayer
                          video={{
                            id: video.id,
                            title: video.title,
                            description: video.description,
                            duration_seconds: video.duration_seconds,
                            poster_image_path: video.poster_image_path,
                            captions_path: video.captions_path,
                            renditions: video.renditions.map(r => ({
                              id: r.id,
                              format: r.format as string,
                              codec: r.codec as string,
                              container: r.container as string,
                              resolution: r.resolution,
                              file_path: r.file_path,
                              bitrate_kbps: r.bitrate_kbps
                            }))
                          }}
                          controls={true}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteVideo(video.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredVideos.length === 0 && (
        <div className="text-center py-12">
          <Play className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No videos found</h3>
          <p className="text-muted-foreground">
            {searchTerm ? 'Try adjusting your search terms' : 'Upload some videos to get started'}
          </p>
        </div>
      )}
    </div>
  );
}
