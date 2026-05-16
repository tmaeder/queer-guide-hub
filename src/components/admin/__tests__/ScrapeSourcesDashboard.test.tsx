/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useScrapeSourcesManager', () => ({
  useScrapeSourcesManager: () => ({
    fetchSources: vi.fn().mockResolvedValue([]),
    fetchRuns: vi.fn().mockResolvedValue([]),
    toggleSource: vi.fn(), triggerScrape: vi.fn(), triggerAllDue: vi.fn(),
    loading: false,
  }),
}));

import { ScrapeSourcesDashboard } from '../ScrapeSourcesDashboard';

function wrapper({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('ScrapeSourcesDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<ScrapeSourcesDashboard />, { wrapper });
    expect(container).toBeTruthy();
  });
});
