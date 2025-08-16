import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
  className = '',
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
      console.log('🎬 Using HLS adaptive streaming');
    } else {
      // Progressive fallback with codec preference
      videoElement.innerHTML = '';
      
      if (av1Rendition && supportsCodec('av01')) {
        addSource(av1Rendition, 'video/webm; codecs="av01.0.05M.08,opus"');
      }
      if (vp9Rendition && supportsCodec('vp9')) {
        addSource(vp9Rendition, 'video/webm; codecs="vp9,opus"');
      }
      if (h264Rendition) {
        addSource(h264Rendition, 'video/mp4; codecs="avc1.4d401f,mp4a.40.2"');
      }
      
      // Add captions
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
    <div className={`relative bg-black rounded-lg overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        className="w-full h-full"
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
        <p className="text-white p-4">
          Your browser doesn't support embedded videos.
          {video.renditions.find(r => r.codec === 'h264') && (
            <a 
              href={getVideoUrl(video.renditions.find(r => r.codec === 'h264')!.file_path)}
              className="text-blue-400 underline ml-2"
              download
            >
              Download MP4
            </a>
          )}
        </p>
      </video>

      {/* Simple Controls */}
      {controls && !isLoading && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePlay}
              className="text-white hover:bg-white/20"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            
            <span className="text-white text-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            
            {video.renditions.find(r => r.codec === 'h264') && (
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
                asChild
              >
                <a
                  href={getVideoUrl(video.renditions.find(r => r.codec === 'h264')!.file_path)}
                  download={video.title || 'video.mp4'}
                >
                  <Download className="h-5 w-5" />
                </a>
              </Button>
            )}
          </div>
        </div>
      )}

      {video.title && (
        <div className="absolute top-4 left-4">
          <h3 className="text-white text-lg font-semibold drop-shadow-lg">
            {video.title}
          </h3>
        </div>
      )}
    </div>
  );
}