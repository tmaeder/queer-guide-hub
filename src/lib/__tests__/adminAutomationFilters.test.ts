import { describe, expect, it } from 'vitest';
import {
  automationCounts,
  automationDomain,
  filterAutomations,
  type FilterableAutomation,
} from '../adminAutomationFilters';

const row = (overrides: Partial<FilterableAutomation> = {}): FilterableAutomation => ({
  slug: 'event_scan',
  name: 'Event scan',
  description: 'Checks events',
  managed_by: 'system',
  enabled: true,
  last_run_status: 'success',
  consecutive_failures: 0,
  ...overrides,
});

describe('admin automation filtering', () => {
  const rows = [
    row(),
    row({ slug: 'news_fetch', name: 'News fetch', consecutive_failures: 1 }),
    row({
      slug: 'tag_old',
      name: 'Old tags',
      enabled: false,
      description: '[RETIRED 2026-09-26] done',
    }),
    row({ slug: 'city_paused', name: 'City paused', enabled: false }),
    row({ slug: 'push_dm', name: 'Push DM', enabled: false, last_run_status: 'auto_paused' }),
  ];

  it('hides retired rows from the default active view', () => {
    expect(
      filterAutomations(rows, { view: 'active', query: '', domain: 'all', owner: 'all' }),
    ).toHaveLength(2);
  });

  it('finds attention rows and supports text and domain filters', () => {
    expect(
      filterAutomations(rows, { view: 'attention', query: 'news', domain: 'News', owner: 'all' }),
    ).toEqual([rows[1]]);
    expect(automationDomain('milestone_topic_backfill')).toBe('Milestones');
  });

  it('reports operational summary counts', () => {
    expect(automationCounts(rows)).toEqual({
      active: 2,
      attention: 2,
      paused: 2,
      autoPaused: 1,
      terminal: 1,
      total: 5,
    });
  });
});
