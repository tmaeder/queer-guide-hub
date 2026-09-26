/**
 * The decision resolver — one owner for everything an action carries.
 *
 * WHY THIS MODULE EXISTS. `useTriageKeyboard` was wired to `TriageView.handleAction`,
 * while every gate — `confirm`, `{keep_id}`, namesake, outing-safety — was computed in
 * `TriageDetailPanel.handleAction`. The mouse passed through the gates because the
 * button lived inside the panel; the keyboard originated above them. So `a` merged a
 * namesake pair (walking past the panel's disabled button, `runBulk`'s guard AND
 * `approve_dedup_review_batch`'s own WHERE), raised a raw 42501 on every risk-gated
 * row, and silently discarded a canonical flip.
 *
 * These tests assert the RULES. The companion suite
 * `TriageViewKeyboardGates.test.tsx` asserts that the keyboard actually routes
 * through them — both halves are needed, because a correct rule nobody consults is
 * exactly the state this replaced.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveDecision,
  needsNamesakeConfirm,
  isUnbatchablePerson,
} from '../resolveDecision';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';

function item(over: Partial<TriageItem> = {}): TriageItem {
  return {
    id: 'i1',
    queue_type: 'staging',
    content_type: 'venue',
    title: 'A venue',
    subtitle: '',
    status: 'open',
    confidence_score: 0.9,
    created_at: '2026-09-01T00:00:00Z',
    source: 'sweep',
    entity_id: 'e1',
    entity_table: 'venues',
    has_diff: false,
    reporter_id: null,
    meta: {},
    risk_flags: {},
    ...over,
  } as TriageItem;
}

const namesakePair = () =>
  item({
    id: 'person-pair',
    queue_type: 'dedup-review',
    content_type: 'personality',
    risk_flags: { namesake: true },
    meta: { keep_id: 'keep-1' },
  });

const gatedRow = () =>
  item({
    id: 'city-note',
    queue_type: 'quality-city',
    content_type: 'city',
    risk_flags: { confirm_may_be_required: true },
  });

describe('namesake — merging two different people is an outing risk', () => {
  it('refuses approve until the reviewer confirms, and says why', () => {
    const r = resolveDecision(namesakePair(), 'approve', {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/same person/i);
  });

  it('allows approve once confirmed', () => {
    const r = resolveDecision(namesakePair(), 'approve', { namesakeConfirmed: true });
    expect(r.ok).toBe(true);
  });

  it('never attaches p_confirm to a namesake approval', () => {
    // p_confirm is the OUTING-SAFETY flag that `approve_entity_review` consults.
    // A namesake confirmation is a different statement about a different risk;
    // conflating them would record a safety confirmation nobody made.
    const r = resolveDecision(namesakePair(), 'approve', { namesakeConfirmed: true });
    expect(r.ok && r.confirm).toBeUndefined();
  });

  it('leaves reject and skip available unconfirmed', () => {
    // "These are two different people" must stay the EASY answer, or the flag
    // pushes reviewers toward approving just to clear the queue.
    expect(resolveDecision(namesakePair(), 'reject', {}).ok).toBe(true);
    expect(resolveDecision(namesakePair(), 'skip', {}).ok).toBe(true);
    expect(resolveDecision(namesakePair(), 'flag', {}).ok).toBe(true);
  });

  it('does not gate a dedup pair that carries no namesake flag', () => {
    // The gate must match the predicate the CHECKBOX renders on. Gating more
    // broadly here would refuse an approval with no checkbox on screen to tick.
    const plain = item({ queue_type: 'dedup-review', content_type: 'personality' });
    expect(needsNamesakeConfirm(plain)).toBe(false);
    expect(resolveDecision(plain, 'approve', {}).ok).toBe(true);
  });
});

describe('outing-safety — a note that understates the law reads as reassurance', () => {
  it('refuses approve until confirmed', () => {
    const r = resolveDecision(gatedRow(), 'approve', {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/safety/i);
  });

  it('sends confirm: true once confirmed', () => {
    const r = resolveDecision(gatedRow(), 'approve', { safetyConfirmed: true });
    expect(r.ok).toBe(true);
    expect(r.ok && r.confirm).toBe(true);
  });

  it('never sends confirm on a REJECT, even when the box is ticked', () => {
    // A rejection publishes nothing, so a confirmation attached there would
    // record that a human took responsibility for a claim that never shipped.
    const r = resolveDecision(gatedRow(), 'reject', { safetyConfirmed: true });
    expect(r.ok).toBe(true);
    expect(r.ok && r.confirm).toBeUndefined();
  });

  it('leaves reject available unconfirmed', () => {
    expect(resolveDecision(gatedRow(), 'reject', {}).ok).toBe(true);
  });
});

describe('the canonical flip', () => {
  const pair = () =>
    item({
      queue_type: 'dedup-review',
      content_type: 'venue',
      meta: { keep_id: 'keep-1' },
    });

  it('attaches keep_id when the reviewer picked the other row', () => {
    const r = resolveDecision(pair(), 'approve', { keepId: 'keep-2' });
    expect(r.ok && r.payload).toEqual({ keep_id: 'keep-2' });
  });

  it('sends no payload when the choice is unchanged', () => {
    // Sending the value it already had is noise in the audit record.
    const r = resolveDecision(pair(), 'approve', { keepId: 'keep-1' });
    expect(r.ok && r.payload).toBeUndefined();
  });

  it('sends no payload on reject — a flip only means anything for a merge', () => {
    const r = resolveDecision(pair(), 'reject', { keepId: 'keep-2' });
    expect(r.ok && r.payload).toBeUndefined();
  });

  it('ignores a flip on a queue that is not dedup', () => {
    const r = resolveDecision(item(), 'approve', { keepId: 'keep-2' });
    expect(r.ok && r.payload).toBeUndefined();
  });
});

describe('queues decided in another console', () => {
  it('refuses every action rather than offering one triage_action raises on', () => {
    // `triage_action` has no branch for these; it ends in
    // `ELSE RAISE 'unknown queue_type'`.
    for (const a of ['approve', 'reject', 'skip', 'flag'] as const) {
      const r = resolveDecision(item({ queue_type: 'org-link-review' }), a, {}, {
        externalConsole: '/admin/governance?mode=engines',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/console/i);
    }
  });
});

describe('notes travel with the decision', () => {
  it('carries notes and the canned slug through', () => {
    const r = resolveDecision(item(), 'reject', { notes: 'not a venue', cannedSlug: 'nonvenue' });
    expect(r.ok && r.notes).toBe('not a venue');
    expect(r.ok && r.cannedSlug).toBe('nonvenue');
  });

  it('normalises empty strings to undefined', () => {
    // `triage_action` stores the note verbatim; '' would record an empty
    // reviewer note as though someone had written one.
    const r = resolveDecision(item(), 'reject', { notes: '', cannedSlug: '' });
    expect(r.ok && r.notes).toBeUndefined();
    expect(r.ok && r.cannedSlug).toBeUndefined();
  });
});

describe('the two person predicates are deliberately different', () => {
  /**
   * `needsNamesakeConfirm` matches what the CHECKBOX renders on (risk_flags.namesake).
   * `isUnbatchablePerson` is BROADER — every personality dedup pair — and mirrors
   * `approve_dedup_review_batch`'s own WHERE, because a bulk approve has no
   * checkbox to offer and no reviewer reading the pair.
   *
   * Collapsing them into one predicate is the tempting simplification and it is
   * wrong in both directions: using the narrow one for bulk would let unflagged
   * person pairs through select-all, and using the broad one for the single-item
   * path would refuse an approval with no checkbox on screen to satisfy it.
   */
  it('bulk holds back every personality dedup pair, flagged or not', () => {
    expect(isUnbatchablePerson(item({ queue_type: 'dedup-review', content_type: 'personality' })))
      .toBe(true);
    expect(isUnbatchablePerson(namesakePair())).toBe(true);
  });

  it('bulk does not hold back other entity types', () => {
    expect(isUnbatchablePerson(item({ queue_type: 'dedup-review', content_type: 'venue' })))
      .toBe(false);
  });

  it('bulk does not hold back personalities outside the dedup queue', () => {
    expect(isUnbatchablePerson(item({ queue_type: 'quality-personality', content_type: 'personality' })))
      .toBe(false);
  });

  it('the narrow predicate is strictly inside the broad one', () => {
    const flaggedNonPerson = item({
      queue_type: 'dedup-review',
      content_type: 'venue',
      risk_flags: { namesake: true },
    });
    // A namesake flag on a non-person still gates the single-item approve —
    // the view emits it for people today, but the gate reads the flag, not the type.
    expect(needsNamesakeConfirm(flaggedNonPerson)).toBe(true);
    expect(isUnbatchablePerson(flaggedNonPerson)).toBe(false);
  });
});
