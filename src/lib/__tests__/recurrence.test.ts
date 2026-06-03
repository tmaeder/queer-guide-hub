import { describe, it, expect } from 'vitest';
import { describeRecurrence } from '../recurrence';

describe('describeRecurrence', () => {
  it('returns null for no rule', () => {
    expect(describeRecurrence(null)).toBeNull();
  });

  it('describes monthly on the Nth weekday ("every 1st Saturday")', () => {
    expect(describeRecurrence({ freq: 'MONTHLY', interval: 1, byDay: ['SA'], bySetPos: 1 })).toBe(
      'Monthly on the first Saturday',
    );
    expect(describeRecurrence({ freq: 'MONTHLY', interval: 1, byDay: ['SA'], bySetPos: -1 })).toBe(
      'Monthly on the last Saturday',
    );
  });

  it('describes weekly on days', () => {
    expect(describeRecurrence({ freq: 'WEEKLY', interval: 1, byDay: ['MO', 'FR'] })).toBe(
      'Weekly on Mon, Fri',
    );
    expect(describeRecurrence({ freq: 'WEEKLY', interval: 2, byDay: ['SA'] })).toBe(
      'Every 2 weeks on Sat',
    );
  });

  it('describes daily and plain monthly', () => {
    expect(describeRecurrence({ freq: 'DAILY', interval: 1 })).toBe('Daily');
    expect(describeRecurrence({ freq: 'MONTHLY', interval: 1 })).toBe('Monthly');
  });
});
