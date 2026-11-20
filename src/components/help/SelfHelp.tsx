/**
 * SelfHelp — "Not ready to talk?" coping techniques, inline on /help.
 * Was a side sheet; it now sits on the page so nothing has to be opened.
 * Animation-free (crisis page rule). The emergency number is already on the
 * page above, and Quick exit / Hide screen were removed from /help by owner
 * decision (2026-11-18), so neither is repeated here.
 */

import { useTranslation } from 'react-i18next';
import { Download, Wind, Hand, FileText, ExternalLink } from '@/components/icons';

export function SelfHelp() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="self-help-title" className="mt-8">
      <h3 id="self-help-title" className="text-title font-bold leading-tight">
        {t('help.self_help_trigger', 'Not ready to talk?')}
      </h3>
      <p className="mt-1 text-13 leading-relaxed text-muted-foreground">
        {t(
          'help.self_help_desc',
          'Short techniques you can use while you wait, or instead of a call if you’re not ready.',
        )}
      </p>
      {/* One column: this sits in the narrow side panel of the triage, where
          three columns squeezed each card to a word per line. */}
      <div className="mt-4 flex flex-col gap-4">
        <div className="rounded-container bg-card p-6 shadow-soft">
          <h4 className="flex items-center gap-4 text-15 font-bold leading-tight">
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full bg-muted"
            >
              <Wind size={18} />
            </span>
            {t('help.breathing_title', '4-7-8 breathing')}
          </h4>
          <ol className="m-0 mt-4 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {[
              t('help.breathing_1', 'Breathe in through your nose for 4 seconds.'),
              t('help.breathing_2', 'Hold your breath for 7 seconds.'),
              t('help.breathing_3', 'Breathe out through your mouth for 8 seconds.'),
              t('help.breathing_4', 'Repeat 4 times.'),
            ].map((step, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-element bg-muted px-4 py-2 text-13 leading-relaxed"
              >
                <span aria-hidden className="font-bold tabular-nums">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-container bg-card p-6 shadow-soft">
          <h4 className="flex items-center gap-4 text-15 font-bold leading-tight">
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full bg-muted"
            >
              <Hand size={18} />
            </span>
            {t('help.grounding_title', '5-4-3-2-1 grounding')}
          </h4>
          <p className="mt-4 text-13 leading-relaxed text-muted-foreground">
            {t('help.grounding_intro', 'Name, out loud or in your head:')}
          </p>
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
            {[
              t('help.grounding_5', '5 things you can see'),
              t('help.grounding_4', '4 things you can touch'),
              t('help.grounding_3', '3 things you can hear'),
              t('help.grounding_2', '2 things you can smell'),
              t('help.grounding_1', '1 thing you can taste'),
            ].map((item) => (
              <li key={item} className="rounded-element bg-muted px-4 py-2 text-13">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-container bg-card p-6 shadow-soft">
          <h4 className="flex items-center gap-4 text-15 font-bold leading-tight">
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full bg-muted"
            >
              <FileText size={18} />
            </span>
            {t('help.safety_plan_title', 'Safety plan')}
          </h4>
          <p className="mt-4 text-13 leading-relaxed text-muted-foreground">
            {t(
              'help.safety_plan_desc',
              'A short written plan you can pull up when things get bad — your warning signs, coping steps, people to call, and reasons to live.',
            )}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <a
              href="/downloads/my-safety-plan.pdf"
              download
              className="inline-flex min-h-11 items-center gap-2 rounded-element bg-foreground px-4 text-13 font-bold text-background no-underline hover:opacity-90"
            >
              <Download size={16} aria-hidden />
              {t('help.safety_plan_download', 'Download plan (PDF)')}
            </a>
            <a
              href="https://suicidesafetyplan.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-13 text-muted-foreground"
            >
              {t('help.safety_plan_link_original', 'Original Stanley-Brown')}
              <ExternalLink size={12} aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
