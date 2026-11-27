/**
 * TagSafetyCallout — a content note on a sensitive glossary term.
 *
 * **No `--destructive` here, deliberately.** The test the design system sets
 * for red is "would a reader be harmed by not noticing this?" A note about a
 * topic the reader navigated to on purpose fails it, and spending red on a
 * definition page devalues red where it counts (the trip-safety briefing, an
 * irreversible confirm). Weight comes from inversion instead: this is the
 * shared one-inverted-panel idiom, ink-flooded with paper type.
 *
 * A sensitive tag page does NOT inherit the crisis-surface carve-out either.
 * That carve-out is scoped by its own justification — on /help every visual
 * distinction a reader makes is a risk judgement — and a glossary entry is
 * wayfinding. Forking the page's colour on `is_sensitive` would also mean the
 * tag's own bullet changed hue by data flag, which is a track colour encoding
 * a state, banned everywhere and not just there.
 *
 * Two constraints DO carry over and are load-bearing: this renders
 * synchronously (never behind a loading branch — a failed ontology or linked
 * content fetch must not be able to blank it), and it carries no animation.
 */

import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Info, LifeBuoy, Tag } from '@/components/icons';

interface TagSafetyCalloutProps {
  isSensitive?: boolean | null;
  /** `unified_tags.sensitive_topics` — was fetched but never rendered before. */
  topics?: string[] | null;
}

/** The /help situation a topic most likely needs; none = the default crisis view. */
function helpNeed(topics: string[]): string | null {
  const joined = topics.join(' ');
  if (/substance|drug|chemsex|alcohol/.test(joined)) return 'drugs';
  if (/sexual[-_ ]?(violence|assault)|rape/.test(joined)) return 'sexual-assault';
  if (/violence|abuse|hate/.test(joined)) return 'violence';
  if (/sti|hiv|sexual[-_ ]?health/.test(joined)) return 'sti';
  return null;
}

function humanize(topic: string): string {
  return topic.replace(/[-_]+/g, ' ');
}

export function TagSafetyCallout({ isSensitive, topics }: TagSafetyCalloutProps) {
  const { t } = useTranslation();
  if (!isSensitive) return null;
  const list = (topics ?? []).filter(Boolean);

  return (
    <aside
      role="note"
      aria-label={t('tags.detail.contentNote', 'Content note')}
      className="rounded-panel bg-foreground p-4 text-background"
    >
      <p className="flex items-center gap-2 text-2xs font-bold uppercase tracking-label text-background/70">
        <Info size={14} aria-hidden />
        {t('tags.detail.contentNote', 'Content note')}
      </p>
      <p className="mt-2 text-13 leading-relaxed text-background/90">
        {t(
          'tags.detail.contentNoteBody',
          'This entry covers a subject some readers find difficult. Nothing here is graphic, and the page is a definition, not advice.',
        )}
      </p>
      {list.length > 0 && (
        <ul className="mt-4 flex list-none flex-wrap gap-2 p-0">
          {list.map((topic) => (
            <li
              key={topic}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-element bg-background/15 px-4 text-center text-2xs font-bold uppercase tracking-label"
            >
              <Tag size={14} aria-hidden />
              {humanize(topic)}
            </li>
          ))}
        </ul>
      )}
      <LocalizedLink
        to={helpNeed(list) ? `/help?need=${helpNeed(list)}` : '/help'}
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-element bg-background px-4 text-center text-13 font-bold text-foreground no-underline transition-opacity hover:opacity-90"
      >
        <LifeBuoy size={16} aria-hidden />
        {t('tags.detail.findSupport', 'Find support')}
      </LocalizedLink>
    </aside>
  );
}
