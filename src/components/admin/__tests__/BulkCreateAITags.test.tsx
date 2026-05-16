/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { results: [], summary: { created: 0, exists: 0, errors: 0 } }, error: null }) } },
}));

import BulkCreateAITags from '../BulkCreateAITags';

describe('BulkCreateAITags', () => {
  it('renders trigger button', () => {
    render(<BulkCreateAITags />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('opens dialog on trigger', () => {
    render(<BulkCreateAITags />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
  });
});
