import { memo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Clock } from 'lucide-react';
import { resolveImageUrl } from '@/utils/resolveImageUrl';

/**
 * Entity-agnostic editorial guide card. Used by the marketplace, venue,
 * and event guide streams. Each surface passes its own URL prefix and
 * the small set of fields it actually displays.
 *
 * Replaces the three near-identical per-surface GuideCard files (about
 * 350 LOC of duplication after the third surface shipped). New surfaces
 * (news, hotels, etc.) compose this directly.
 */

export type EditorialBoostReason =
  | 'home_city'
  | 'interest'
  | 'category_affinity'
  | 'featured'
  | 'continue_reading';

export interface EditorialGuideSummary {
  id: string;
  slug: string;
  title: string;
  dek: string | null;
  hero_image_path: string | null;
  /** Free-form: "underwear" / "bar" / "pride" — surface decides what to render. */
  category_label: string | null;
  reading_time_min: number | null;
  pick_count: number;
  boost_reason: EditorialBoostReason | null;
}

const BOOST_LABEL: Record<EditorialBoostReason, string> = {
  home_city: 'Near you',
  interest: 'Matches your interests',
  category_affinity: 'Picks for you',
  featured: 'Editor’s pick',
  continue_reading: 'Continue reading',
};

function WhyChip({ reason }: { reason: EditorialBoostReason }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-badge border border-border px-2 py-1 text-2xs uppercase tracking-wide text-muted-foreground">
      <span aria-hidden className="size-[6px] rounded-full bg-foreground" />
      {BOOST_LABEL[reason]}
    </span>
  );
}

function Eyebrow({ guide }: { guide: EditorialGuideSummary }) {
  const parts: string[] = ['Guide'];
  if (guide.category_label) parts.push(guide.category_label.replace(/_/g, ' '));
  if (guide.reading_time_min) parts.push(`${guide.reading_time_min} min read`);
  return (
    <p className="text-xs2 uppercase tracking-[0.15em] text-muted-foreground">
      {parts.join(' · ')}
    </p>
  );
}

interface EditorialGuideCardProps {
  guide: EditorialGuideSummary;
  /** e.g. '/marketplace/guides' or '/venues/guides'. No trailing slash. */
  basePath: string;
  size?: 'default' | 'hero';
  priority?: boolean;
}

export const EditorialGuideCard = memo(function EditorialGuideCard({
  guide,
  basePath,
  size = 'default',
  priority = false,
}: EditorialGuideCardProps) {
  const hero = resolveImageUrl({ imageUrl: guide.hero_image_path });
  const isHero = size === 'hero';
  const detailUrl = `${basePath}/${guide.slug}`;

  return (
    <article
      className={
        isHero
          ? 'col-span-12 grid grid-cols-12 gap-6 rounded-container border border-border overflow-hidden bg-card'
          : 'group flex flex-col rounded-container border border-border overflow-hidden bg-card'
      }
    >
      <LocalizedLink
        to={detailUrl}
        className={
          isHero
            ? 'col-span-12 md:col-span-7 relative block aspect-[16/10] md:aspect-auto bg-muted'
            : 'relative block aspect-[16/9] overflow-hidden bg-muted'
        }
        aria-label={`Open guide: ${guide.title}`}
      >
        {hero ? (
          <img
            src={hero}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground text-xs2 uppercase tracking-[0.15em]">
            Editorial
          </div>
        )}
      </LocalizedLink>

      <div
        className={
          isHero
            ? 'col-span-12 md:col-span-5 flex flex-col gap-4 p-8'
            : 'flex flex-1 flex-col gap-4 p-6'
        }
      >
        <Eyebrow guide={guide} />
        <h3
          className={
            isHero
              ? 'text-headline-lg md:text-display leading-tight'
              : 'text-title md:text-headline leading-tight'
          }
        >
          <LocalizedLink
            to={detailUrl}
            className="no-underline hover:underline underline-offset-4"
          >
            {guide.title}
          </LocalizedLink>
        </h3>
        {guide.dek && (
          <p className="italic text-body-lg text-muted-foreground">{guide.dek}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className="inline-flex items-center gap-2 text-13 text-muted-foreground">
            <Clock size={14} aria-hidden />
            {guide.pick_count} picks
          </span>
          {guide.boost_reason && <WhyChip reason={guide.boost_reason} />}
        </div>
      </div>
    </article>
  );
});
