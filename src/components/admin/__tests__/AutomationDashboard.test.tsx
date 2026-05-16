/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAutomationMonitor', () => ({
  useAutomationMonitor: () => ({
    modules: [], pendingFlags: [], deadLinks: [], geoMismatches: [],
    stats: {
      enabledModules: 0, totalModules: 0,
      pendingFlags: 0, appliedFlags: 0,
      deadLinks: 0, geoMismatches: 0,
      totalProcessed: 0,
    },
    flagStats: { rejected: 0, applied: 0, pending: 0 },
    isLoading: false, linksLoading: false, geoLoading: false,
    toggleModule: vi.fn(), reviewFlag: vi.fn(), triggerModule: vi.fn(), updateModuleConfig: vi.fn(),
    isToggling: false, isReviewing: false, isTriggering: false,
  }),
}));

import { AutomationDashboard } from '../AutomationDashboard';

function wrapper({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('AutomationDashboard (legacy)', () => {
  it('renders without crashing', () => {
    const { container } = render(<AutomationDashboard />, { wrapper });
    expect(container).toBeTruthy();
  });
});
