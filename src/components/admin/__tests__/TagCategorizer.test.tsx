/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { invokeFn } = vi.hoisted(() => ({ invokeFn: vi.fn() }));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeFn } },
}));

import { TagCategorizer } from '../TagCategorizer';

beforeEach(() => invokeFn.mockReset());

describe('TagCategorizer', () => {
  it('renders heading + button', () => {
    render(<TagCategorizer />);
    expect(screen.getByText(/Tag Categorization/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Categorize All Tags/i })).toBeInTheDocument();
  });

  it('calls invoke on click and shows progress when successful', async () => {
    invokeFn.mockResolvedValue({
      data: { success: true, total_tags: 100, categorized_count: 80, message: 'done' },
      error: null,
    });
    render(<TagCategorizer />);
    fireEvent.click(screen.getByRole('button', { name: /Categorize All Tags/i }));
    await waitFor(() => expect(screen.getByText('80 / 100')).toBeInTheDocument());
  });

  it('handles error response', async () => {
    invokeFn.mockResolvedValue({ data: null, error: new Error('failed') });
    render(<TagCategorizer />);
    fireEvent.click(screen.getByRole('button', { name: /Categorize All Tags/i }));
    await waitFor(() => expect(invokeFn).toHaveBeenCalled());
  });
});
