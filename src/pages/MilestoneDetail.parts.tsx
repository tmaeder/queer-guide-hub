import { useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TagChip } from '@/components/tags/TagChip';
import { MilestoneCategoryBadge } from '@/components/milestones/MilestoneCategoryBadge';
import { MilestoneImpactMarker } from '@/components/milestones/MilestoneImpactMarker';
import { MilestoneRow } from '@/components/milestones/MilestoneRow';
import { useMilestonesForCountry, useMilestonesTimeline } from '@/hooks/useMilestones';
import { eraForYear } from '@/config/historyEras';
import { FactGrid } from '@/components/transit/FactGrid';
import { DetailMasthead } from '@/components/transit/DetailMasthead';
import { SingleSection } from '@/components/transit/SinglePage';
import { SidebarCard, SidebarRow } from '@/components/transit/SidebarCard';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { isRestrainedMilestone } from '@/lib/historyEraGrouping';
import { formatMilestoneDate, milestoneYear } from '@/lib/milestoneDate';
import { displayableMilestoneImage } from '@/lib/milestoneImage';
import { detailHref } from '@/lib/searchRoutes';
import { cn } from '@/lib/utils';
import type { Milestone, MilestoneLink } from '@/types/milestone';

export function MilestoneHero({ milestone }: { milestone: Milestone }) {
  const { t, i18n } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = imageFailed ? null : displayableMilestoneImage(milestone.image_url);
  const dateLabel = formatMilestoneDate(
    milestone.date,
    milestone.date_precision,
    i18n.language,
    milestone.date_end,
    milestone.date_end_precision,
  );
  const era = eraForYear(milestoneYear(milestone.date));
  // Persecution/negative milestones keep imagery documentary-sized — never a
  // full-bleed celebratory hero.
  const restrained = isRestrainedMilestone(milestone, era);
  return (
    // A plain div: DetailMasthead already renders the <header>, and nesting one
    // inside another is a landmark smell for no benefit.
    <div>
      {/* The date is the masthead's status chip rather than a second
          text-display slab stacked above the title: rank 2 belongs to the title
          alone. The chip is an ink outline, so it cannot be mistaken for a
          filled track. `type="milestone"` supplies the pink M route bullet, the
          same mark this entity carries everywhere else in the product. `lead`
          is deliberately unset — Milestone has no standfirst column, and
          passing `description` would duplicate MilestoneStory verbatim. */}
      <DetailMasthead
        type="milestone"
        eyebrow={t('milestones.eyebrow', 'Queer history')}
        title={milestone.title}
        status={dateLabel}
      />
      {/* Module 01 — the fact strip. These five facts were a chip row unique to
          this type; the grid is the same grid every other single uses, which is
          spec rule 1: "a rider who learns one single has learned all thirteen."
          Impact and category keep their own markers as VALUES — the module
          renders nodes, so the milestone-specific semantics survive the move.
          PLACE is deliberately NOT here: the sidebar already carries Place, City
          and Country as LINKS, and the spine's rule is that a headline fact
          lives once. A flat "Zurich, Switzerland" string in the strip would
          both duplicate the sidebar and be the worse of the two copies. */}
      <FactGrid
        className="mt-6"
        facts={[
          {
            label: t('milestones.facts.impact', 'Impact'),
            value: (
              <span className="inline-flex items-center gap-2">
                <MilestoneImpactMarker impact={milestone.impact} />
                {t(`milestones.impact.${milestone.impact}`)}
              </span>
            ),
          },
          {
            label: t('milestones.facts.category', 'Category'),
            value: <MilestoneCategoryBadge category={milestone.category} />,
          },
          {
            label: t('milestones.facts.era', 'Era'),
            // `milestones.partOf` shipped in all 12 locales but had no caller —
            // #2678 replaced the era chip with a bare link, which left
            // e2e/history-timeline.spec.ts asserting a "Part of:" link that no
            // longer existed. Restoring the phrasing turns that test green and
            // gives the link an accessible name that says what it does.
            value: (
              <LocalizedLink to={`/history#era-${era.slug}`}>
                {t('milestones.partOf', 'Part of: {{era}}', { era: t(era.titleKey) })}
              </LocalizedLink>
            ),
          },
        ]}
      />
      {imageUrl && (
        <figure className={cn('mt-6', restrained ? 'max-w-sm' : '')}>
          <span className="block overflow-hidden border-[3px] border-foreground bg-muted">
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError is a media-error handler, not a user-input listener. */}
            <img
              src={imageUrl}
              alt={milestone.image_metadata?.alt ?? ''}
              onError={() => setImageFailed(true)}
              className={cn('w-full object-cover', restrained ? 'max-h-64' : 'aspect-[16/10]')}
            />
          </span>
          {(milestone.image_metadata?.photographer || milestone.image_metadata?.license) && (
            <figcaption className="mt-1 text-13 text-muted-foreground">
              {t('milestones.photoCredit', 'Photo')}
              {milestone.image_metadata?.photographer
                ? `: ${milestone.image_metadata.photographer}`
                : ''}
              {milestone.image_metadata?.license ? ` · ${milestone.image_metadata.license}` : ''}
            </figcaption>
          )}
        </figure>
      )}
      {/* Spine position S4: breadcrumb → bullet/kicker → title/standfirst →
          TAGS → action. They used to render as the sixth body section, between
          "Elsewhere in {year}" and prev/next, which is nowhere in that order. */}
      {milestone.tags.length > 0 && (
        <div className="mt-6">
          <MilestoneTags milestone={milestone} />
        </div>
      )}
    </div>
  );
}

export function MilestoneStory({ milestone }: { milestone: Milestone }) {
  const { t } = useTranslation();
  return (
    // `aria-labelledby="milestone-story"` pointed at an id that never existed.
    // A real heading is the fix; max-w-[68ch] is the measure cap VenueOverview
    // already uses — without it the widened frame runs ~118 characters a line.
    <SingleSection title={t('milestones.sections.story', 'What happened')}>
      <p className="max-w-[68ch] whitespace-pre-line text-body-lg leading-relaxed">
        {milestone.description}
      </p>
    </SingleSection>
  );
}

/** Numbered external-source list — the credibility spine, always visible when present. */
export function MilestoneSources({ milestone }: { milestone: Milestone }) {
  const { t } = useTranslation();
  return (
    <SingleSection title={t('milestones.sections.sources', 'Sources')}>
      <ol className="space-y-2">
        {milestone.sources.map((s, i) => (
          <li key={`${s.label}-${i}`} className="flex items-start gap-2 text-15">
            <span className="mt-0.5 w-5 shrink-0 text-13 text-muted-foreground">{i + 1}.</span>
            {s.url ? (
              <span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  {s.label}
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
                {sourceHostname(s.url) && (
                  <span className="ml-2 text-13 text-muted-foreground">
                    {sourceHostname(s.url)}
                  </span>
                )}
              </span>
            ) : (
              <span>{s.label}</span>
            )}
          </li>
        ))}
      </ol>
    </SingleSection>
  );
}

function sourceHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function linkedHref(link: MilestoneLink): string | null {
  return detailHref({
    type: link.entity_type,
    slug: link.slug,
    id: link.entity_id,
    title: link.name,
  });
}

export function MilestoneLinkedEntities({ links }: { links: MilestoneLink[] }) {
  const { t } = useTranslation();
  return (
    <SingleSection title={t('milestones.sections.linked', 'People & places involved')}>
      {/* Deliberately NOT NestedEntityCard, which has no image slot. Dropping
          the portraits off an LGBTQ+ history page has a representational cost
          the design system recognises elsewhere (it is why `duotone` is opt-in
          rather than the default treatment for faces). So: the card frame and
          the cross-type RouteBullet from that module — rule 4, a person shows a
          pink P, an organization a green O — kept alongside the avatar. */}
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
        {links.map((link) => {
          const href = linkedHref(link);
          const body = (
            <span className="flex min-w-0 items-center gap-4">
              {link.image_url ? (
                <img
                  src={link.image_url}
                  alt=""
                  loading="lazy"
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <RouteBullet type={link.entity_type} size={40} />
              )}
              <span className="min-w-0">
                <span className="block truncate font-display text-title leading-tight group-hover:underline">
                  {link.name}
                </span>
                <span className="block truncate text-13 text-muted-foreground">
                  {link.role || t(`milestones.entityType.${link.entity_type}`)}
                </span>
              </span>
            </span>
          );
          return (
            <li key={`${link.entity_type}-${link.entity_id}`}>
              {href ? (
                <LocalizedLink
                  to={href}
                  className="card-lift group block border-[3px] border-foreground bg-background p-4 no-underline"
                >
                  {body}
                </LocalizedLink>
              ) : (
                // No resolvable route — a plate, but not a lift: nothing to
                // click, so nothing should imply it.
                <span className="block border-[3px] border-foreground bg-background p-4">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </SingleSection>
  );
}

export function MilestoneRelated({ milestone }: { milestone: Milestone }) {
  const { t } = useTranslation();
  const { data } = useMilestonesForCountry(milestone.country_id ?? undefined, 8);
  const others = (data ?? []).filter((m) => m.id !== milestone.id);
  if (!others.length) return null;
  return (
    <SingleSection
      title={t('milestones.sections.related', 'More from {{country}}', {
        country: milestone.country?.name ?? milestone.country_name ?? '',
      })}
    >
      <div className="space-y-4">
        {others.map((m) => (
          <MilestoneRow key={m.id} milestone={m} density="compact" />
        ))}
      </div>
    </SingleSection>
  );
}

/** ≤4 milestones from the same year in other countries — the global-context lens. */
export function MilestoneSameYear({ milestone }: { milestone: Milestone }) {
  const { t } = useTranslation();
  const year = milestoneYear(milestone.date);
  const { data } = useMilestonesTimeline({ fromYear: year, toYear: year }, 12);
  const countryLabel = milestone.country?.name ?? milestone.country_name;
  const others = (data ?? [])
    .filter((m) => m.id !== milestone.id && (m.country?.name ?? m.country_name) !== countryLabel)
    .slice(0, 4);
  if (!others.length) return null;
  return (
    <SingleSection
      title={t('milestones.sections.sameYear', 'Elsewhere in {{year}}', { year })}
      note={t(
        'milestones.sections.sameYearNote',
        'What was happening in other countries the same year.',
      )}
    >
      <div className="space-y-4">
        {others.map((m) => (
          <MilestoneRow key={m.id} milestone={m} density="compact" />
        ))}
      </div>
    </SingleSection>
  );
}

/** Prev/next major milestone on the timeline — keeps detail pages walkable. */
export function MilestonePrevNext({ milestone }: { milestone: Milestone }) {
  const { t } = useTranslation();
  if (!milestone.prev && !milestone.next) return null;
  return (
    <nav
      aria-label={t('milestones.timelineNav', 'Timeline navigation')}
      // The 4px ink rule is the system's block separator — the same edge
      // SinglePage puts above its footer block.
      className="grid gap-4 border-t-4 border-foreground pt-8 sm:grid-cols-2"
    >
      {milestone.prev ? (
        <LocalizedLink
          to={`/history/${milestone.prev.slug}`}
          className="card-lift group block border-[3px] border-foreground bg-background p-4 no-underline"
        >
          <span className="inline-flex items-center gap-1 text-13 text-muted-foreground">
            <ArrowLeft className="h-3 w-3" aria-hidden />
            {t('milestones.prev', 'Earlier')} · {milestoneYear(milestone.prev.date)}
          </span>
          <span className="mt-1 block font-display text-title leading-tight group-hover:underline">
            {milestone.prev.title}
          </span>
        </LocalizedLink>
      ) : (
        <span />
      )}
      {milestone.next ? (
        <LocalizedLink
          to={`/history/${milestone.next.slug}`}
          className="card-lift group block border-[3px] border-foreground bg-background p-4 no-underline sm:text-right"
        >
          <span className="inline-flex items-center gap-1 text-13 text-muted-foreground">
            {t('milestones.next', 'Later')} · {milestoneYear(milestone.next.date)}
            <ArrowRight className="h-3 w-3" aria-hidden />
          </span>
          <span className="mt-1 block font-display text-title leading-tight group-hover:underline">
            {milestone.next.title}
          </span>
        </LocalizedLink>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function MilestoneTags({ milestone }: { milestone: Milestone }) {
  return (
    <div className="flex flex-wrap gap-2">
      {milestone.tags.map((tag) => (
        <TagChip key={tag} tag={tag} size="sm" />
      ))}
    </div>
  );
}

export function MilestoneSidebar({ milestone }: { milestone: Milestone }) {
  const { t } = useTranslation();
  // No Date row: the date is the masthead's status chip now, and a headline
  // fact lives once — the same rule that already keeps Place out of the
  // FactGrid (see the comment in MilestoneHero).
  const rows: Array<{ label: string; value: React.ReactNode }> = [];
  if (milestone.location)
    rows.push({ label: t('milestones.sidebar.place', 'Place'), value: milestone.location });
  if (milestone.city?.slug ?? milestone.city_name) {
    rows.push({
      label: t('milestones.sidebar.city', 'City'),
      value: milestone.city?.slug ? (
        <LocalizedLink to={`/city/${milestone.city.slug}`} className="underline underline-offset-2">
          {milestone.city.name}
        </LocalizedLink>
      ) : (
        milestone.city_name
      ),
    });
  }
  if (milestone.country?.slug ?? milestone.country_name) {
    rows.push({
      label: t('milestones.sidebar.country', 'Country'),
      value: milestone.country?.slug ? (
        <LocalizedLink
          to={`/country/${milestone.country.slug}`}
          className="underline underline-offset-2"
        >
          {milestone.country.name}
        </LocalizedLink>
      ) : (
        milestone.country_name
      ),
    });
  }
  const exploreLinks: Array<{ label: string; to: string }> = [];
  if (milestone.country?.slug) {
    exploreLinks.push({
      label: t('milestones.explore.country', 'Travel guide: {{name}}', {
        name: milestone.country.name,
      }),
      to: `/country/${milestone.country.slug}`,
    });
  }
  if (milestone.city?.slug) {
    exploreLinks.push({
      label: t('milestones.explore.city', 'City guide: {{name}}', { name: milestone.city.name }),
      to: `/city/${milestone.city.slug}`,
    });
  }
  const cityLabel = milestone.city?.name ?? milestone.city_name;
  if (cityLabel) {
    // /events supports a city name filter (legacy ?city= param) — country-level
    // event filtering doesn't exist, so the link stays city-scoped.
    exploreLinks.push({
      label: t('milestones.explore.events', 'Events in {{name}} today', { name: cityLabel }),
      to: `/events?city=${encodeURIComponent(cityLabel)}`,
    });
  }
  // gap-4 matches SinglePage's rail. Tinted-fill panels were the pre-rebrand
  // idiom; SidebarCard is the 3px ink plate every other single stacks.
  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (
        <SidebarCard eyebrow={t('milestones.sidebar.facts', 'Facts')}>
          {rows.map((r) => (
            <SidebarRow key={r.label} label={r.label} value={r.value} />
          ))}
        </SidebarCard>
      )}
      {exploreLinks.length > 0 && (
        <SidebarCard eyebrow={t('milestones.sidebar.explore', 'Then & now')}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {exploreLinks.map((l) => (
              <li key={l.to}>
                <LocalizedLink to={l.to} className="text-13 underline underline-offset-2">
                  {l.label}
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </SidebarCard>
      )}
    </div>
  );
}
