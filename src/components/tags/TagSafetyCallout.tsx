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
 *
 * The topic chips and the support link share one `h-11` box so the row reads as
 * one strip. 44px is not a free choice: `index.css` gives every `a` a
 * `min-height: 44px` tap target, and min-height beats `h-*` at the box-model
 * level — an `h-10` here rendered the chips at 40px and the link at 44px, which
 * is the misalignment this replaced. The chips are `<li>`, so they only match
 * because the number is stated; they are NOT `rounded-badge` and so do not take
 * the 24px chip exemption.
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
      className="bg-foreground p-4 text-background"
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
              className="inline-flex h-11 items-center justify-center border border-background px-4 text-center text-2xs font-bold uppercase tracking-label"
            >
              {humanize(topic)}
            </li>
          ))}
        </ul>
      )}
      <LocalizedLink
        to="/help"
        className="border mt-4 inline-flex h-11 items-center justify-center border-background px-4 text-center text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground"
      >
        {t('tags.detail.findSupport', 'Find support')}
      </LocalizedLink>
    </aside>
  );
}
