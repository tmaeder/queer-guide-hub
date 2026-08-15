import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PartyPopper } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Band } from './Band';
import { MilestoneImpactMarker } from '@/components/milestones/MilestoneImpactMarker';
import { ParticleBurst } from '@/components/joy/ParticleBurst';
import { useMilestonesOnThisDay } from '@/hooks/useMilestones';
import { useBornThisWeek } from '@/hooks/useBornThisWeek';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { ExternalImg } from '@/components/ui/ExternalImg';
import { useMotionTokens } from '@/lib/motion';
import { isLowEndDevice } from '@/lib/animation';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { getFallbackImage } from '@/utils/fallbackImages';
import { formatProfession } from '@/lib/professionDisplay';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { cn } from '@/lib/utils';

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

/**
 * A birthday chip. The PartyPopper tap is the homepage's sanctioned queer-joy
 * moment: interaction-earned, never on load or scroll, and gated on reduced
 * motion / low-end devices by the marquee decision above it.
 *
 * This lives ONLY on the birthdays half of the band — see the band docstring.
 */
function PersonChip({ person, img }: { person: Person; img: string | null }) {
  const { t } = useTranslation();
  const [burst, setBurst] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  return (
    <div className="relative flex shrink-0 items-center gap-2.5 bg-surface-container py-2 pe-2 ps-2">
      <LocalizedLink
        to={person.slug ? `/personalities/${person.slug}` : '/personalities'}
        className="flex min-w-0 items-center gap-2.5 no-underline"
      >
        <ExternalImg
          src={img}
          cfWidth={96}
          fallbackSrc={getFallbackImage('person', person.id)}
          alt=""
          aria-hidden
          className="h-10 w-10 shrink-0 rounded-full bg-muted object-cover"
        />
        <span className="min-w-0">
          <span className="block truncate text-13 font-semibold tracking-tight">{person.name}</span>
          <span className="block truncate text-xs2 text-muted-foreground">
            {[formatProfession(person.profession), birthYear(person.birth_date)]
              .filter(Boolean)
              .join(' · ')}
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
 * "From the archive" — queer history, in one band with two groups.
 *
 * Merges what used to be two separate bands, "On this day" and "Born this
 * week". Both self-hide on empty and there are only ~110 curated milestones,
 * so on most days the old layout lost one or both sections outright and the
 * page's rhythm collapsed. As one band, a quiet day loses a COLUMN.
 *
 * The motion split is load-bearing and must survive any future refactor: the
 * milestones half is deliberately motion-free because that content includes
 * persecution events, and a celebratory burst over a record of violence is
 * exactly the wrong register. The joy moment belongs to birthdays only.
 *
 * The birthdays query keeps its `is_adult = false` filter with no opt-in
 * parameter — see useBornThisWeek, which records the incident where this rail
 * publicly showed an adult performer under a page that advertised the opposite.
 */
export default function ArchiveBand() {
  const { t, i18n } = useTranslation();
  const { data: milestones } = useMilestonesOnThisDay(3);
  const { items, loading: peopleLoading } = useBornThisWeek(8, 'born');
  const { reduced } = useMotionTokens();

  const people = items as unknown as Person[];
  const ids = useMemo(() => people.map((p) => p.id), [people]);
  const { assets } = useEntityImageAssets('personality', ids);

  const isRtl = (i18n.dir?.() ?? document.documentElement.dir) === 'rtl';
  const marquee = !reduced && !isLowEndDevice();

  const hasMilestones = !!milestones?.length;
  const hasPeople = !peopleLoading && people.length > 0;
  if (!hasMilestones && !hasPeople) return null;

  const imgFor = (p: Person) =>
    resolveImageUrl({
      imageUrl: isValidImageUrl(p.image_url) ? p.image_url : null,
      optimizedUrl: assets.get(p.id)?.optimized_url ?? null,
      thumbnailUrl: assets.get(p.id)?.thumbnail_url ?? null,
      preferThumb: true,
    }) || null;

  const chips = people.map((p) => <PersonChip key={p.id} person={p} img={imgFor(p)} />);

  return (
    <Band
      eyebrow={t('home.archive.eyebrow', 'Queer history')}
      title={t('home.archive.title', 'From the archive')}
      seeAllHref="/history"
      seeAllLabel={t('milestones.home.seeAll', 'Full timeline')}
    >
      {/* Two columns only when there ARE two. With ~110 curated milestones,
          most days have none, and a fixed 2-col grid left the birthdays strip
          in the left half under a full-width Anton heading with the right half
          empty — the band read as broken rather than quiet. */}
      <div className={cn('grid gap-10', hasMilestones && hasPeople && 'lg:grid-cols-2')}>
        {hasMilestones && (
          <section aria-label={t('milestones.home.title', 'On this day')}>
            <Eyebrow as="div" className="mb-4">
              {t('milestones.home.title', 'On this day')}
            </Eyebrow>
            <ul className="m-0 grid list-none gap-6 p-0">
              {milestones!.map((m) => (
                <li key={m.id}>
                  <LocalizedLink to={`/history/${m.slug}`} className="group block no-underline">
                    {/* text-headline, not text-display: a cell inside a band may
                        not carry the same rank as the band's own heading. */}
                    <span className="block font-display text-headline leading-none">
                      {m.date.slice(0, 4)}
                    </span>
                    <span className="mt-2 flex items-start gap-2">
                      <span className="mt-1.5 shrink-0">
                        <MilestoneImpactMarker impact={m.impact} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-title font-bold leading-tight group-hover:underline">
                          {m.title}
                        </span>
                        <span className="block text-13 text-muted-foreground">
                          {[m.city_name, m.country_name].filter(Boolean).join(', ') || ' '}
                          {' · '}
                          {t('milestones.home.yearsAgo', '{{count}} years ago', {
                            count: m.years_ago,
                          })}
                        </span>
                      </span>
                    </span>
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasPeople && (
          <section aria-label={t('home.bornThisWeek.title', 'Born this week')}>
            <Eyebrow as="div" className="mb-4">
              {t('home.bornThisWeek.title', 'Born this week')}
            </Eyebrow>
            {marquee ? (
              <div
                className="group/marquee overflow-hidden"
                style={{ '--gap': '1rem' } as CSSProperties}
              >
                <div
                  className="flex w-max gap-4 group-hover/marquee:[animation-play-state:paused]"
                  style={{
                    animation: `${isRtl ? 'marquee-rev' : 'marquee-fwd'} 40s linear infinite`,
                  }}
                >
                  <div className="flex gap-4 pe-4">{chips}</div>
                  {/* Seamless-loop duplicate — hidden from the a11y tree and
                      inert so its links/buttons are unfocusable. */}
                  <div className="flex gap-4 pe-4" aria-hidden="true" inert>
                    {people.map((p) => (
                      <PersonChip key={`dup-${p.id}`} person={p} img={imgFor(p)} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-scrollbar flex snap-x gap-4 overflow-x-auto pb-2">{chips}</div>
            )}
          </section>
        )}
      </div>
    </Band>
  );
}
