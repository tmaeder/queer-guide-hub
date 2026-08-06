import * as React from 'react';
import { buildCfImageUrl } from '@/utils/cloudflareOptimizations';
import { imageReferrerPolicy } from '@/utils/imageHost';

/**
 * Drop-in `<img>` for the hand-rolled card/rail images that hotlink external
 * hosts (publisher CDNs, stock photos). Serves the CF-resized copy first
 * (multi-MB originals → right-sized webp through img.queer.guide), degrades to
 * the untouched raw URL if CF's fetcher can't pull that host, and only then to
 * the caller's fallback texture. Keeps the call site's own markup — for the
 * full treatment (aspect frames, fade-in, source ladder) use `<Image>` instead.
 */
interface ExternalImgProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError' | 'referrerPolicy'> {
  src: string | null | undefined;
  /** Explicit so jsx-a11y can see it (empty string for decorative images). */
  alt: string;
  /** CF resize width — roughly 2× the rendered CSS width for retina. */
  cfWidth: number;
  /** Final fallback (deterministic texture); rendered when src is missing or both fetches fail. */
  fallbackSrc: string;
}

type Stage = 'cf' | 'raw' | 'fallback';

export const ExternalImg = ({
  src,
  alt,
  cfWidth,
  fallbackSrc,
  loading = 'lazy',
  decoding = 'async',
  ...rest
}: ExternalImgProps) => {
  const raw = src && src.trim() !== '' ? src : null;
  const cf = raw ? buildCfImageUrl(raw, { width: cfWidth }) : null;
  const initial: Stage = !raw ? 'fallback' : cf !== raw ? 'cf' : 'raw';

  const [stage, setStage] = React.useState<Stage>(initial);
  // Reset during render (not an effect) when the source prop changes, so a
  // list re-use of the element can't keep a stale failure stage.
  const [renderedSrc, setRenderedSrc] = React.useState(raw);
  if (renderedSrc !== raw) {
    setRenderedSrc(raw);
    setStage(initial);
  }

  const resolved = stage === 'cf' ? (cf as string) : stage === 'raw' ? (raw as string) : fallbackSrc;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError is a media-error handler, not a user-input listener.
    <img
      src={resolved}
      alt={alt}
      referrerPolicy={imageReferrerPolicy(resolved)}
      loading={loading}
      decoding={decoding}
      onError={
        stage === 'fallback'
          ? undefined
          : () => setStage((s) => (s === 'cf' && raw ? 'raw' : 'fallback'))
      }
      {...rest}
    />
  );
};
ExternalImg.displayName = 'ExternalImg';
