import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Upload, Music, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AudioUploadProps {
  onUploadComplete?: (audioId: string) => void;
}

interface UploadedAudio {
  id: string;
  title: string;
  artist: string;
  album: string;
  description: string;
  file: File;
  uploadProgress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  processingProgress?: number;
  config: {
    quality: 'podcast' | 'music' | 'high';
    generateTranscript: boolean;
    normalizeLoudness: boolean;
  };
}

export function AudioUpload({ onUploadComplete }: AudioUploadProps) {
  const [audios, setAudios] = useState<UploadedAudio[]>([]);
  const [_isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const audioFiles = acceptedFiles.filter(file => file.type.startsWith('audio/'));

    if (audioFiles.length === 0) {
      toast.error('Please upload audio files only');
      return;
    }

    const newAudios = audioFiles.map(file => ({
      id: crypto.randomUUID(),
      title: file.name.split('.')[0],
      artist: '',
      album: '',
      description: '',
      file,
      uploadProgress: 0,
      status: 'uploading' as const,
      config: {
        quality: 'music' as const,
        generateTranscript: false,
        normalizeLoudness: true
      }
    }));

    setAudios(prev => [...prev, ...newAudios]);
    newAudios.forEach(audio => uploadAudio(audio));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uploadAudio defined below, stable in practice
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a']
    },
    multiple: true
  });

  const uploadAudio = async (audio: UploadedAudio) => {
    try {
      setIsUploading(true);

      // Upload to storage
      const filePath = `uploads/${audio.id}/${audio.file.name}`;

      const { data: _uploadData, error: uploadError } = await supabase.storage
        .from('audio')
        .upload(filePath, audio.file);

      if (uploadError) throw uploadError;

      setAudios(prev => prev.map(a =>
        a.id === audio.id ? { ...a, uploadProgress: 100 } : a
      ));

      // Create audio record
      const { data: _audioRecord, error: dbError } = await supabase
        .from('audio_files')
        .insert([{
          id: audio.id,
          title: audio.title,
          artist: audio.artist || null,
          album: audio.album || null,
          description: audio.description || null,
          original_filename: audio.file.name,
          storage_path: filePath,
          status: 'uploaded'
        }])
        .select()
        .single();

      if (dbError) throw dbError;

      // Start processing
      const { error: processError } = await supabase.functions.invoke('process-audio', {
        body: {
          action: 'start',
          audioId: audio.id,
          config: audio.config
        }
      });

      if (processError) throw processError;

      setAudios(prev => prev.map(a =>
        a.id === audio.id ? { ...a, status: 'processing' } : a
      ));

      // Poll for processing status
      pollProcessingStatus(audio.id);

      toast.success(`Started processing "${audio.title}"`);
      onUploadComplete?.(audio.id);

    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Failed to upload "${audio.title}"`);
      setAudios(prev => prev.map(a =>
        a.id === audio.id ? { ...a, status: 'error' } : a
      ));
    } finally {
      setIsUploading(false);
    }
  };

  const pollProcessingStatus = async (audioId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const { data: job } = await supabase.functions.invoke('process-audio', {
          body: { action: 'status', jobId: audioId }
        });

        if (job?.job) {
          const { status, progress_percent } = job.job;

          setAudios(prev => prev.map(a =>
            a.id === audioId ? {
              ...a,
              processingProgress: progress_percent,
              status: status === 'completed' ? 'completed' :
                      status === 'failed' ? 'error' : 'processing'
            } : a
          ));

          if (status === 'completed' || status === 'failed') {
            clearInterval(pollInterval);
            if (status === 'completed') {
              toast.success('Audio processing completed!');
            }
          }
        }
      } catch (error) {
        console.error('Status poll error:', error);
      }
    }, 2000);

    // Clean up after 10 minutes
    setTimeout(() => clearInterval(pollInterval), 600000);
  };

  const updateAudioInfo = (id: string, field: keyof UploadedAudio, value: unknown) => {
    setAudios(prev => prev.map(a =>
      a.id === id ? { ...a, [field]: value } : a
    ));
  };

  const updateAudioConfig = (id: string, field: keyof UploadedAudio['config'], value: unknown) => {
    setAudios(prev => prev.map(a =>
      a.id === id ? { ...a, config: { ...a.config, [field]: value } } : a
    ));
  };

  const removeAudio = (id: string) => {
    setAudios(prev => prev.filter(a => a.id !== id));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Upload Zone */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Music style={{ width: 20, height: 20 }} />
            Upload Audio Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box
            {...getRootProps()}
            sx={{
              border: 2,
              borderStyle: 'dashed',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              borderColor: isDragActive ? 'primary.main' : 'divider',
              bgcolor: isDragActive ? 'primary.light' : 'transparent',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            <input {...getInputProps()} />
            <Upload style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
            {isDragActive ? (
              <Typography variant="subtitle1">Drop audio files here...</Typography>
            ) : (
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Drag & drop audio files here, or click to select
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Supports MP3, WAV, AAC, FLAC, OGG, M4A
                </Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Audio List */}
      {audios.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {audios.map((audio) => (
            <Card key={audio.id}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ flexShrink: 0 }}>
                    <Box sx={{ width: 64, height: 64, bgcolor: 'grey.100', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Music style={{ width: 32, height: 32, color: 'var(--muted-foreground)' }} />
                    </Box>
                  </Box>

                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Title</Typography>
                        <Input
                          value={audio.title}
                          onChange={(e) => updateAudioInfo(audio.id, 'title', e.target.value)}
                          placeholder="Track title"
                        />
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Artist</Typography>
                        <Input
                          value={audio.artist}
                          onChange={(e) => updateAudioInfo(audio.id, 'artist', e.target.value)}
                          placeholder="Artist name"
                        />
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Album</Typography>
                        <Input
                          value={audio.album}
                          onChange={(e) => updateAudioInfo(audio.id, 'album', e.target.value)}
                          placeholder="Album name"
                        />
                      </Box>
                    </Box>

                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>Description</Typography>
                      <Textarea
                        value={audio.description}
                        onChange={(e) => updateAudioInfo(audio.id, 'description', e.target.value)}
                        placeholder="Track description"
                        rows={2}
                      />
                    </Box>

                    {/* Processing Options */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Quality</Typography>
                        <Select
                          value={audio.config.quality}
                          onValueChange={(value: string) => updateAudioConfig(audio.id, 'quality', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="podcast">Podcast (Speech optimized)</SelectItem>
                            <SelectItem value="music">Music (Balanced)</SelectItem>
                            <SelectItem value="high">High Quality (Maximum)</SelectItem>
                          </SelectContent>
                        </Select>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Checkbox
                          id={`transcript-${audio.id}`}
                          checked={audio.config.generateTranscript}
                          onCheckedChange={(checked) => updateAudioConfig(audio.id, 'generateTranscript', checked)}
                        />
                        <label
                          htmlFor={`transcript-${audio.id}`}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>Generate transcript</Typography>
                        </label>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Checkbox
                          id={`normalize-${audio.id}`}
                          checked={audio.config.normalizeLoudness}
                          onCheckedChange={(checked) => updateAudioConfig(audio.id, 'normalizeLoudness', checked)}
                        />
                        <label
                          htmlFor={`normalize-${audio.id}`}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>Normalize loudness</Typography>
                        </label>
                      </Box>
                    </Box>

                    {/* Status & Progress */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{
                          width: 8, height: 8, borderRadius: '50%',
                          bgcolor: audio.status === 'completed' ? 'success.main' :
                                   audio.status === 'error' ? 'error.main' : 'warning.main'
                        }} />
                        <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{audio.status}</Typography>
                      </Box>

                      <Typography variant="body2" color="text.secondary">
                        Quality: {audio.config.quality} |
                        {audio.config.generateTranscript ? ' +Transcript' : ''}
                        {audio.config.normalizeLoudness ? ' +Normalized' : ''}
                      </Typography>
                    </Box>

                    {/* Progress Bars */}
                    {audio.status === 'uploading' && (
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">Uploading...</Typography>
                          <Typography variant="body2">{Math.round(audio.uploadProgress)}%</Typography>
                        </Box>
                        <Progress value={audio.uploadProgress} />
                      </Box>
                    )}

                    {audio.status === 'processing' && (
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">Processing audio...</Typography>
                          <Typography variant="body2">{audio.processingProgress || 0}%</Typography>
                        </Box>
                        <Progress value={audio.processingProgress || 0} />
                      </Box>
                    )}
                  </Box>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAudio(audio.id)}

                  >
                    <X style={{ width: 16, height: 16 }} />
                  </Button>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
