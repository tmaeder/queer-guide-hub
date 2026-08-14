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

interface TagSafetyCalloutProps {
  isSensitive?: boolean | null;
  /** `unified_tags.sensitive_topics` — was fetched but never rendered before. */
  topics?: string[] | null;
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
      className="border-[3px] border-foreground bg-foreground p-4 text-background"
    >
      <p className="text-2xs font-bold uppercase tracking-label text-background/70">
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
              className="border-2 border-background px-2 py-1 text-2xs font-bold uppercase tracking-label"
            >
              {humanize(topic)}
            </li>
          ))}
        </ul>
      )}
      <LocalizedLink
        to="/help"
        className="mt-4 inline-block border-2 border-background px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground"
      >
        {t('tags.detail.findSupport', 'Find support')}
      </LocalizedLink>
    </aside>
  );
}
