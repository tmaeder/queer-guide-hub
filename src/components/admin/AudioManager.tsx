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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return '#22c55e';
      case 'processing': return '#eab308';
      case 'failed': return '#ef4444';
      case 'uploaded': return '#3b82f6';
      default: return '#6b7280';
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Box sx={{ animation: 'spin 1s linear infinite', borderRadius: '50%', height: 32, width: 32, borderBottom: 2, borderColor: 'primary.main', mx: 'auto', mb: 2 }}></Box>
          <p>Loading audio files...</p>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>Audio Library</Typography>
        <Box sx={{ position: 'relative', width: 256 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          <Input
            placeholder="Search audio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ pl: 5 }}
          />
        </Box>
      </Box>

      {/* Audio Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
        {filteredAudios.map((audio) => (
          <Card key={audio.id} sx={{ overflow: 'hidden' }}>
            <Box sx={{ aspectRatio: '1/1', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {audio.poster_image_path ? (
                <Box
                  component="img"
                  src={`https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/audio/${audio.poster_image_path}`}
                  alt={audio.title}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Music style={{ height: 48, width: 48, color: 'var(--muted-foreground)' }} />
              )}

              <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                <Badge style={{ backgroundColor: getStatusColor(audio.status), color: 'white' }}>
                  {audio.status}
                </Badge>
              </Box>

              {audio.duration_seconds && (
                <Box sx={{ position: 'absolute', bottom: 8, right: 8, bgcolor: 'rgba(0,0,0,0.75)', color: 'white', px: 1, py: 0.5, borderRadius: 1, fontSize: '0.75rem' }}>
                  {formatDuration(audio.duration_seconds)}
                </Box>
              )}
            </Box>

            <CardContent sx={{ p: 2 }}>
              <Typography variant="h3" sx={{ fontWeight: 600, mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audio.title}</Typography>

              {audio.artist && (
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  by {audio.artist}
                </Typography>
              )}

              {audio.album && (
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  from {audio.album}
                </Typography>
              )}

              {audio.description && (
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {audio.description}
                </Typography>
              )}

              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1.5 }}>
                <div>Renditions: {audio.renditions.length}</div>
                <div>Created: {new Date(audio.created_at).toLocaleDateString()}</div>
              </Box>

              <Box sx={{ display: 'flex', gap: 1 }}>
                {audio.status === 'completed' && audio.renditions.length > 0 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedAudio(audio)}
                      >
                        <Play style={{ height: 16, width: 16 }} />
                      </Button>
                    </DialogTrigger>
                    <DialogContent sx={{ maxWidth: 448 }}>
                      <DialogHeader>
                        <DialogTitle>{audio.title}</DialogTitle>
                      </DialogHeader>
                      <Box sx={{ width: '100%' }}>
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
                          sx={{ width: '100%' }}
                        />
                      </Box>
                    </DialogContent>
                  </Dialog>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteAudio(audio.id)}
                  sx={{ color: 'error.main', '&:hover': { color: 'error.main' } }}
                >
                  <Trash2 style={{ height: 16, width: 16 }} />
                </Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {filteredAudios.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Music style={{ height: 48, width: 48, color: 'var(--muted-foreground)', margin: '0 auto 16px' }} />
          <Typography variant="h3" sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}>No audio files found</Typography>
          <p style={{ color: 'var(--muted-foreground)' }}>
            {searchTerm ? 'Try adjusting your search terms' : 'Upload some audio files to get started'}
          </p>
        </Box>
      )}
    </Box>
  );
}
