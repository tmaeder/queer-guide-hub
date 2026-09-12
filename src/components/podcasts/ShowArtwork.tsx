import { useState } from 'react';
import { Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShowArtworkProps {
  show: { name: string; artwork_url: string | null };
  className?: string;
}

/**
 * Square show artwork with an honest fallback.
 *
 * The `onError` handler is not optional decoration. Chrome paints its own
 * torn-page glyph for a failed image even with `alt=""`, so a placeholder
 * layered underneath is not enough on its own — the broken-image icon draws on
 * top of it. Unmounting the `<img>` is what actually reveals the fallback.
 * (Same finding as BrandMark on the marketplace maker plates.)
 *
 * Artwork is hot-linked from the show's own CDN. No R2 mirror: these are
 * publisher-owned assets we do not have a licence to re-host, and the feed is
 * the canonical source for them.
 */
export function ShowArtwork({ show, className }: ShowArtworkProps) {
  const [failed, setFailed] = useState(false);
  const usable = show.artwork_url && !failed;

  return (
    <div className={cn('relative aspect-square w-full overflow-hidden bg-muted', className)}>
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <Headphones className="size-8 text-muted-foreground/40" />
      </div>
      {usable && (
        <img
          src={show.artwork_url!}
          alt=""
          role="presentation"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="relative block size-full object-cover transition-transform duration-slow ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export default ShowArtwork;
