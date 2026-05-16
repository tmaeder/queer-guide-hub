/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useFeedbackAnalytics', () => ({
  useFeedbackDailyVolume: () => ({ data: [], isLoading: false }),
  useFeedbackSlaStats: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/config/feedbackCategories', () => ({
  feedbackCategoryMap: {},
  feedbackCategories: [],
}));
vi.mock('../../constants', () => ({
  kanbanColumns: [{ id: 'new', label: 'New', color: '#000' }],
  priorityFor: () => ({ short: 'P1' }),
}));
vi.mock('recharts', () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Legend: () => null,
}));

import { AnalyticsTab } from '../AnalyticsTab';

describe('AnalyticsTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<AnalyticsTab items={[]} voteCounts={{}} />);
    expect(container).toBeTruthy();
  });
});
