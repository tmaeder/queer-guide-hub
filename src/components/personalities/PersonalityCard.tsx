import { memo, useState } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Star } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { StationPlate } from '@/components/ui/StationPlate';
import { StationBadge } from '@/components/ui/StationBadge';
import { personGlyph } from '@/lib/cardGlyphs';
import type { Personality } from '@/hooks/usePersonalities';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { buildCfSrcSet } from '@/utils/cloudflareOptimizations';
import { personalityProfessionLabel } from '@/lib/professionDisplay';
import { useTranslation } from 'react-i18next';
import { localizedCountryName } from '@/lib/localizedCountryName';
import {
  CONNECTION_LABELS,
  publicConnection,
  type PersonalityEditorial,
} from '@/lib/personalityEditorial';
import { PersonalityText } from './PersonalityText';

interface PersonalityCardProps {
  editorial?: PersonalityEditorial;
  personality?: Personality;
  loading?: boolean;
  onClick?: () => void;
  optimizedUrl?: string | null;
  thumbnailUrl?: string | null;
}

function formatEra(p: Personality, t: (key: string, fallback: string) => string): string | null {
  if (p.is_living) return t('pages.personalities.ui.living', 'Living');
  const birthYear = p.birth_date ? new Date(p.birth_date).getFullYear() : null;
  const deathYear = p.death_date ? new Date(p.death_date).getFullYear() : null;
  if (birthYear && deathYear) return `${birthYear}–${deathYear}`;
  if (birthYear) return `${t('pages.personalities.ui.born', 'Born')} ${birthYear}`;
  if (deathYear) return `${t('pages.personalities.ui.died', 'Died')} ${deathYear}`;
  return p.is_living === false ? t('pages.personalities.ui.historical', 'Historical') : null;
}

export function PersonalityCardSkeleton() {
  return (
    // Matches the card's own frame — this was `bg-background` against a
    // `bg-surface-container` card, so the grid visibly changed colour as it
    // loaded.
    <div className="flex h-full flex-col bg-card rounded-container shadow-soft">
      <div className="relative aspect-[3/4] w-full border-b border-border-hairline bg-muted">
        <Skeleton className="absolute inset-0 h-full w-full rounded-container" />
      </div>
      <div className="p-4">
        <Skeleton className="mb-2 h-4 w-3/4" />
        <Skeleton className="mb-2 h-4 w-[55%]" />
        <Skeleton className="h-4 w-[65%]" />
      </div>
    </div>
  );
}

function PersonalityCardImpl({
  personality,
  editorial,
  loading,
  onClick,
  optimizedUrl,
  thumbnailUrl,
}: PersonalityCardProps) {
  const { t, i18n } = useTranslation();
  const [imgError, setImgError] = useState(false);

  if (loading || !personality) {
    return <PersonalityCardSkeleton />;
  }

  const era = formatEra(personality, t);
  // Grid cards are small — prefer the 400px thumbnail as src; only fall back
  // to full optimized_url when no thumbnail exists.
  const resolvedImageUrl = resolveImageUrl({
    imageUrl: personality.image_url,
    optimizedUrl,
    thumbnailUrl,
    preferThumb: true,
  });
  // Multi-stop srcset via CF Image Resizing when the asset is on img.queer.guide;
  // fall back to two-stop thumb/original pair for external images.
  const srcSet = optimizedUrl
    ? (buildCfSrcSet(optimizedUrl, [400, 800, 1200]) ??
      (thumbnailUrl ? `${thumbnailUrl} 400w, ${optimizedUrl} 1600w` : undefined))
    : undefined;
  const showImage = Boolean(resolvedImageUrl) && !imgError;
  const glyph = personGlyph(personality.profession);
  const metaParts = [
    era,
    localizedCountryName(personality.nationality, i18n?.resolvedLanguage || i18n?.language || 'en'),
  ].filter(Boolean) as string[];
  const href = `/personalities/${personality.slug ?? personality.id}`;

  const connection = publicConnection(editorial);
  const label = connection?.category
    ? t(`pages.personalities.ui.${connection.category}`, CONNECTION_LABELS[connection.category])
    : undefined;
  const snippet = connection?.details || label || personality.description || personality.bio;
  const field = connection?.details
    ? 'lgbti_details'
    : label
      ? 'connection_label'
      : personality.description
        ? 'description'
        : 'bio';
  return (
    <LocalizedLink
      to={href}
      onClick={onClick}
      /* No hover effects at all (no lift, no marker animation, no preview
         pop-up): the card is a plain link and already shows the summary. */
      className="personality-card flex h-full cursor-pointer touch-manipulation flex-col bg-card text-inherit no-underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 rounded-container shadow-soft"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Portrait. `aspect-[3/4]` replaces a `paddingTop: 133.33%` box and an
          inline foreground-alpha gradient — both pre-rebrand idioms. */}
      <div className="relative aspect-[3/4] w-full overflow-hidden border-b border-border-hairline bg-muted">
        {showImage ? (
          <img
            src={resolvedImageUrl!}
            srcSet={srcSet}
            sizes="(max-width: 640px) 160px, (max-width: 1024px) 200px, 250px"
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="personality-card-image absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          // No portrait: the station plate with the profession's mark, the
          // same image-less art as venue, event and hotel cards.
          <StationPlate theme="person" fallbackKey={personality.id} icon={glyph} />
        )}

        {personality.is_featured && (
          <div className="pointer-events-none absolute right-2 top-2 flex select-none items-center gap-1 rounded-badge bg-foreground px-2 py-1 text-2xs font-bold text-background">
            <Star size={10} fill="currentColor" color="currentColor" aria-hidden="true" />
            <span>{t('pages.personalities.ui.featured', 'Featured')}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={showImage ? 'flex-grow px-4 pb-4' : 'flex-grow p-4'}>
        {/* A portrait card carries the profession's mark on the seam; the
            plate already draws it when there is no portrait. */}
        {showImage && <StationBadge glyph={glyph} className="-mt-8 mb-2" />}
        <h3 className="truncate text-title font-bold leading-tight text-foreground">
          {personality.name}
        </h3>
        {personality.profession && (
          <p className="mt-1 truncate text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {personalityProfessionLabel(
              personality.profession,
              t,
              editorial?.translations.profession,
            )}
          </p>
        )}
        {metaParts.length > 0 && (
          <p className="mt-1 truncate text-13 tabular-nums text-muted-foreground">
            {metaParts.join(' · ')}
          </p>
        )}
        {snippet && (
          <PersonalityText
            value={snippet}
            field={field}
            editorial={field === 'connection_label' ? undefined : editorial}
            descriptionI18n={personality.description_i18n}
            className="mt-1.5 text-13 leading-snug text-muted-foreground [&>p]:line-clamp-3"
          />
        )}
      </div>
    </LocalizedLink>
  );
}

// Memoized: rendered in personality grids — skip re-render when props are
// referentially stable.
export const PersonalityCard = memo(PersonalityCardImpl);
