import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { Check, X, MapPin } from 'lucide-react';
import type { HydratedPick, PickTier } from '@/hooks/useGuides';

/**
 * One tiered pick in a guide detail page — the Wirecutter block. Entity data
 * comes pre-hydrated via guidePickAdapters, so this renders any entity type
 * with one layout. A pick whose entity is null (deleted or safety-gated for
 * this session) renders nothing.
 */

export function useTierLabels(): Record<PickTier, string> {
  const { t } = useTranslation();
  return {
    top: t('guides.tier.top', 'Our pick'),
    also_great: t('guides.tier.alsoGreat', 'Also great'),
    upgrade: t('guides.tier.upgrade', 'Worth the upgrade'),
    budget: t('guides.tier.budget', 'Budget pick'),
    avoid: t('guides.tier.avoid', 'Skip this one'),
  };
}

export function GuidePickBlock({ pick, index }: { pick: HydratedPick; index: number }) {
  const { t } = useTranslation();
  const tierLabels = useTierLabels();
  const entity = pick.entity;
  if (!entity) return null;

  const heroUrl = resolveImageUrl({ imageUrl: entity.imagePath });

  return (
    <article
      id={`pick-${index + 1}`}
      className="grid grid-cols-12 gap-6 md:gap-10 border-t border-border pt-12 first:border-t-0 first:pt-0"
    >
      <div className="col-span-12 md:col-span-5">
        <div className="md:sticky md:top-24 space-y-4">
          <div className="relative aspect-[4/5] overflow-hidden rounded-container bg-muted">
            {heroUrl ? (
              <img
                src={heroUrl}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}
            {entity.unavailable && (
              <div className="absolute inset-x-0 bottom-0 bg-foreground/80 text-background text-13 text-center py-2">
                {t('guides.pick.unavailable', 'No longer available')}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="col-span-12 md:col-span-7 space-y-6">
        {pick.tier && (
          <p className="inline-flex items-center rounded-badge border border-border px-2 py-1 text-13 uppercase tracking-[0.15em]">
            {tierLabels[pick.tier]}
          </p>
        )}
        <h3 className="text-display leading-tight">
          <LocalizedLink
            to={entity.href}
            className="no-underline hover:underline underline-offset-4"
          >
            {entity.name}
          </LocalizedLink>
        </h3>
        {entity.metaLine && (
          <p className="inline-flex items-center gap-1 text-13 uppercase tracking-[0.1em] text-muted-foreground">
            <MapPin size={12} aria-hidden />
            {entity.metaLine}
          </p>
        )}
        {pick.rationale_md && (
          <p className="text-body-lg leading-relaxed">{pick.rationale_md}</p>
        )}

        {(pick.pros.length > 0 || pick.cons.length > 0) && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-15">
            {pick.pros.length > 0 && (
              <div>
                <dt className="text-13 uppercase tracking-[0.1em] text-muted-foreground mb-2">
                  {t('guides.pick.pros', 'Pros')}
                </dt>
                <dd>
                  <ul className="space-y-2">
                    {pick.pros.map((p, i) => (
                      <li key={i} className="flex gap-2">
                        <Check size={16} className="mt-1 shrink-0" aria-hidden />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {pick.cons.length > 0 && (
              <div>
                <dt className="text-13 uppercase tracking-[0.1em] text-muted-foreground mb-2">
                  {t('guides.pick.cons', 'Cons')}
                </dt>
                <dd>
                  <ul className="space-y-2">
                    {pick.cons.map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <X size={16} className="mt-1 shrink-0" aria-hidden />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        )}

        <div className="pt-2">
          <LocalizedLink
            to={entity.href}
            className="text-13 text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            {t('guides.pick.seeFullPage', 'See full page')}
          </LocalizedLink>
        </div>
      </div>
    </article>
  );
}

export function GuideComparisonTable({ picks }: { picks: HydratedPick[] }) {
  const { t } = useTranslation();
  const tierLabels = useTierLabels();
  const visible = picks.filter((p) => p.tier !== 'avoid' && p.entity);
  if (visible.length < 2) return null;
  return (
    <section className="mt-16">
      <h2 className="text-display mb-6">{t('guides.detail.atAGlance', 'At a glance')}</h2>
      <div className="overflow-x-auto rounded-element border border-border">
        <table className="w-full text-15">
          <thead>
            <tr className="bg-muted">
              <th className="text-left p-4 text-13 uppercase tracking-[0.1em] text-muted-foreground">
                {t('guides.detail.tier', 'Tier')}
              </th>
              <th className="text-left p-4 text-13 uppercase tracking-[0.1em] text-muted-foreground">
                {t('guides.detail.pick', 'Pick')}
              </th>
              <th className="text-left p-4 text-13 uppercase tracking-[0.1em] text-muted-foreground">
                {t('guides.detail.where', 'Where')}
              </th>
              <th className="text-left p-4 text-13 uppercase tracking-[0.1em] text-muted-foreground">
                {t('guides.detail.bestFor', 'Best for')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((pick, i) => (
              <tr key={pick.id} className={i % 2 === 1 ? 'bg-muted/50' : ''}>
                <td className="p-4 align-top text-13 uppercase tracking-[0.1em]">
                  {pick.tier ? tierLabels[pick.tier] : '—'}
                </td>
                <td className="p-4 align-top">
                  <div className="font-medium">{pick.entity?.name}</div>
                  {pick.entity?.categoryLabel && (
                    <div className="text-13 text-muted-foreground">
                      {pick.entity.categoryLabel}
                    </div>
                  )}
                </td>
                <td className="p-4 align-top text-13 text-muted-foreground">
                  {pick.entity?.metaLine ?? '—'}
                </td>
                <td className="p-4 align-top text-13 text-muted-foreground">
                  {pick.pros[0] ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
