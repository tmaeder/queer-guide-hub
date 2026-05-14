import { Play, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModernVideoPlayer } from '@/components/ui/modern-video-player';
import { useVideos } from '@/hooks/useVideos';

export default function Videos() {
  const { videos, loading, error } = useVideos();

  if (loading) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 mb-4 mx-auto animate-spin" aria-label="Loading" />
            <p>Loading videos...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6 px-4">
        <p className="text-destructive text-center">Error: {error}</p>
      </div>
    );
  }

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-8">
        <h4 className="text-2xl font-bold mb-2">Video Gallery</h4>
        <p className="text-muted-foreground">
          Modern web video with AV1/VP9 &rarr; H.264 fallback and adaptive streaming
        </p>
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-12">
          <Play style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
          <h6 className="text-base font-semibold mb-2">No videos available</h6>
          <p className="text-muted-foreground">
            Videos will appear here once they're uploaded and processed
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {videos.map((video) => (
            <Card key={video.id} style={{ overflow: 'hidden' }}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{video.title}</CardTitle>
                  <Badge variant="secondary">
                    {video.renditions.length} renditions
                  </Badge>
                </div>
                {video.description && (
                  <p
                    className="text-sm text-muted-foreground"
                    style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                  >
                    {video.description}
                  </p>
                )}
              </CardHeader>

              <CardContent style={{ padding: 0 }}>
                <div className="bg-black" style={{ aspectRatio: '16/9' }}>
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
                        format: r.format as 'mp4' | 'webm',
                        codec: r.codec as 'h264' | 'vp9' | 'av1',
                        container: r.container as 'mp4' | 'webm',
                        resolution: r.resolution,
                        file_path: r.file_path,
                        width: r.width,
                        height: r.height,
                        bitrate_kbps: r.bitrate_kbps
                      }))
                    }}
                    controls={true}
                    className="w-full h-full"
                  />
                </div>

                <div className="p-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">Duration: {formatDuration(video.duration_seconds)}</p>
                    <p className="text-sm text-muted-foreground">Uploaded: {new Date(video.created_at).toLocaleDateString()}</p>
                  </div>

                  <div className="mt-3">
                    <span className="text-xs font-medium mb-1 block">Available formats:</span>
                    <div className="flex flex-wrap gap-1">
                      {video.renditions.map((rendition) => (
                        <Badge
                          key={rendition.id}
                          variant="outline"
                        >
                          {rendition.codec.toUpperCase()}
                          {rendition.resolution !== 'source' && ` ${rendition.resolution}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
