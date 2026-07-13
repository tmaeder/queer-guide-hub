import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PartyPopper } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { HomeSection } from './HomeSection';
import { ParticleBurst } from '@/components/joy/ParticleBurst';
import { useBornThisWeek } from '@/hooks/useBornThisWeek';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useMotionTokens } from '@/lib/motion';
import { isLowEndDevice } from '@/lib/animation';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { getFallbackImage } from '@/utils/fallbackImages';
import { formatProfession } from '@/lib/professionDisplay';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

type Person = {
  id: string;
  slug: string | null;
  name: string;
  image_url: string | null;
  profession: string | null;
  birth_date: string | null;
};

function birthYear(iso: string | null): string | null {
  if (!iso) return null;
  const y = new Date(iso).getUTCFullYear();
  return Number.isFinite(y) ? String(y) : null;
}

function PersonChip({ person, img }: { person: Person; img: string }) {
  const { t } = useTranslation();
  const [burst, setBurst] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  return (
    <div className="relative flex shrink-0 items-center gap-2.5 rounded-element border border-border bg-background py-2 ps-2 pe-2">
      <LocalizedLink
        to={person.slug ? `/personalities/${person.slug}` : '/personalities'}
        className="flex min-w-0 items-center gap-2.5 no-underline"
      >
        <img
          src={img}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const fb = getFallbackImage('person', person.id);
            if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
          }}
          className="h-10 w-10 shrink-0 rounded-full bg-muted object-cover"
        />
        <span className="min-w-0">
          <span className="block truncate text-13 font-semibold tracking-tight">{person.name}</span>
          <span className="block truncate text-xs2 text-muted-foreground">
            {[formatProfession(person.profession), birthYear(person.birth_date)].filter(Boolean).join(' · ')}
          </span>
        </span>
      </LocalizedLink>
      <button
        type="button"
        aria-label={t('home.bornThisWeek.celebrate', 'Celebrate {{name}}', { name: person.name })}
        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        disabled={celebrated}
        onClick={() => {
          setBurst(true);
          setCelebrated(true);
        }}
      >
        <PartyPopper className="h-4 w-4" aria-hidden="true" />
        {burst && <ParticleBurst onDone={() => setBurst(false)} />}
      </button>
    </div>
  );
}

/**
 * "Born this week" — a marquee strip of community figures with birthdays in a
 * ±3-day window, on the page's one dotted-texture band. The PartyPopper tap is
 * the homepage's sanctioned queer-joy moment (interaction-earned, gated).
 * Degrades to a static snap rail under reduced motion / low-end devices.
 */
export default function HomeBornThisWeek() {
  const { t, i18n } = useTranslation();
  const { items, loading } = useBornThisWeek(8, 'born');
  const { reduced } = useMotionTokens();
  const isRtl = (i18n.dir?.() ?? document.documentElement.dir) === 'rtl';
  const marquee = !reduced && !isLowEndDevice();

  const people = items as unknown as Person[];
  const ids = useMemo(() => people.map((p) => p.id), [people]);
  const { assets } = useEntityImageAssets('personality', ids);

  if (loading || people.length === 0) return null;

  const imgFor = (p: Person) =>
    resolveImageUrl({
      imageUrl: isValidImageUrl(p.image_url) ? p.image_url : null,
      optimizedUrl: assets.get(p.id)?.optimized_url ?? null,
      thumbnailUrl: assets.get(p.id)?.thumbnail_url ?? null,
      preferThumb: true,
    }) || getFallbackImage('person', p.id);

  const chips = people.map((p) => <PersonChip key={p.id} person={p} img={imgFor(p)} />);

  return (
    <HomeSection
      eyebrow={t('home.bornThisWeek.eyebrow', 'Community history')}
      title={t('home.bornThisWeek.title', 'Born this week')}
      seeAllHref="/personalities"
      seeAllLabel={t('home.bornThisWeek.seeAll', 'All personalities')}
      className="bg-grid-dots border-y border-border"
    >
      {marquee ? (
        <div className="group/marquee overflow-hidden" style={{ '--gap': '1rem' } as CSSProperties}>
          <div
            className="flex w-max gap-4 group-hover/marquee:[animation-play-state:paused]"
            style={{ animation: `${isRtl ? 'marquee-rev' : 'marquee-fwd'} 40s linear infinite` }}
          >
            <div className="flex gap-4 pe-4">{chips}</div>
            {/* Seamless-loop duplicate — hidden from a11y tree and inert so its
                links/buttons are unfocusable. */}
            <div className="flex gap-4 pe-4" aria-hidden="true" inert>
              {people.map((p) => (
                <PersonChip key={`dup-${p.id}`} person={p} img={imgFor(p)} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x no-scrollbar">{chips}</div>
      )}
    </HomeSection>
  );
}
