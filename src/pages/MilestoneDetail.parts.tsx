import { ExternalLink, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TagChip } from '@/components/tags/TagChip';
import { MilestoneCategoryBadge } from '@/components/milestones/MilestoneCategoryBadge';
import { MilestoneImpactMarker } from '@/components/milestones/MilestoneImpactMarker';
import { MilestoneRow } from '@/components/milestones/MilestoneRow';
import { useMilestonesForCountry } from '@/hooks/useMilestones';
import { formatMilestoneDate } from '@/lib/milestoneDate';
import { detailHref } from '@/lib/searchRoutes';
import type { Milestone, MilestoneLink } from '@/types/milestone';

export function MilestoneHero({ milestone }: { milestone: Milestone }) {
  const { t, i18n } = useTranslation();
  const dateLabel = formatMilestoneDate(
    milestone.date,
    milestone.date_precision,
    i18n.language,
    milestone.date_end,
    milestone.date_end_precision,
  );
  const place = [milestone.city?.name ?? milestone.city_name, milestone.country?.name ?? milestone.country_name]
    .filter(Boolean)
    .join(', ');
  return (
    <header>
      <p className="text-2xs uppercase tracking-wider text-muted-foreground">
        {t('milestones.eyebrow', 'Queer history')}
      </p>
      <p className="mt-2 font-display text-display font-semibold leading-none">{dateLabel}</p>
      <h1 className="mt-2 font-display text-headline-lg font-semibold">{milestone.title}</h1>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <MilestoneImpactMarker impact={milestone.impact} />
        <span className="text-13 text-muted-foreground">
          {t(`milestones.impact.${milestone.impact}`)}
        </span>
        <MilestoneCategoryBadge category={milestone.category} />
        {place && (
          <span className="inline-flex items-center gap-1 text-13 text-muted-foreground">
            <MapPin className="h-3 w-3" aria-hidden />
            {place}
          </span>
        )}
      </div>
    </header>
  );
}

export function MilestoneStory({ milestone }: { milestone: Milestone }) {
  return (
    <section aria-labelledby="milestone-story">
      <p className="whitespace-pre-line text-body-lg leading-relaxed">{milestone.description}</p>
    </section>
  );
}

/** Numbered external-source list — the credibility spine, always visible when present. */
export function MilestoneSources({ milestone }: { milestone: Milestone }) {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="mb-4 font-display text-title font-semibold">
        {t('milestones.sections.sources', 'Sources')}
      </h2>
      <ol className="space-y-2">
        {milestone.sources.map((s, i) => (
          <li key={`${s.label}-${i}`} className="flex items-start gap-2 text-15">
            <span className="mt-0.5 w-5 shrink-0 text-13 text-muted-foreground">{i + 1}.</span>
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2"
              >
                {s.label}
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </a>
            ) : (
              <span>{s.label}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function linkedHref(link: MilestoneLink): string | null {
  return detailHref({ type: link.entity_type, slug: link.slug, id: link.entity_id, title: link.name });
}

export function MilestoneLinkedEntities({ links }: { links: MilestoneLink[] }) {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="mb-4 font-display text-title font-semibold">
        {t('milestones.sections.linked', 'People & places involved')}
      </h2>
      <ul className="space-y-2">
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
                <span className="h-10 w-10 shrink-0 rounded-full bg-muted" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="block truncate text-15 font-medium group-hover:underline">{link.name}</span>
                <span className="block truncate text-13 text-muted-foreground">
                  {link.role || t(`milestones.entityType.${link.entity_type}`)}
                </span>
              </span>
            </span>
          );
          return (
            <li key={`${link.entity_type}-${link.entity_id}`}>
              {href ? (
                <LocalizedLink to={href} className="group block">
                  {body}
                </LocalizedLink>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MilestoneRelated({ milestone }: { milestone: Milestone }) {
  const { t } = useTranslation();
  const { data } = useMilestonesForCountry(milestone.country_id ?? undefined, 8);
  const others = (data ?? []).filter((m) => m.id !== milestone.id);
  if (!others.length) return null;
  return (
    <section>
      <h2 className="mb-4 font-display text-title font-semibold">
        {t('milestones.sections.related', 'More from {{country}}', {
          country: milestone.country?.name ?? milestone.country_name ?? '',
        })}
      </h2>
      <div className="space-y-4">
        {others.map((m) => (
          <MilestoneRow key={m.id} milestone={m} density="compact" />
        ))}
      </div>
    </section>
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
  const { t, i18n } = useTranslation();
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: t('milestones.sidebar.date', 'Date'),
      value: formatMilestoneDate(
        milestone.date,
        milestone.date_precision,
        i18n.language,
        milestone.date_end,
        milestone.date_end_precision,
      ),
    },
  ];
  if (milestone.location) rows.push({ label: t('milestones.sidebar.place', 'Place'), value: milestone.location });
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
        <LocalizedLink to={`/country/${milestone.country.slug}`} className="underline underline-offset-2">
          {milestone.country.name}
        </LocalizedLink>
      ) : (
        milestone.country_name
      ),
    });
  }
  return (
    <aside className="rounded-container border border-border p-6">
      <h2 className="mb-4 text-2xs uppercase tracking-wider text-muted-foreground">
        {t('milestones.sidebar.facts', 'Facts')}
      </h2>
      <dl className="space-y-4">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-13 text-muted-foreground">{r.label}</dt>
            <dd className="text-15">{r.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
