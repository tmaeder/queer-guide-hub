import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Music, X, Play } from 'lucide-react';
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
  const [isUploading, setIsUploading] = useState(false);

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
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('audio')
        .upload(filePath, audio.file);

      if (uploadError) throw uploadError;

      setAudios(prev => prev.map(a => 
        a.id === audio.id ? { ...a, uploadProgress: 100 } : a
      ));

      // Create audio record
      const { data: audioRecord, error: dbError } = await supabase
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

  const updateAudioInfo = (id: string, field: keyof UploadedAudio, value: any) => {
    setAudios(prev => prev.map(a => 
      a.id === id ? { ...a, [field]: value } : a
    ));
  };

  const updateAudioConfig = (id: string, field: keyof UploadedAudio['config'], value: any) => {
    setAudios(prev => prev.map(a => 
      a.id === id ? { ...a, config: { ...a.config, [field]: value } } : a
    ));
  };

  const removeAudio = (id: string) => {
    setAudios(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Upload Audio Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-lg">Drop audio files here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">
                  Drag & drop audio files here, or click to select
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports MP3, WAV, AAC, FLAC, OGG, M4A
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Audio List */}
      {audios.length > 0 && (
        <div className="space-y-4">
          {audios.map((audio) => (
            <Card key={audio.id}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                      <Music className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </div>
                  
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium">Title</label>
                        <Input
                          value={audio.title}
                          onChange={(e) => updateAudioInfo(audio.id, 'title', e.target.value)}
                          placeholder="Track title"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Artist</label>
                        <Input
                          value={audio.artist}
                          onChange={(e) => updateAudioInfo(audio.id, 'artist', e.target.value)}
                          placeholder="Artist name"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Album</label>
                        <Input
                          value={audio.album}
                          onChange={(e) => updateAudioInfo(audio.id, 'album', e.target.value)}
                          placeholder="Album name"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        value={audio.description}
                        onChange={(e) => updateAudioInfo(audio.id, 'description', e.target.value)}
                        placeholder="Track description"
                        rows={2}
                      />
                    </div>

                    {/* Processing Options */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                      <div>
                        <label className="text-sm font-medium">Quality</label>
                        <Select
                          value={audio.config.quality}
                          onValueChange={(value: any) => updateAudioConfig(audio.id, 'quality', value)}
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
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`transcript-${audio.id}`}
                          checked={audio.config.generateTranscript}
                          onCheckedChange={(checked) => updateAudioConfig(audio.id, 'generateTranscript', checked)}
                        />
                        <label 
                          htmlFor={`transcript-${audio.id}`}
                          className="text-sm font-medium"
                        >
                          Generate transcript
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`normalize-${audio.id}`}
                          checked={audio.config.normalizeLoudness}
                          onCheckedChange={(checked) => updateAudioConfig(audio.id, 'normalizeLoudness', checked)}
                        />
                        <label 
                          htmlFor={`normalize-${audio.id}`}
                          className="text-sm font-medium"
                        >
                          Normalize loudness
                        </label>
                      </div>
                    </div>

                    {/* Status & Progress */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          audio.status === 'completed' ? 'bg-green-500' :
                          audio.status === 'error' ? 'bg-red-500' :
                          'bg-yellow-500'
                        }`} />
                        <span className="text-sm capitalize">{audio.status}</span>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        Quality: {audio.config.quality} | 
                        {audio.config.generateTranscript ? ' +Transcript' : ''}
                        {audio.config.normalizeLoudness ? ' +Normalized' : ''}
                      </div>
                    </div>

                    {/* Progress Bars */}
                    {audio.status === 'uploading' && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Uploading...</span>
                          <span>{Math.round(audio.uploadProgress)}%</span>
                        </div>
                        <Progress value={audio.uploadProgress} />
                      </div>
                    )}

                    {audio.status === 'processing' && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Processing audio...</span>
                          <span>{audio.processingProgress || 0}%</span>
                        </div>
                        <Progress value={audio.processingProgress || 0} />
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAudio(audio.id)}
                    className="flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}