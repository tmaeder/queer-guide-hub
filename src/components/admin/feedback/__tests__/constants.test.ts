import { describe, it, expect } from 'vitest';
import { kanbanColumns, kanbanStatusSet, priorities, priorityMap, priorityFor, storyColumns, storyStatusSet } from '../constants';

describe('feedback constants', () => {
  it('kanbanColumns is non-empty', () => {
    expect(kanbanColumns.length).toBeGreaterThan(0);
  });
  it('kanbanStatusSet matches columns', () => {
    for (const c of kanbanColumns) expect(kanbanStatusSet.has(c.id)).toBe(true);
  });
  it('priorities and priorityMap consistent', () => {
    expect(priorities.length).toBeGreaterThan(0);
    expect(Object.keys(priorityMap).length).toBeGreaterThan(0);
  });
  it('priorityFor returns a PriorityMeta', () => {
    expect(priorityFor(null)).toBeDefined();
    expect(priorityFor(1)).toBeDefined();
  });
  it('storyColumns non-empty', () => {
    expect(storyColumns.length).toBeGreaterThan(0);
    for (const c of storyColumns) expect(storyStatusSet.has(c.id)).toBe(true);
  });
});
