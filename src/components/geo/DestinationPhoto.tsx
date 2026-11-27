import { Image } from '@/components/ui/Image';
import { ImageCredit } from '@/components/ui/ImageCredit';
import { DESTINATION_PHOTO_SIZES, DESTINATION_PHOTO_WIDTHS } from './destinationPhotoImage';

export function DestinationPhoto({
  src,
  name,
  metadata,
}: {
  src: string | null | undefined;
  name: string;
  metadata?: unknown;
}) {
  if (!src) return null;

  const details = metadata as
    | {
        alt?: string;
        attribution?: string;
        photographer?: string;
        license?: string;
        photographer_url?: string;
      }
    | null
    | undefined;
  const credit = details?.attribution || details?.photographer;
  const source = details?.photographer_url;
  const attribution = <ImageCredit attribution={credit} license={details?.license} />;

  return (
    <figure className="m-0 min-w-0" data-testid="destination-title-photo">
      <div className="overflow-hidden rounded-panel">
        <Image
          src={src}
          alt={details?.alt || name}
          aspect="card"
          rounded="none"
          priority
          // The edge preloads this exact request (functions/_lib/heroPreload.ts);
          // both read these two values so the preload is the image, not a twin.
          sizes={DESTINATION_PHOTO_SIZES}
          widths={DESTINATION_PHOTO_WIDTHS}
        />
      </div>
      {(credit || details?.license) && (
        <figcaption className="mt-2 text-2xs text-muted-foreground">
          {typeof source === 'string' && /^https:\/\//i.test(source) ? (
            <a href={source} className="underline underline-offset-2">
              {attribution}
            </a>
          ) : (
            attribution
          )}
        </figcaption>
      )}
    </figure>
  );
}
