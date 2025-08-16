import React from 'react';
import { Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModernVideoPlayer } from '@/components/ui/modern-video-player';
import { useVideos } from '@/hooks/useVideos';

export default function Videos() {
  const { videos, loading, error } = useVideos();

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading videos...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-red-500">
          <p>Error: {error}</p>
        </div>
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
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Video Gallery</h1>
        <p className="text-muted-foreground">
          Modern web video with AV1/VP9 → H.264 fallback and adaptive streaming
        </p>
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-12">
          <Play className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No videos available</h3>
          <p className="text-muted-foreground">
            Videos will appear here once they're uploaded and processed
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {videos.map((video) => (
            <Card key={video.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="line-clamp-2">{video.title}</CardTitle>
                  <Badge variant="secondary">
                    {video.renditions.length} renditions
                  </Badge>
                </div>
                {video.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {video.description}
                  </p>
                )}
              </CardHeader>
              
              <CardContent className="p-0">
                <div className="aspect-video bg-black">
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
                    className="w-full h-full"
                  />
                </div>
                
                <div className="p-4">
                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>Duration: {formatDuration(video.duration_seconds)}</span>
                    <span>Uploaded: {new Date(video.created_at).toLocaleDateString()}</span>
                  </div>
                  
                  {/* Rendition info */}
                  <div className="mt-3">
                    <p className="text-xs font-medium mb-1">Available formats:</p>
                    <div className="flex flex-wrap gap-1">
                      {video.renditions.map((rendition) => (
                        <Badge 
                          key={rendition.id} 
                          variant="outline" 
                          className="text-xs"
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