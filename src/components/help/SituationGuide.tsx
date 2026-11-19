/**
 * SituationPicker + SituationGuide — /help for more than a mental-health crisis.
 *
 * Animation-free (crisis page rule). The picker is a set of links-as-buttons
 * that write `?need=` so a situation can be linked and shared; the guide puts
 * the one time-critical fact first, then short first steps, then lines and
 * services. Mental health keeps the existing CrisisTriage, so it is not
 * rendered here.
 */

import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, ExternalLink } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { HotlineRow } from './HotlineRow';
import { SITUATIONS, type Situation, type SituationId } from './situations';
import type { Hotline } from '@/types/cms';

export function SituationPicker({
  value,
  onChange,
}: {
  value: SituationId;
  onChange: (id: SituationId) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-labelledby="help-need" className="mt-6">
      <h2 id="help-need" className="font-display text-headline leading-tight">
        {t('help.need_title', 'What’s happening?')}
      </h2>
      <ul className="m-0 mt-4 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {SITUATIONS.map((s) => {
          const active = s.id === value;
          const Icon = s.icon;
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(s.id)}
                className={`flex min-h-16 w-full items-center gap-4 rounded-container px-4 py-2 text-left transition-colors ${
                  active ? 'bg-foreground text-background' : 'bg-card shadow-soft hover:bg-muted'
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                    active ? 'bg-background/15' : 'bg-muted'
                  }`}
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-15 font-bold leading-tight">
                    {t(`help.need.${s.id}.label`, s.label)}
                  </span>
                  <span
                    className={`block text-13 ${active ? 'text-background/70' : 'text-muted-foreground'}`}
                  >
                    {t(`help.need.${s.id}.hint`, s.hint)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SituationGuide({
  situation,
  lines,
  isBookmarked,
  toggleBookmark,
}: {
  situation: Situation;
  lines: Hotline[];
  isBookmarked: (id: string) => boolean;
  toggleBookmark: (id: string) => void;
}) {
  const { t } = useTranslation();
  const key = `help.need.${situation.id}`;
  return (
    <section aria-labelledby="help-situation" className="mt-8">
      <h2 id="help-situation" className="font-display text-headline leading-tight md:text-display">
        {t(`${key}.label`, situation.label)}
      </h2>

      {situation.urgent && (
        <p className="mt-4 flex gap-2 rounded-container bg-destructive p-4 text-15 font-bold leading-snug text-destructive-foreground">
          <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" />
          {t(`${key}.urgent`, situation.urgent)}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="rounded-container bg-card p-6 shadow-soft md:p-8">
          <h3 className="text-title font-bold leading-tight">
            {t('help.need_steps', 'What to do')}
          </h3>
          <ol className="m-0 mt-4 list-none space-y-4 p-0">
            {situation.steps.map((step, i) => (
              <li key={i} className="flex gap-4 text-15 leading-relaxed">
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-13 font-bold"
                >
                  {i + 1}
                </span>
                <span>{t(`${key}.step_${i + 1}`, step)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-6">
          {situation.external.length > 0 && (
            <div className="rounded-container bg-card p-6 shadow-soft">
              <h3 className="text-title font-bold leading-tight">
                {t('help.need_services', 'Services that can help')}
              </h3>
              <ul className="m-0 mt-4 list-none space-y-2 p-0">
                {situation.external.map((e) => (
                  <li key={e.href}>
                    <a
                      href={e.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start justify-between gap-4 rounded-element bg-muted p-4 text-inherit no-underline hover:bg-foreground hover:text-background"
                    >
                      <span>
                        <span className="block text-15 font-bold">{e.name}</span>
                        <span className="block text-13 opacity-80">{e.note}</span>
                      </span>
                      <ExternalLink size={16} aria-hidden className="mt-1 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {situation.links.length > 0 && (
            <div className="rounded-container bg-card p-6 shadow-soft">
              <h3 className="text-title font-bold leading-tight">
                {t('help.need_read', 'Read more')}
              </h3>
              <ul className="m-0 mt-4 flex list-none flex-wrap gap-2 p-0">
                {situation.links.map((l) => (
                  <li key={l.to}>
                    <LocalizedLink
                      to={l.to}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-element bg-muted px-4 text-13 font-bold text-inherit no-underline hover:bg-foreground hover:text-background"
                    >
                      {l.label}
                      <ArrowRight size={14} aria-hidden className="rtl:rotate-180" />
                    </LocalizedLink>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-title font-bold leading-tight">
          {t('help.need_lines', 'Lines that can help')}
        </h3>
        {lines.length > 0 ? (
          <ul className="m-0 mt-4 list-none border-y border-border-hairline p-0">
            {lines.map((h) => (
              <li key={h.id} className="border-b border-border-hairline last:border-b-0">
                <HotlineRow
                  hotline={h}
                  isKept={isBookmarked(h.id)}
                  toggleKeep={toggleBookmark}
                  showCountry={false}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-15 text-muted-foreground">
            {t(
              'help.need_no_lines',
              'No line for this in our directory for this country yet. The LGBTQ+ lines below can point you to local services.',
            )}
          </p>
        )}
      </div>
    </section>
  );
}
