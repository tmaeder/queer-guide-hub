/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) },
}));
vi.mock('@/components/analytics/UmamiAnalyticsDashboard', () => ({ UmamiAnalyticsDashboard: () => null }));

import AdminAnalytics from '../AdminAnalytics';

describe('AdminAnalytics', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><AdminAnalytics /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
