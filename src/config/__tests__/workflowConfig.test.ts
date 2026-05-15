import { describe, it, expect } from 'vitest';
import {
  workflowTransitions,
  getAvailableTransitions,
  getStateColor,
  getStateLabel,
  getStateBadgeVariant,
  canTransition,
} from '../workflowConfig';
import type { WorkflowState } from '@/types/cms';

describe('workflowTransitions definition', () => {
  it('includes the expected published-flow transitions', () => {
    const pairs = workflowTransitions.map(t => `${t.from}→${t.to}`);
    expect(pairs).toEqual(
      expect.arrayContaining([
        'draft→review',
        'draft→published',
        'review→published',
        'review→draft',
        'published→archived',
        'published→draft',
        'archived→draft',
      ]),
    );
  });

  it('flags review→draft as requiring a comment', () => {
    const t = workflowTransitions.find(
      x => x.from === 'review' && x.to === 'draft',
    );
    expect(t?.requiresComment).toBe(true);
  });

  it("stamps published_at when transitioning to 'published'", () => {
    const t = workflowTransitions.find(
      x => x.from === 'review' && x.to === 'published',
    );
    const patch = t!.onTransition!();
    expect(patch.published_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('getAvailableTransitions', () => {
  it('admin sees both review and publish from draft', () => {
    const r = getAvailableTransitions('draft', ['admin']);
    expect(r.map(t => t.to).sort()).toEqual(['published', 'review']);
  });

  it('editor only sees submit-for-review from draft', () => {
    const r = getAvailableTransitions('draft', ['editor']);
    expect(r.map(t => t.to)).toEqual(['review']);
  });

  it('returns empty for unknown role', () => {
    expect(getAvailableTransitions('draft', ['guest'])).toEqual([]);
  });

  it('returns empty for unknown state', () => {
    expect(getAvailableTransitions('nope' as WorkflowState, ['admin'])).toEqual([]);
  });
});

describe('canTransition', () => {
  it('returns true for a valid admin transition', () => {
    expect(canTransition('draft', 'published', ['admin'])).toBe(true);
  });

  it('returns false when role is insufficient', () => {
    expect(canTransition('draft', 'published', ['editor'])).toBe(false);
  });

  it('returns false for an undefined transition', () => {
    expect(canTransition('archived', 'published', ['admin'])).toBe(false);
  });
});

describe('UI helpers', () => {
  it.each([
    ['draft', '#94a3b8'],
    ['review', '#f59e0b'],
    ['published', '#22c55e'],
    ['archived', '#6b7280'],
  ] as Array<[WorkflowState, string]>)('getStateColor(%s) = %s', (state, color) => {
    expect(getStateColor(state)).toBe(color);
  });

  it('getStateColor falls back to slate for unknown states', () => {
    expect(getStateColor('mystery' as WorkflowState)).toBe('#94a3b8');
  });

  it.each([
    ['draft', 'Draft'],
    ['review', 'In Review'],
    ['published', 'Published'],
    ['archived', 'Archived'],
  ] as Array<[WorkflowState, string]>)('getStateLabel(%s) = %s', (state, label) => {
    expect(getStateLabel(state)).toBe(label);
  });

  it('getStateLabel echoes unknown states verbatim', () => {
    expect(getStateLabel('weird' as WorkflowState)).toBe('weird');
  });

  it.each([
    ['draft', 'secondary'],
    ['review', 'outline'],
    ['published', 'default'],
    ['archived', 'secondary'],
  ] as Array<[WorkflowState, string]>)('getStateBadgeVariant(%s) = %s', (state, v) => {
    expect(getStateBadgeVariant(state)).toBe(v);
  });

  it("getStateBadgeVariant defaults to 'outline' for unknown states", () => {
    expect(getStateBadgeVariant('mystery' as WorkflowState)).toBe('outline');
  });
});
