import { describe, expect, it } from 'vitest';
import { formatMilestoneDate, milestoneDecade, milestoneYear } from './milestoneDate';

describe('formatMilestoneDate', () => {
  it('renders year precision as bare year', () => {
    expect(formatMilestoneDate('1969-01-01', 'year', 'en')).toBe('1969');
    expect(formatMilestoneDate('1969-01-01', 'year', 'de')).toBe('1969');
  });

  it('renders month precision without day', () => {
    expect(formatMilestoneDate('1969-06-01', 'month', 'en')).toBe('June 1969');
    expect(formatMilestoneDate('1969-06-01', 'month', 'de')).toBe('Juni 1969');
  });

  it('renders day precision fully, locale-aware', () => {
    expect(formatMilestoneDate('1969-06-28', 'day', 'en')).toBe('June 28, 1969');
    expect(formatMilestoneDate('1969-06-28', 'day', 'de')).toBe('28. Juni 1969');
  });

  it('renders ranges with en dash', () => {
    expect(formatMilestoneDate('1933-01-01', 'year', 'en', '1945-01-01', 'year')).toBe('1933–1945');
    expect(formatMilestoneDate('1969-06-28', 'day', 'en', '1969-07-03', 'day')).toBe(
      'June 28, 1969–July 3, 1969',
    );
  });

  it('collapses identical start/end', () => {
    expect(formatMilestoneDate('1969-01-01', 'year', 'en', '1969-12-01', 'year')).toBe('1969');
  });

  it('falls back to year on invalid date', () => {
    expect(formatMilestoneDate('1969-99-99', 'day', 'en')).toBe('1969');
  });
});

describe('milestoneYear / milestoneDecade', () => {
  it('extracts year and decade', () => {
    expect(milestoneYear('1969-06-28')).toBe(1969);
    expect(milestoneDecade('1969-06-28')).toBe(1960);
    expect(milestoneDecade('2001-01-01')).toBe(2000);
  });
});
