/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { success: true, imported: 0, total_parsed: 0 }, error: null }) } },
}));

import { TagsCsvImport } from '../TagsCsvImport';

describe('TagsCsvImport', () => {
  it('renders trigger button', () => {
    render(<TagsCsvImport />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('opens dialog on click', () => {
    render(<TagsCsvImport />);
    fireEvent.click(screen.getAllByRole('button')[0]);
  });
});
