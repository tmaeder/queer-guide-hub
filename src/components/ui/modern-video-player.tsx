import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Hls from 'hls.js';

interface VideoRendition {
  id: string;
  format: 'progressive' | 'hls' | 'dash';
  codec: 'av1' | 'vp9' | 'h264';
  container: 'webm' | 'mp4' | 'm3u8' | 'mpd';
  resolution: string;
  width?: number;
  height?: number;
  bitrate_kbps?: number;
  file_path: string;
}

interface VideoData {
  id: string;
  title?: string;
  description?: string;
  duration_seconds?: number;
  poster_image_path?: string;
  captions_path?: string;
  renditions: VideoRendition[];
}

interface ModernVideoPlayerProps {
  video: VideoData;
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
}

export function ModernVideoPlayer({
  video,
  autoplay = false,
  muted = false,
  controls = true,
  onTimeUpdate,
  onEnded
}: ModernVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize video source with modern codec fallback
  useEffect(() => {
    if (!videoRef.current || !video.renditions.length) return;

    const videoElement = videoRef.current;

    // Find renditions by preference: HLS adaptive > AV1 > VP9 > H.264
    const hlsRendition = video.renditions.find(r => r.format === 'hls');
    const av1Rendition = video.renditions.find(r => r.codec === 'av1');
    const vp9Rendition = video.renditions.find(r => r.codec === 'vp9');
    const h264Rendition = video.renditions.find(r => r.codec === 'h264');

    // Try HLS adaptive streaming first
    if (hlsRendition && Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(getVideoUrl(hlsRendition.file_path));
      hls.attachMedia(videoElement);
    } else {
      // Progressive fallback with codec preference - secure clearing
      while (videoElement.firstChild) {
        videoElement.removeChild(videoElement.firstChild);
      }

      if (av1Rendition && supportsCodec('av01')) {
        addSource(av1Rendition, 'video/webm; codecs="av01.0.05M.08,opus"');
      }
      if (vp9Rendition && supportsCodec('vp9')) {
        addSource(vp9Rendition, 'video/webm; codecs="vp9,opus"');
      }
      if (h264Rendition) {
        addSource(h264Rendition, 'video/mp4; codecs="avc1.4d401f,mp4a.40.2"');
      }

      // Add captions securely
      if (video.captions_path) {
        const track = document.createElement('track');
        track.kind = 'captions';
        track.src = getVideoUrl(video.captions_path);
        track.srclang = 'en';
        track.label = 'English';
        track.default = true;
        videoElement.appendChild(track);
      }
    }

    function addSource(rendition: VideoRendition, type: string) {
      const source = document.createElement('source');
      source.src = getVideoUrl(rendition.file_path);
      source.type = type;
      videoElement.appendChild(source);
    }

    function supportsCodec(codec: string): boolean {
      const video = document.createElement('video');
      return codec === 'av01' ?
        video.canPlayType('video/webm; codecs="av01.0.05M.08"') !== '' :
        video.canPlayType('video/webm; codecs="vp9"') !== '';
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [video]);

  const getVideoUrl = (path: string): string => {
    return `https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/videos/${path}`;
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const posterUrl = video.poster_image_path ? getVideoUrl(video.poster_image_path) : undefined;

  return (
    <div style={{ position: 'relative', backgroundColor: 'hsl(0 0% 2%)', borderRadius: 8, overflow: 'hidden' }}>
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%' }}
        autoPlay={autoplay}
        muted={muted}
        playsInline
        poster={posterUrl}
        preload="metadata"
        onLoadedData={() => {
          setIsLoading(false);
          setDuration(videoRef.current?.duration || 0);
        }}
        onTimeUpdate={() => {
          const currentTime = videoRef.current?.currentTime || 0;
          setCurrentTime(currentTime);
          onTimeUpdate?.(currentTime);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
      >
        <p style={{ color: 'hsl(0 0% 100%)', padding: 16 }}>
          Your browser doesn't support embedded videos.
          {video.renditions.find(r => r.codec === 'h264') && (
            <a
              href={getVideoUrl(video.renditions.find(r => r.codec === 'h264')!.file_path)}
              style={{ color: 'hsl(var(--brand))', textDecoration: 'underline', marginLeft: 8 }}
              download
            >
              Download MP4
            </a>
          )}
        </p>
      </video>

      {/* Simple Controls */}
      {controls && !isLoading && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(to top, hsl(0 0% 0% / 0.8), transparent)',
          padding: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePlay}
              style={{ color: 'hsl(0 0% 100%)' }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause style={{ height: 20, width: 20 }} /> : <Play style={{ height: 20, width: 20 }} />}
            </Button>

            <span style={{ color: 'hsl(0 0% 100%)', fontSize: '0.875rem' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {video.renditions.find(r => r.codec === 'h264') && (
              <Button
                variant="ghost"
                size="sm"
                style={{ color: 'hsl(0 0% 100%)' }}
                asChild
              >
                <a
                  href={getVideoUrl(video.renditions.find(r => r.codec === 'h264')!.file_path)}
                  download={video.title || 'video.mp4'}
                  aria-label="Download video"
                >
                  <Download style={{ height: 20, width: 20 }} />
                </a>
              </Button>
            )}
          </div>
        </div>
      )}

      {video.title && (
        <div style={{ position: 'absolute', top: 16, left: 16 }}>
          <h3 style={{ color: 'hsl(0 0% 100%)', fontSize: '1.125rem', fontWeight: 600, textShadow: '0 2px 4px hsl(0 0% 0% / 0.5)', margin: 0 }}>
            {video.title}
          </h3>
        </div>
      )}
    </div>
  );
}
