import React, { useState, useEffect } from 'react';
import { Search, Play, Download, Trash2, Eye, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ModernAudioPlayer } from '@/components/ui/modern-audio-player';

interface AudioFile {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  description?: string;
  duration_seconds?: number;
  status: string;
  created_at: string;
  poster_image_path?: string;
  transcript_path?: string;
  renditions: Array<{
    id: string;
    format: string;
    codec: string;
    container: string;
    file_path: string;
    file_size?: number;
    bitrate_kbps?: number;
  }>;
}

export function AudioManager() {
  const [audios, setAudios] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAudio, setSelectedAudio] = useState<AudioFile | null>(null);

  useEffect(() => {
    loadAudios();
  }, []);

  const loadAudios = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('audio_files')
        .select(`
          *,
          renditions:audio_renditions(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAudios(data || []);
    } catch (error) {
      console.error('Error loading audio files:', error);
      toast.error('Failed to load audio files');
    } finally {
      setLoading(false);
    }
  };

  const deleteAudio = async (audioId: string) => {
    if (!confirm('Are you sure you want to delete this audio file?')) return;

    try {
      const { error } = await supabase
        .from('audio_files')
        .delete()
        .eq('id', audioId);

      if (error) throw error;

      toast.success('Audio file deleted successfully');
      loadAudios();
    } catch (error) {
      console.error('Error deleting audio file:', error);
      toast.error('Failed to delete audio file');
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'processing': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      case 'uploaded': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const filteredAudios = audios.filter(audio =>
    audio.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    audio.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    audio.album?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    audio.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading audio files...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Audio Library</h2>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search audio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Audio Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAudios.map((audio) => (
          <Card key={audio.id} className="overflow-hidden">
            <div className="aspect-square bg-muted flex items-center justify-center relative">
              {audio.poster_image_path ? (
                <img
                  src={`https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/audio/${audio.poster_image_path}`}
                  alt={audio.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music className="h-12 w-12 text-muted-foreground" />
              )}
              
              <div className="absolute top-2 right-2">
                <Badge className={`${getStatusColor(audio.status)} text-white`}>
                  {audio.status}
                </Badge>
              </div>
              
              {audio.duration_seconds && (
                <div className="absolute bottom-2 right-2 bg-black/75 text-white px-2 py-1 rounded text-xs">
                  {formatDuration(audio.duration_seconds)}
                </div>
              )}
            </div>
            
            <CardContent className="p-4">
              <h3 className="font-semibold mb-1 line-clamp-1">{audio.title}</h3>
              
              {audio.artist && (
                <p className="text-sm text-muted-foreground mb-1 line-clamp-1">
                  by {audio.artist}
                </p>
              )}
              
              {audio.album && (
                <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                  from {audio.album}
                </p>
              )}
              
              {audio.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {audio.description}
                </p>
              )}
              
              <div className="text-xs text-muted-foreground mb-3">
                <div>Renditions: {audio.renditions.length}</div>
                <div>Created: {new Date(audio.created_at).toLocaleDateString()}</div>
              </div>
              
              <div className="flex gap-2">
                {audio.status === 'completed' && audio.renditions.length > 0 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSelectedAudio(audio)}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>{audio.title}</DialogTitle>
                      </DialogHeader>
                      <div className="w-full">
                        <ModernAudioPlayer 
                          audio={{
                            id: audio.id,
                            title: audio.title,
                            artist: audio.artist,
                            album: audio.album,
                            description: audio.description,
                            duration_seconds: audio.duration_seconds,
                            poster_image_path: audio.poster_image_path,
                            transcript_path: audio.transcript_path,
                            renditions: audio.renditions.map(r => ({
                              id: r.id,
                              format: r.format,
                              codec: r.codec,
                              container: r.container,
                              file_path: r.file_path,
                              bitrate_kbps: r.bitrate_kbps,
                              file_size: r.file_size
                            }))
                          }}
                          controls={true}
                          className="w-full"
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteAudio(audio.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredAudios.length === 0 && (
        <div className="text-center py-12">
          <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No audio files found</h3>
          <p className="text-muted-foreground">
            {searchTerm ? 'Try adjusting your search terms' : 'Upload some audio files to get started'}
          </p>
        </div>
      )}
    </div>
  );
}