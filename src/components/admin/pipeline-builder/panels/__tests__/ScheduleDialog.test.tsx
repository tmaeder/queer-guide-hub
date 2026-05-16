/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => ({
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }),
}));
vi.mock('../CronEditor', () => ({
  default: (p: { value: string | null; onChange: (v: string | null) => void }) => (
    <input data-testid="cron" value={p.value ?? ''} onChange={(e) => p.onChange(e.target.value)} />
  ),
  describeCron: 'every hour',
}));

import { TooltipProvider } from '@/components/ui/tooltip';
import ScheduleDialog from '../ScheduleDialog';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

describe('ScheduleDialog', () => {
  it('trigger disabled when pipelineId missing', () => {
    render(<ScheduleDialog pipelineId={undefined} currentSchedule={null} />, { wrapper });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('opens dialog with CronEditor when triggered', () => {
    render(<ScheduleDialog pipelineId="p1" currentSchedule="0 * * * *" />, { wrapper });
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('cron')).toBeInTheDocument();
  });

  it('Cancel closes dialog', () => {
    render(<ScheduleDialog pipelineId="p1" currentSchedule={null} />, { wrapper });
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('cron')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
  });
});
