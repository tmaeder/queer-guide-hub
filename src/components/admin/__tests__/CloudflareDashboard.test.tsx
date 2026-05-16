/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/cloudflare', () => ({
  cloudflareAPI: {
    getAnalytics: vi.fn().mockResolvedValue(null),
    getZoneInfo: vi.fn().mockResolvedValue(null),
    getSecuritySettings: vi.fn().mockResolvedValue(null),
    getPerformanceSettings: vi.fn().mockResolvedValue(null),
    purgeCache: vi.fn().mockResolvedValue({}),
  },
}));

import { CloudflareDashboard } from '../CloudflareDashboard';

describe('CloudflareDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<CloudflareDashboard />);
    expect(container).toBeTruthy();
  });
});
