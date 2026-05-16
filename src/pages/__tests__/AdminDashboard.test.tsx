/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/hooks/useAdminCockpit', () => ({
  useAdminCockpit: () => ({ data: null, isLoading: false, refetch: vi.fn() }),
}));

import AdminDashboard from '../AdminDashboard';

describe('AdminDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><TooltipProvider><AdminDashboard /></TooltipProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
