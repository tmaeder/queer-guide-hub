/**
 * TagHankyCodeBand — the handkerchief-code reference table, mounted only on
 * /tags/handkerchief-code.
 *
 * Gating is BAND-LEVEL by design (2026-08-16 brainstorm): the page itself is
 * queer history and stays publicly reachable, while the meanings table sits
 * behind the existing 18+ affirmation. Setting `is_adult` on the tag would
 * not gate the page anyway (the page gate is category-driven) and WOULD
 * delete the term from Safe-Mode discovery — hiding the history instead of
 * its explicit payload. Safe Mode ON replaces the table with a one-line note.
 *
 * Reference only. No part of the product lets anyone "wear" a colour, and the
 * band's copy frames the table as documentation of a 1970s signaling system.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Button } from '@/components/ui/button';
import { AgeAffirmationModal } from '@/components/age-gate/AgeAffirmationModal';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { HANKY_CODE, HANKY_CODE_TAG_SLUG, type HankyCodeEntry } from '@/lib/flags';

function CodeRow({ entry }: { entry: HankyCodeEntry }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-4 border-b-2 border-foreground/15 py-2 last:border-b-0">
      <span
        aria-hidden="true"
        className="h-4 w-8 shrink-0 border-2 border-foreground"
        style={{ backgroundColor: entry.hex }}
      />
      <span className="w-28 shrink-0 text-13 font-bold">{t(entry.colorKey, entry.colorEn)}</span>
      <span className="text-13">{t(entry.meaningKey, entry.meaningEn)}</span>
    </li>
  );
}

export function TagHankyCodeBand({ tagSlug }: { tagSlug: string }) {
  const { t } = useTranslation();
  const safeMode = useSafeMode();
  const { affirmed } = useAgeAffirmation();
  const [requested, setRequested] = useState(false);

  if (tagSlug !== HANKY_CODE_TAG_SLUG) return null;

  const classic = HANKY_CODE.filter((e) => e.tier === 'classic');
  const extended = HANKY_CODE.filter((e) => e.tier === 'extended');

  return (
    <section
      id="hanky-code"
      aria-labelledby="hanky-code-heading"
      className="scroll-mt-24 border-y-4 border-foreground py-8"
    >
      <Eyebrow as="p">{t('tags.detail.hanky.eyebrow', 'Reference')}</Eyebrow>
      <h2
        id="hanky-code-heading"
        className="mt-2 font-display text-headline leading-tight md:text-display"
      >
        {t('tags.detail.hanky.title', 'The code')}
      </h2>
      <p className="mt-2 max-w-reading text-13 leading-relaxed opacity-75">
        {t(
          'tags.detail.hanky.intro',
          'A colour worn in the back pocket signalled a specific interest — left pocket for the giving side, right pocket for the receiving side. Documented here as it was published in the 1980s; meanings varied by city and decade.',
        )}
      </p>

      {safeMode.enabled ? (
        <p className="mt-6 border-[3px] border-foreground p-4 text-13">
          {t(
            'tags.detail.hanky.safeMode',
            'The colour table covers explicit sexual practices and is hidden while Safe Mode is on.',
          )}
        </p>
      ) : !affirmed ? (
        <div className="mt-6 border-[3px] border-foreground bg-foreground p-6 text-background">
          <p className="text-13 leading-relaxed">
            {t(
              'tags.detail.hanky.gateBody',
              'The colour table names explicit sexual practices. Confirm you are 18 or older to read it.',
            )}
          </p>
          <Button
            variant="outline"
            className="mt-4 border-2 border-background bg-transparent text-background hover:bg-background hover:text-foreground"
            onClick={() => setRequested(true)}
            data-testid="hanky-code-reveal"
          >
            {t('tags.detail.hanky.gateCta', 'Show the code (18+)')}
          </Button>
          <AgeAffirmationModal active={requested} onDecline={() => setRequested(false)} />
        </div>
      ) : (
        <div className="mt-6 grid gap-8 sm:grid-cols-2">
          <div>
            <h3 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {t('tags.detail.hanky.classic', 'Classic core (Townsend, 1983)')}
            </h3>
            <ul className="mt-2 list-none p-0">
              {classic.map((e) => (
                <CodeRow key={e.id} entry={e} />
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {t('tags.detail.hanky.extended', 'Common later additions')}
            </h3>
            <ul className="mt-2 list-none p-0">
              {extended.map((e) => (
                <CodeRow key={e.id} entry={e} />
              ))}
            </ul>
            <p className="mt-4 text-13 leading-relaxed opacity-75">
              {t(
                'tags.detail.hanky.disclaimer',
                'Historical reference, not an endorsement of any practice. Dozens of further colours circulated; no two published lists fully agree.',
              )}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
