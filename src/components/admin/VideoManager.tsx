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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
      // Delete from database (cascades to renditions)
      const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);

      if (error) throw error;

      // TODO: Delete files from storage
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Box sx={{ animation: 'spin 1s linear infinite', borderRadius: '50%', height: 32, width: 32, borderBottom: 2, borderColor: 'primary.main', mx: 'auto', mb: 2 }}></Box>
          <p>Loading videos...</p>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>Video Library</Typography>
        <Box sx={{ position: 'relative', width: 256 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          <Input
            placeholder="Search videos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}

          />
        </Box>
      </Box>

      {/* Video Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
        {filteredVideos.map((video) => (
          <Card key={video.id}>
            <Box sx={{ aspectRatio: '16/9', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {video.poster_image_path ? (
                <Box
                  component="img"
                  src={`https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/videos/${video.poster_image_path}`}
                  alt={video.title}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Play style={{ height: 48, width: 48, color: 'var(--muted-foreground)' }} />
              )}

              <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                <Badge style={{ backgroundColor: getStatusColor(video.status), color: 'white' }}>
                  {video.status}
                </Badge>
              </Box>

              {video.duration_seconds && (
                <Box sx={{ position: 'absolute', bottom: 8, right: 8, bgcolor: 'rgba(0,0,0,0.75)', color: 'white', px: 1, py: 0.5, borderRadius: 1, fontSize: '0.75rem' }}>
                  {formatDuration(video.duration_seconds)}
                </Box>
              )}
            </Box>

            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 600, mb: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{video.title}</Typography>

              {video.description && (
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {video.description}
                </Typography>
              )}

              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1.5 }}>
                <div>Renditions: {video.renditions.length}</div>
                <div>Created: {new Date(video.created_at).toLocaleDateString()}</div>
              </Box>

              <Box sx={{ display: 'flex', gap: 1 }}>
                {video.status === 'completed' && video.renditions.length > 0 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedVideo(video)}
                      >
                        <Eye style={{ height: 16, width: 16 }} />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{video.title}</DialogTitle>
                      </DialogHeader>
                      <Box sx={{ aspectRatio: '16/9' }}>
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
                          sx={{ width: '100%', height: '100%' }}
                        />
                      </Box>
                    </DialogContent>
                  </Dialog>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteVideo(video.id)}

                >
                  <Trash2 style={{ height: 16, width: 16 }} />
                </Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {filteredVideos.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Play style={{ height: 48, width: 48, color: 'var(--muted-foreground)', margin: '0 auto 16px' }} />
          <Typography variant="h3" sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}>No videos found</Typography>
          <p style={{ color: 'var(--muted-foreground)' }}>
            {searchTerm ? 'Try adjusting your search terms' : 'Upload some videos to get started'}
          </p>
        </Box>
      )}
    </Box>
  );
}
