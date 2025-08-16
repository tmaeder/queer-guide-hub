import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Download, SkipBack, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface AudioRendition {
  id: string;
  format: string;
  codec: string;
  container: string;
  bitrate_kbps?: number;
  file_path: string;
  file_size?: number;
}

interface AudioData {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  description?: string;
  duration_seconds?: number;
  poster_image_path?: string;
  transcript_path?: string;
  renditions: AudioRendition[];
}

interface ModernAudioPlayerProps {
  audio: AudioData;
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
}

export function ModernAudioPlayer({
  audio,
  autoplay = false,
  muted = false,
  controls = true,
  className = '',
  onTimeUpdate,
  onEnded
}: ModernAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(muted);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize audio source with modern codec fallback
  useEffect(() => {
    if (!audioRef.current || !audio.renditions.length) return;

    const audioElement = audioRef.current;
    
    // Find renditions by preference: Opus > AAC > MP3
    const opusRendition = audio.renditions.find(r => r.codec === 'opus');
    const aacRendition = audio.renditions.find(r => r.codec === 'aac');
    const mp3Rendition = audio.renditions.find(r => r.codec === 'mp3');

    // Clear existing sources
    audioElement.innerHTML = '';
    
    // Add sources in order of preference
    if (opusRendition && supportsCodec('opus')) {
      addSource(opusRendition, 'audio/webm; codecs=opus');
    }
    if (aacRendition) {
      addSource(aacRendition, 'audio/mp4');
    }
    if (mp3Rendition) {
      addSource(mp3Rendition, 'audio/mpeg');
    }

    function addSource(rendition: AudioRendition, type: string) {
      const source = document.createElement('source');
      source.src = getAudioUrl(rendition.file_path);
      source.type = type;
      audioElement.appendChild(source);
    }

    function supportsCodec(codec: string): boolean {
      const audio = document.createElement('audio');
      return codec === 'opus' ? 
        audio.canPlayType('audio/webm; codecs="opus"') !== '' :
        audio.canPlayType('audio/mp4') !== '';
    }

    // Set Media Session API metadata for lock screen controls
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: audio.title,
        artist: audio.artist || 'Unknown Artist',
        album: audio.album || 'Unknown Album',
        artwork: audio.poster_image_path ? [{
          src: getAudioUrl(audio.poster_image_path),
          sizes: '512x512',
          type: 'image/webp'
        }] : []
      });

      // Set up media session action handlers
      navigator.mediaSession.setActionHandler('play', () => {
        audioElement.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioElement.pause();
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        audioElement.currentTime = Math.max(0, audioElement.currentTime - 10);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        audioElement.currentTime = Math.min(audioElement.duration, audioElement.currentTime + 10);
      });
    }

    // Load the audio
    audioElement.load();

  }, [audio]);

  const getAudioUrl = (path: string): string => {
    return `https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/audio/${path}`;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (newVolume: number[]) => {
    const vol = newVolume[0];
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
      if (vol === 0) {
        setIsMuted(true);
        audioRef.current.muted = true;
      } else if (isMuted) {
        setIsMuted(false);
        audioRef.current.muted = false;
      }
    }
  };

  const handleSeek = (newTime: number[]) => {
    const time = newTime[0];
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const skipBackward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
  };

  const skipForward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 10);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getBestQualityDownload = (): AudioRendition | undefined => {
    // Prefer highest bitrate MP3 for download compatibility
    return audio.renditions
      .filter(r => r.codec === 'mp3')
      .sort((a, b) => (b.bitrate_kbps || 0) - (a.bitrate_kbps || 0))[0] ||
      audio.renditions[0];
  };

  return (
    <div className={`bg-card border rounded-lg overflow-hidden ${className}`}>
      <audio
        ref={audioRef}
        autoPlay={autoplay}
        muted={muted}
        crossOrigin="anonymous"
        onLoadedData={() => {
          setIsLoading(false);
          setDuration(audioRef.current?.duration || 0);
        }}
        onTimeUpdate={() => {
          const currentTime = audioRef.current?.currentTime || 0;
          setCurrentTime(currentTime);
          onTimeUpdate?.(currentTime);
          
          // Update Media Session position
          if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            navigator.mediaSession.setPositionState({
              duration: audioRef.current?.duration || 0,
              playbackRate: audioRef.current?.playbackRate || 1,
              position: currentTime
            });
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
        onVolumeChange={() => {
          if (audioRef.current) {
            setVolume(audioRef.current.volume);
            setIsMuted(audioRef.current.muted);
          }
        }}
      >
        <p>
          Your browser doesn't support audio playback.
          {getBestQualityDownload() && (
            <a 
              href={getAudioUrl(getBestQualityDownload()!.file_path)}
              className="text-blue-400 underline ml-2"
              download
            >
              Download MP3
            </a>
          )}
        </p>
      </audio>

      {/* Album Art / Poster */}
      {audio.poster_image_path && (
        <div className="aspect-square w-full max-w-xs mx-auto p-4">
          <img
            src={getAudioUrl(audio.poster_image_path)}
            alt={`${audio.title} artwork`}
            className="w-full h-full object-cover rounded-lg shadow-lg"
          />
        </div>
      )}

      {/* Track Info */}
      <div className="p-4 text-center">
        <h3 className="font-semibold text-lg mb-1">{audio.title}</h3>
        {audio.artist && (
          <p className="text-muted-foreground mb-2">{audio.artist}</p>
        )}
        {audio.album && (
          <p className="text-sm text-muted-foreground">{audio.album}</p>
        )}
      </div>

      {/* Controls */}
      {controls && !isLoading && (
        <div className="p-4 space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <Slider
              value={[currentTime]}
              max={duration}
              step={1}
              onValueChange={handleSeek}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={skipBackward}
              className="rounded-full"
            >
              <SkipBack className="h-5 w-5" />
            </Button>
            
            <Button
              variant="default"
              size="lg"
              onClick={togglePlay}
              className="rounded-full w-12 h-12"
            >
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={skipForward}
              className="rounded-full"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          {/* Volume & Download */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.05}
                onValueChange={handleVolumeChange}
                className="w-20"
              />
            </div>

            {getBestQualityDownload() && (
              <Button
                variant="ghost"
                size="sm"
                asChild
              >
                <a
                  href={getAudioUrl(getBestQualityDownload()!.file_path)}
                  download={`${audio.title}.mp3`}
                >
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>

          {/* Format Info */}
          <div className="text-xs text-muted-foreground text-center">
            Available: {audio.renditions.map(r => r.codec.toUpperCase()).join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}