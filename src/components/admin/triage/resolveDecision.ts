/**
 * resolveDecision — the one place that decides what a triage action carries.
 *
 * WHY THIS EXISTS. Every gate an action has to pass — the outing-safety `p_confirm`,
 * the namesake confirmation, the canonical `{keep_id}`, the refusal for queues decided
 * in another console — used to live inside `TriageDetailPanel`, i.e. inside the
 * component that renders the BUTTON. `useTriageKeyboard` is wired one level up, to
 * `TriageView`. So the mouse passed through the gates and the keyboard originated above
 * them, and the measured result was that `a`:
 *
 *   - merged a namesake personality pair, walking past the panel's disabled button,
 *     past `runBulk`'s guard and past `approve_dedup_review_batch`'s own WHERE —
 *     three layers of defence around one unguarded door;
 *   - sent no `p_confirm` on a risk-gated row, so `approve_entity_review` raised
 *     42501 and the reviewer got a raw Postgres string as a red toast, on the 347
 *     highest-stakes rows in the queue;
 *   - discarded `keep_id`, so a canonical flip the reviewer had made was thrown away.
 *
 * One resolver both callers route through is a smaller diff than a guard per caller,
 * and it is the only shape under which the rule cannot drift apart again.
 *
 * This module is pure and React-free on purpose: the rules are testable without
 * mounting anything, and `TriageView` is the only thing that needs to know how to
 * call `triage_action`.
 */
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';

export type TriageAction = 'approve' | 'reject' | 'skip' | 'flag';

/** What the reviewer has told us about THIS item. Keyed by item id in TriageView. */
export interface TriageAnswers {
  /** The canonical the reviewer picked, if they moved it off the queued default. */
  keepId?: string | null;
  namesakeConfirmed?: boolean;
  safetyConfirmed?: boolean;
  notes?: string;
  cannedSlug?: string;
}

export type DecisionResult =
  | {
      ok: true;
      action: TriageAction;
      notes?: string;
      cannedSlug?: string;
      payload?: Record<string, unknown>;
      confirm?: boolean;
    }
  | { ok: false; reason: string };

/**
 * Does this row need an explicit "same person" confirmation before it may merge?
 *
 * Reads `risk_flags.namesake`, which `triage_src_dedup_review` has emitted for person
 * rows since the queue existed. This MUST stay the same predicate the checkbox renders
 * on: gating more broadly here would refuse an approval with no checkbox on screen to
 * satisfy it, which is a dead end rather than a guard.
 */
export function needsNamesakeConfirm(item: TriageItem): boolean {
  return (
    item.queue_type === 'dedup-review' &&
    Boolean((item.risk_flags as { namesake?: boolean } | null | undefined)?.namesake)
  );
}

/**
 * May this row be approved by a BULK action?
 *
 * Deliberately BROADER than `needsNamesakeConfirm`: every personality dedup pair,
 * flagged or not, mirroring `approve_dedup_review_batch`'s own WHERE. A bulk approve
 * has no checkbox to offer and nobody reading the pair, so the narrow flag is not
 * enough there.
 *
 * Collapsing the two into one predicate is the tempting simplification and it is wrong
 * in BOTH directions — the narrow one would let unflagged person pairs through
 * select-all, and the broad one would lock the single-item path out of approvals it
 * offers no way to unlock. The difference is asserted in `resolveDecision.test.ts`.
 */
export function isUnbatchablePerson(item: TriageItem): boolean {
  return item.queue_type === 'dedup-review' && item.content_type === 'personality';
}

/**
 * Does `approve_entity_review` require `p_confirm` for this row?
 *
 * It raises 42501 — "high-risk destination: <field> approval requires explicit
 * confirmation" — whenever `_review_risk_blocked` holds and the caller did not pass the
 * flag. `triage_src_*` emits `confirm_may_be_required` for exactly those rows.
 */
export function needsSafetyConfirm(item: TriageItem): boolean {
  return Boolean(
    (item.risk_flags as { confirm_may_be_required?: boolean } | null | undefined)
      ?.confirm_may_be_required,
  );
}

/** The canonical this pair was queued with, before any reviewer flip. */
export function queuedKeepId(item: TriageItem): string | null {
  const meta = (item.meta ?? null) as Record<string, unknown> | null;
  return typeof meta?.keep_id === 'string' ? meta.keep_id : null;
}

export function resolveDecision(
  item: TriageItem,
  action: TriageAction,
  answers: TriageAnswers,
  opts: { externalConsole?: string | null } = {},
): DecisionResult {
  // Queues decided in their own console. `triage_action` has no branch for these and
  // ends in `ELSE RAISE 'unknown queue_type'`, so offering any action here is offering
  // a button the database refuses.
  if (opts.externalConsole) {
    return { ok: false, reason: 'This queue is decided in its own console.' };
  }

  // Both gates are APPROVE-only. Reject and skip must stay available or the reviewer
  // cannot clear a pair they have decided is two different people — which is the
  // outcome the flag exists to make easy. Same for a safety note: "this should not
  // publish" has to be the easy answer, or the gate pushes people toward approving.
  if (action === 'approve') {
    if (needsNamesakeConfirm(item) && !answers.namesakeConfirmed) {
      return {
        ok: false,
        reason: 'Confirm these are the same person before merging — check the Wikidata id and the dates.',
      };
    }
    if (needsSafetyConfirm(item) && !answers.safetyConfirmed) {
      return {
        ok: false,
        reason: 'Confirm the outing-safety check before publishing this note.',
      };
    }
  }

  // `p_confirm` is a statement that a human read a safety claim and takes
  // responsibility for PUBLISHING it. A rejection publishes nothing, so attaching it
  // there would record a confirmation nobody made.
  const confirm =
    action === 'approve' && needsSafetyConfirm(item) && answers.safetyConfirmed
      ? true
      : undefined;

  // The canonical flip only means anything for a merge, and only when the reviewer
  // moved it off the value the sweep queued — re-sending the default is noise in the
  // audit record.
  const original = queuedKeepId(item);
  const flipped =
    item.queue_type === 'dedup-review' &&
    action === 'approve' &&
    Boolean(answers.keepId) &&
    answers.keepId !== original;

  return {
    ok: true,
    action,
    // '' would record an empty reviewer note as though someone had written one.
    notes: answers.notes || undefined,
    cannedSlug: answers.cannedSlug || undefined,
    payload: flipped ? { keep_id: answers.keepId as string } : undefined,
    confirm,
  };
}
