// src/components/rights/__tests__/TransSafetyBand.test.tsx
import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { TransSafetyBand } from '../TransSafetyBand';
import { LGR_VOCABULARY } from '../../../../supabase/functions/_shared/rights/ilgaVocabulary';

/**
 * The band had no render test, which is why the `self_id` defect survived the
 * PR that fixed the identical defect on `requires_surgery` one row below it.
 * `ilgaVocabulary.test.ts` guards the READERS; nothing guarded what the
 * component does with them, and the bug lived entirely in that gap.
 *
 * So these assert on rendered output, and they iterate `LGR_VOCABULARY` rather
 * than a hand-written list — a value ILGA adds later cannot quietly fall into
 * the else-branch without failing here.
 */

function band(lgr: Record<string, unknown>) {
  // The band renders a TGEU LocalizedLink, so it needs Router context.
  return renderWithProviders(<TransSafetyBand country={{ lgbti_gender_recognition: lgr }} />);
}

/**
 * The row renders `label` and `value` as DIRECT-CHILD sibling spans of one
 * `<li>`; the optional note is a span nested inside the label span. The
 * `:scope >` is load-bearing — a bare `span:last-child` matches the nested
 * note first in document order and silently returns the wrong text.
 */
function valueFor(label: string): string | null {
  const li = screen.queryByText(label)?.closest('li');
  if (!li) return null;
  return (li.querySelector(':scope > span:last-child')?.textContent ?? '').trim();
}

describe('TransSafetyBand — self_id is never an affirmative false negative', () => {
  const SELF_ID_LABEL = 'By self-determination';

  it('says Yes only for a bare "Yes"', () => {
    band({ self_id: 'Yes' });
    expect(valueFor(SELF_ID_LABEL)).toBe('Yes');
  });

  it('says No for a recorded "No"', () => {
    band({ self_id: 'No' });
    expect(valueFor(SELF_ID_LABEL)).toBe('No');
  });

  /**
   * The defect, stated as a test. Measured on prod 2026-09-03 across the 244
   * countries with a non-empty `lgbti_gender_recognition`: 70 `No data`,
   * 7 `Varies`, 4 `Unclear`, 2 `N/A` — 83 rows that printed "No" for a fact
   * nobody recorded.
   */
  it.each([
    ['No data', null],
    ['Varies', 'Unclear'],
    ['Unclear', 'Unclear'],
    ['N/A', 'No procedure exists'],
  ])('never prints "No" for %s', (raw, expected) => {
    band({ self_id: raw });
    const v = valueFor(SELF_ID_LABEL);
    expect(v, `${raw} must not read as a recorded refusal`).not.toBe('No');
    expect(v).toBe(expected);
  });

  /** Nepal, and only Nepal — the provision exists and is shown verbatim. */
  it('shows the source wording for a qualified yes', () => {
    band({ self_id: 'Yes (for NB marker only)' });
    expect(valueFor(SELF_ID_LABEL)).toBe('Yes (for NB marker only)');
  });

  /**
   * A positive control for the `No data` case above: `not.toBe('No')` also
   * passes when the row is absent for the wrong reason (a crash, a renamed
   * label). This pins that the band still rendered and still shows its other
   * rows while the self_id row is the one that hid.
   */
  it('hides only the self_id row when it is unrecorded, keeping the rest', () => {
    band({ self_id: 'No data', gender_marker: 'Possible', requires_surgery: 'Required' });
    expect(screen.queryByText(SELF_ID_LABEL)).toBeNull();
    expect(screen.getByText('Gender marker change')).toBeInTheDocument();
    expect(valueFor('Surgery required first')).toBe('Yes');
  });

  /**
   * Whole-vocabulary sweep. Every value production actually holds for this
   * field must map to a deliberate label; the one thing none of them may do is
   * silently become "No" when the reading is not a recorded refusal.
   */
  it('maps every production self_id value without inventing a refusal', () => {
    for (const raw of LGR_VOCABULARY.self_id) {
      const { unmount } = band({ self_id: raw });
      const v = valueFor(SELF_ID_LABEL);
      if (raw === 'No') expect(v, raw).toBe('No');
      else expect(v, `${raw} must not read as "No"`).not.toBe('No');
      unmount();
    }
  });

  /**
   * The marker row keeps ILGA's raw wording ON PURPOSE — "Not Possible
   * (exceptions documented)" carries a qualification `readMarker` would flatten
   * to `not_possible` — so it is deliberately NOT routed through a label
   * function the way self_id and the two requirements are.
   *
   * The one value that must never reach the page is the unrecorded sentinel.
   * Measured on prod 2026-09-04, "No data" is the marker on 69 of the 244
   * countries carrying a non-empty `lgbti_gender_recognition`, each rendering
   * "Gender marker change: No data" as though the sentinel were a finding.
   * Found on /country/afghanistan, where every other row had correctly hidden
   * itself and this one was left announcing the absence.
   */
  describe('gender_marker keeps its source wording but not its sentinel', () => {
    const MARKER_LABEL = 'Gender marker change';

    it.each([
      'Possible',
      'Not Possible',
      'Nominally Possible',
      'Not Possible (exceptions documented)',
      'Unclear',
      'Varies',
    ])('renders %s verbatim', (raw) => {
      band({ gender_marker: raw });
      expect(valueFor(MARKER_LABEL)).toBe(raw);
    });

    it('hides the row rather than printing the "No data" sentinel', () => {
      band({ gender_marker: 'No data', requires_surgery: 'Required' });
      expect(screen.queryByText(MARKER_LABEL)).toBeNull();
      // Positive control — the band still mounted and its other rows are
      // intact, so the assertion above cannot pass by nothing rendering.
      expect(valueFor('Surgery required first')).toBe('Yes');
    });

    it('covers every production marker value', () => {
      for (const raw of LGR_VOCABULARY.gender_marker) {
        const { unmount } = band({ gender_marker: raw, requires_surgery: 'Required' });
        const v = valueFor(MARKER_LABEL);
        if (raw === 'No data') expect(v, 'the sentinel must not render').toBeNull();
        else expect(v, raw).toBe(raw);
        unmount();
      }
    });
  });
});
