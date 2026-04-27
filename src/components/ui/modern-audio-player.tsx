import { useRef, useState, useEffect } from 'react';
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

    // Securely clear existing sources without innerHTML
    while (audioElement.firstChild) {
      audioElement.removeChild(audioElement.firstChild);
    }

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
    <div style={{
      backgroundColor: 'hsl(var(--background))',
      overflow: 'hidden',
    }}>
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
              style={{ color: 'hsl(var(--brand))', textDecoration: 'underline', marginLeft: 8 }}
              download
            >
              Download MP3
            </a>
          )}
        </p>
      </audio>

      {/* Album Art / Poster */}
      {audio.poster_image_path && (
        <div style={{ aspectRatio: '1/1', width: '100%', maxWidth: 320, margin: '0 auto', padding: 16 }}>
          <img
            src={getAudioUrl(audio.poster_image_path)}
            alt={`${audio.title} artwork`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, boxShadow: '0 10px 15px -3px hsl(var(--foreground) / 0.1)' }}
          />
        </div>
      )}

      {/* Track Info */}
      <div style={{ padding: 16, textAlign: 'center' }}>
        <h3 style={{ fontWeight: 600, fontSize: '1.125rem', marginBottom: 4, margin: 0 }}>{audio.title}</h3>
        {audio.artist && (
          <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: 8, margin: '4px 0' }}>{audio.artist}</p>
        )}
        {audio.album && (
          <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>{audio.album}</p>
        )}
      </div>

      {/* Controls */}
      {controls && !isLoading && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Progress Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Slider
              value={[currentTime]}
              max={duration}
              step={1}
              onValueChange={handleSeek}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))' }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={skipBackward}
              style={{ borderRadius: '50%' }}
              aria-label="Skip backward"
            >
              <SkipBack style={{ height: 20, width: 20 }} />
            </Button>

            <Button
              variant="default"
              size="lg"
              onClick={togglePlay}
              style={{ borderRadius: '50%', width: 48, height: 48 }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause style={{ height: 24, width: 24 }} /> : <Play style={{ height: 24, width: 24 }} />}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={skipForward}
              style={{ borderRadius: '50%' }}
              aria-label="Skip forward"
            >
              <SkipForward style={{ height: 20, width: 20 }} />
            </Button>
          </div>

          {/* Volume & Download */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
                aria-label={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX style={{ height: 16, width: 16 }} />
                ) : (
                  <Volume2 style={{ height: 16, width: 16 }} />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.05}
                onValueChange={handleVolumeChange}
                style={{ width: 80 }}
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
                  aria-label="Download audio"
                >
                  <Download style={{ height: 16, width: 16 }} />
                </a>
              </Button>
            )}
          </div>

          {/* Format Info */}
          <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
            Available: {audio.renditions.map(r => r.codec.toUpperCase()).join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}
