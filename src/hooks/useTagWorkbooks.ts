/**
 * Interactive workbooks attached to a glossary tag — the "Work through it" band
 * on /tags/:slug, and the runner at /tools/workbook/:slug.
 *
 * Reads `get_tag_workbooks` / `get_tag_workbook_by_slug`, both of which filter
 * `is_public` and the parent tag's `status = 'active'` INSIDE the function, so
 * no caller can forget either gate.
 *
 * These RPCs return the step PROMPTS and never an answer. Answers live in
 * `tag_workbook_answers`, which has no `anon` grant at all and is read through
 * `useWorkbookAnswers` under self-only RLS — the two are deliberately separate
 * fetches so a prompt can be shown to a signed-out reader while an answer
 * cannot be.
 *
 * Via `untypedRpc` because both RPCs post-date the generated Database type.
 */

import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

export const WORKBOOK_KINDS = ['negotiation', 'menu', 'program', 'reflection'] as const;
export type WorkbookKind = (typeof WORKBOOK_KINDS)[number];

export const WORKBOOK_STEP_KINDS = ['prose', 'prompt', 'menu', 'checklist'] as const;
export type WorkbookStepKind = (typeof WORKBOOK_STEP_KINDS)[number];

export interface WorkbookStep {
  id: string;
  key: string;
  position: number;
  /** Null unless the workbook is a program. 0 = day one. */
  day_offset: number | null;
  kind: WorkbookStepKind;
  heading: string | null;
  prompt_md: string | null;
  help_md: string | null;
  /** Set only for kind === 'menu'; names the kink category the step rates. */
  kink_category_slug: string | null;
  answer_max_len: number;
}

export interface TagWorkbook {
  id: string;
  slug: string;
  title: string | null;
  dek: string | null;
  intro_md: string | null;
  kind: WorkbookKind;
  day_count: number | null;
  requires_partner: boolean;
  sort_order: number;
  /** Steps that take an answer — prose steps are excluded. */
  step_count: number;
  steps: WorkbookStep[];
}

export interface WorkbookDetail extends Omit<TagWorkbook, 'sort_order' | 'step_count'> {
  tag_slug: string;
  tag_name: string;
}

/** Workbooks on one glossary tag. Empty array when the tag has none. */
export function useTagWorkbooks(tagId: string | null) {
  return useQuery({
    queryKey: ['tag-workbooks', tagId],
    enabled: !!tagId,
    staleTime: 60 * 60 * 1000, // editorial content; changes on an admin edit
    queryFn: async (): Promise<TagWorkbook[]> => {
      if (!tagId) return [];
      const { data, error } = await untypedRpc<TagWorkbook[]>('get_tag_workbooks', {
        p_tag_id: tagId,
      });
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? data : [];
    },
  });
}

/** One workbook by slug, for the runner route. Null when absent or unpublished. */
export function useWorkbookBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ['tag-workbook', slug],
    enabled: !!slug,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<WorkbookDetail | null> => {
      if (!slug) return null;
      const { data, error } = await untypedRpc<WorkbookDetail | null>('get_tag_workbook_by_slug', {
        p_slug: slug,
      });
      if (error) throw new Error(error.message);
      return (data as WorkbookDetail | null) ?? null;
    },
  });
}

/**
 * For the route strip and the rail. Counts WORKBOOKS, not steps — the strip
 * stop and the rail row both say how many exercises hang off this term.
 */
export function countWorkbooks(workbooks: TagWorkbook[] | undefined): number {
  return workbooks?.length ?? 0;
}

/**
 * Which steps are reachable right now.
 *
 * For a program, day N unlocks once `startedAt` is N days old, computed here
 * from the single timestamp on `tag_workbook_progress` rather than from a cron
 * or a stored per-day row — so there is nothing to drift and nothing to
 * backfill. A step with a null `day_offset` is always available.
 *
 * `startedAt` null means not started, which unlocks day 0 only: a reader
 * landing on a four-day program sees day one and not the whole thing.
 */
export function unlockedSteps(steps: WorkbookStep[], startedAt: string | null): WorkbookStep[] {
  const started = startedAt ? Date.parse(startedAt) : null;
  // A malformed timestamp must not unlock everything — treat it as not started.
  const elapsedDays =
    started !== null && Number.isFinite(started)
      ? Math.floor((Date.now() - started) / 86_400_000)
      : 0;
  return steps.filter((s) => s.day_offset === null || s.day_offset <= elapsedDays);
}

/** Days until `step` unlocks; 0 when it already has. */
export function daysUntilUnlock(step: WorkbookStep, startedAt: string | null): number {
  if (step.day_offset === null) return 0;
  const started = startedAt ? Date.parse(startedAt) : null;
  const elapsedDays =
    started !== null && Number.isFinite(started)
      ? Math.floor((Date.now() - started) / 86_400_000)
      : 0;
  return Math.max(0, step.day_offset - elapsedDays);
}
