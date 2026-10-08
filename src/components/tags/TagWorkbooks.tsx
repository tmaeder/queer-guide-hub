/**
 * TagWorkbooks — the interactive exercises attached to a glossary term.
 *
 * The band is SELF-SELECTING, like TagDiagnosticCodes: it renders only for tags
 * that actually carry a workbook, so nothing in the UI decides "is this a kink
 * term". `/tags/negotiation` grows a band; `/tags/mayonnaise` does not, and no
 * category check is involved either way.
 *
 * WHAT IS AND IS NOT SHOWN HERE
 *
 * This band shows the workbook's title, its summary and how many steps it has.
 * It never shows an answer. Answers live in `tag_workbook_answers`, which has
 * no `anon` grant at all, and they are only read inside the runner — so a
 * signed-out reader, or a crawler, sees that the exercise exists and nothing a
 * reader has written. That split is why the prompts can be public content.
 *
 * It also deliberately does NOT render the steps. A twenty-prompt negotiation
 * is a task with its own progress and partner state, and inlining it here would
 * fight the page's own route strip; the runner lives at /tools/workbook/:slug,
 * beside /tools/checklist, which is already sign-in and opt-in gated and absent
 * from every sitemap.
 */

import { useTranslation } from 'react-i18next';
import { ArrowRight, Lock, Users } from 'lucide-react';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import { useTagWorkbooks, type TagWorkbook } from '@/hooks/useTagWorkbooks';

function stepSummary(wb: TagWorkbook, t: ReturnType<typeof useTranslation>['t']): string {
  if (wb.kind === 'program' && wb.day_count) {
    return t('tags.detail.workbooks.days', '{{count}} days', { count: wb.day_count });
  }
  return t('tags.detail.workbooks.steps', '{{count}} steps', { count: wb.step_count });
}

function WorkbookRow({ wb, locked }: { wb: TagWorkbook; locked: boolean }) {
  const { t } = useTranslation();

  const meta = (
    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-2xs uppercase tracking-label text-muted-foreground">
      <span>{stepSummary(wb, t)}</span>
      {wb.requires_partner ? (
        <span className="inline-flex items-center gap-2">
          <Users className="h-3 w-3" aria-hidden="true" />
          {t('tags.detail.workbooks.withPartner', 'With a partner')}
        </span>
      ) : (
        <span>{t('tags.detail.workbooks.onYourOwn', 'On your own')}</span>
      )}
    </p>
  );

  const inner = (
    <>
      {/* Rank 4 is Space Grotesk 700, never Anton: the display face carries
          hero / display / headline only (docs/design-system/README.md, enforced
          by src/test/__tests__/rankFourFace.test.ts).
          That guard is a line-wise regex over raw source, so this note
          deliberately does not put the two class names next to each other —
          a reflow that made them adjacent would false-positive on a comment. */}
      <h3 className="text-title font-bold leading-tight">{wb.title ?? wb.slug}</h3>
      {wb.dek && <p className="mt-2 text-sm text-muted-foreground">{wb.dek}</p>}
      {meta}
    </>
  );

  // Locked is not an error state and must not look like one: the exercise is
  // real, it just needs a signed-in 18+ profile. Rendering it as a dead div
  // with a reason beats hiding it, because hiding it makes the band's own
  // emptiness ambiguous.
  if (locked) {
    return (
      <li className="rounded-container bg-surface-container p-6">
        {inner}
        <p className="mt-4 inline-flex items-center gap-1.5 text-13 text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {t(
            'tags.detail.workbooks.locked',
            'Sign in and enable your intimate profile to work through this.',
          )}
        </p>
      </li>
    );
  }

  return (
    <li className="relative rounded-container bg-surface-container p-6">
      {inner}
      <p className="mt-4 inline-flex items-center gap-1.5 text-13 font-bold">
        {t('tags.detail.workbooks.start', 'Start')}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </p>
      {/* Overlay sibling, never a wrapper — a card-wide anchor around the
          heading and chips is the nested-interactive violation. min-h-0
          because @layer base gives every button 44px and an inset-0 box on a
          shorter row would hang into the next one. */}
      <LocalizedLink
        to={`/tools/workbook/${wb.slug}`}
        aria-label={t('tags.detail.workbooks.startLabel', 'Start {{title}}', {
          title: wb.title ?? wb.slug,
        })}
        className="absolute inset-0 min-h-0 rounded-container no-underline"
      />
    </li>
  );
}

export function TagWorkbooks({ tagId }: { tagId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: me } = useMyIntimateProfile();
  const { data: workbooks } = useTagWorkbooks(tagId);

  if (!workbooks || workbooks.length === 0) return null;

  const locked = !user || !me?.opted_in_at;

  return (
    <section
      id="workbooks"
      aria-labelledby="workbooks-heading"
      className="border-y border-border-hairline py-8"
    >
      <Eyebrow as="p">{t('tags.detail.workbooks.eyebrow', 'Work through it')}</Eyebrow>
      <h2
        id="workbooks-heading"
        className="mt-2 font-display text-headline leading-tight md:text-display"
      >
        {t('tags.detail.workbooks.title', 'Exercises')}
      </h2>

      <ul className="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2">
        {workbooks.map((wb) => (
          <WorkbookRow key={wb.id} wb={wb} locked={locked} />
        ))}
      </ul>

      <p className="mt-6 text-13 opacity-75">
        {t(
          'tags.detail.workbooks.privacy',
          'Everything you write stays private to you. Nothing is shared with a partner unless you mark that specific answer shareable and they have done the same.',
        )}
      </p>
    </section>
  );
}
