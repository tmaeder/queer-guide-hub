/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));

import BulkEnrichDialog from '../BulkEnrichDialog';

describe('BulkEnrichDialog', () => {
  it('renders trigger button', () => {
    render(<BulkEnrichDialog />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('opens dialog on click', () => {
    render(<BulkEnrichDialog />);
    fireEvent.click(screen.getAllByRole('button')[0]);
  });
});
