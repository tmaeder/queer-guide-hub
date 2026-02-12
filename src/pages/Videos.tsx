import React from 'react';
import { Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModernVideoPlayer } from '@/components/ui/modern-video-player';
import { useVideos } from '@/hooks/useVideos';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

export default function Videos() {
  const { videos, loading, error } = useVideos();

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress size={32} sx={{ mb: 2 }} />
            <Typography>Loading videos...</Typography>
          </Box>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="error" sx={{ textAlign: 'center' }}>
          Error: {error}
        </Typography>
      </Container>
    );
  }

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>Video Gallery</Typography>
        <Typography color="text.secondary">
          Modern web video with AV1/VP9 &rarr; H.264 fallback and adaptive streaming
        </Typography>
      </Box>

      {videos.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Play style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No videos available</Typography>
          <Typography color="text.secondary">
            Videos will appear here once they're uploaded and processed
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 4 }}>
          {videos.map((video) => (
            <Card key={video.id} style={{ overflow: 'hidden' }}>
              <CardHeader>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <CardTitle style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{video.title}</CardTitle>
                  <Badge variant="secondary">
                    {video.renditions.length} renditions
                  </Badge>
                </Box>
                {video.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {video.description}
                  </Typography>
                )}
              </CardHeader>

              <CardContent style={{ padding: 0 }}>
                <Box sx={{ aspectRatio: '16/9', bgcolor: 'black' }}>
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
                        format: r.format as any,
                        codec: r.codec as any,
                        container: r.container as any,
                        resolution: r.resolution,
                        file_path: r.file_path,
                        width: r.width,
                        height: r.height,
                        bitrate_kbps: r.bitrate_kbps
                      }))
                    }}
                    controls={true}
                    sx={{ width: '100%', height: '100%' }}
                  />
                </Box>

                <Box sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">Duration: {formatDuration(video.duration_seconds)}</Typography>
                    <Typography variant="body2" color="text.secondary">Uploaded: {new Date(video.created_at).toLocaleDateString()}</Typography>
                  </Box>

                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 500, mb: 0.5, display: 'block' }}>Available formats:</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {video.renditions.map((rendition) => (
                        <Badge
                          key={rendition.id}
                          variant="outline"
                        >
                          {rendition.codec.toUpperCase()}
                          {rendition.resolution !== 'source' && ` ${rendition.resolution}`}
                        </Badge>
                      ))}
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Container>
  );
}
