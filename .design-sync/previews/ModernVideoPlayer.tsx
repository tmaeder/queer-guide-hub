import { ModernVideoPlayer } from 'queer-guide';
import { StaticState } from './_static';

// Rendition points at a non-loading path — player chrome renders, poster
// area stays empty (capture is offline by design).
const POSTER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#262626"/><circle cx="1000" cy="200" r="90" fill="#404040"/><path d="M0 720 L440 320 L720 600 L920 420 L1280 720 Z" fill="#383838"/></svg>`,
  );

const VIDEO = {
  id: 'v1',
  title: 'Pride in Reykjavík — city guide',
  poster_image_path: POSTER,
  description: 'Three days of Reykjavík Pride, from the parade to the pools.',
  duration_seconds: 184,
  renditions: [
    {
      format: 'progressive' as const,
      codec: 'h264' as const,
      container: 'mp4' as const,
      resolution: '1080p',
      width: 1920,
      height: 1080,
      file_path: '/video/reykjavik-pride-1080.mp4',
    },
  ],
};

export const Default = () => (
  <>
    <StaticState />
    <div className="w-[560px] max-w-full">
      <ModernVideoPlayer video={VIDEO} />
    </div>
  </>
);
