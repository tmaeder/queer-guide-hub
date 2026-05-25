import { memo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Clock } from 'lucide-react';
import type {
  RecommendedEventGuide,
  EventGuideBoostReason,
} from '@/hooks/useRecommendedEventGuides';
import { resolveImageUrl } from '@/utils/resolveImageUrl';

interface EventGuideCardProps {
  guide: RecommendedEventGuide;
  size?: 'default' | 'hero';
  priority?: boolean;
}

const BOOST_LABEL: Record<EventGuideBoostReason, string> = {
  home_city: 'Near you',
  interest: 'Matches your interests',
  featured: 'Editor’s pick',
};

function WhyChip({ reason }: { reason: EventGuideBoostReason }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-badge border border-border px-2 py-1 text-2xs uppercase tracking-wide text-muted-foreground">
      <span aria-hidden className="size-[6px] rounded-full bg-foreground" />
      {BOOST_LABEL[reason]}
    </span>
  );
}

function Eyebrow({ guide }: { guide: RecommendedEventGuide }) {
  const parts: string[] = ['Guide'];
  if (guide.event_type) parts.push(guide.event_type.replace(/_/g, ' '));
  if (guide.reading_time_min) parts.push(`${guide.reading_time_min} min read`);
  return (
    <p className="text-xs2 uppercase tracking-[0.15em] text-muted-foreground">
      {parts.join(' · ')}
    </p>
  );
}

export const EventGuideCard = memo(function EventGuideCard({
  guide, size = 'default', priority = false,
}: EventGuideCardProps) {
  const hero = resolveImageUrl({ imageUrl: guide.hero_image_path });
  const isHero = size === 'hero';
  return (
    <article
      className={
        isHero
          ? 'col-span-12 grid grid-cols-12 gap-6 rounded-container border border-border overflow-hidden bg-card'
          : 'group flex flex-col rounded-container border border-border overflow-hidden bg-card'
      }
    >
      <LocalizedLink
        to={`/events/guides/${guide.slug}`}
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
            to={`/events/guides/${guide.slug}`}
            className="no-underline hover:underline underline-offset-4"
          >
            {guide.title}
          </LocalizedLink>
        </h3>
        {guide.dek && (
          <p className="italic text-body-lg text-muted-foreground">{guide.dek}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
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
