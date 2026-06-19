import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// roadmap_items is newer than the generated Database types, so talk to it
// through an untyped client (house pattern for freshly-added tables).
const sb = supabase as unknown as SupabaseClient;

export type RoadmapStage =
  | 'inbox'
  | 'shaping'
  | 'backlog'
  | 'now'
  | 'next'
  | 'later'
  | 'handed_off'
  | 'shipped'
  | 'declined';

export interface RoadmapItem {
  id: string;
  title: string;
  problem: string | null;
  proposed_solution: string | null;
  acceptance_criteria: string[];
  affected_areas: string | null;
  effort: 'S' | 'M' | 'L' | null;
  impact: 'low' | 'med' | 'high' | null;
  stage: RoadmapStage;
  source_submission_ids: string[];
  vote_rollup: number;
  handoff_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export const roadmapColumns: { id: RoadmapStage; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'shaping', label: 'Shaping' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'now', label: 'Now' },
  { id: 'next', label: 'Next' },
  { id: 'later', label: 'Later' },
  { id: 'handed_off', label: 'Handed off' },
  { id: 'shipped', label: 'Shipped' },
];

export function useRoadmapItems() {
  return useQuery<RoadmapItem[]>({
    queryKey: ['admin-roadmap-items'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('roadmap_items')
        .select('*')
        .order('vote_rollup', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data as RoadmapItem[]) ?? [];
    },
    staleTime: 30_000,
  });
}

export function usePromoteToRoadmap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (submissionIds: string[]) => {
      const { data, error } = await sb.rpc('promote_submission_to_roadmap', {
        p_submission_ids: submissionIds,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as RoadmapItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-roadmap-items'] });
      qc.invalidateQueries({ queryKey: ['admin-feedback-board'] });
    },
  });
}

export function useUpdateRoadmapItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { data, error } = await sb.rpc('update_roadmap_item', { p_id: id, p_patch: patch });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as RoadmapItem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-roadmap-items'] }),
  });
}

export function useSetRoadmapStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: RoadmapStage }) => {
      const { data, error } = await sb.rpc('set_roadmap_stage', { p_id: id, p_stage: stage });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as RoadmapItem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-roadmap-items'] }),
  });
}

/**
 * Compose a ready-to-paste Claude Code prompt from a shaped roadmap item.
 * Mirrors the voice of the existing feedback handoff prompt.
 */
export function buildRoadmapPrompt(item: RoadmapItem): string {
  const lines: string[] = [];
  lines.push(`# Feature: ${item.title}`, '');
  if (item.problem) lines.push('## Problem', item.problem, '');
  if (item.proposed_solution) lines.push('## Proposed solution', item.proposed_solution, '');
  if (item.acceptance_criteria.length) {
    lines.push('## Acceptance criteria');
    for (const c of item.acceptance_criteria) lines.push(`- [ ] ${c}`);
    lines.push('');
  }
  if (item.affected_areas) lines.push('## Affected areas', item.affected_areas, '');
  const meta = [
    item.effort ? `effort ${item.effort}` : null,
    item.impact ? `impact ${item.impact}` : null,
    `${item.vote_rollup} vote(s)`,
  ]
    .filter(Boolean)
    .join(' · ');
  if (meta) lines.push(`_${meta}_`, '');
  lines.push(
    '## Context',
    'Repo: queer.guide (React 19 + Vite + TS + Tailwind + shadcn/ui front-end, Supabase back-end).',
    'Follow CLAUDE.md design + code conventions. Brainstorm first if scope is unclear, then implement, test, and open a PR.',
  );
  return lines.join('\n');
}
