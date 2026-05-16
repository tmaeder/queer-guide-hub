/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/usePageFetchers', () => ({
  listFromWhere: vi.fn().mockResolvedValue([
    { id: 'a1', content_type: 'venue', status: 'pending', platform: null, data: { name: 'Bar A' }, submitted_at: '2026-05-15' },
  ]),
}));
vi.mock('@/config/submissionRegistry', () => ({
  submissionRegistry: { venue: { titleField: 'name' } },
}));

import { MergeDuplicatesDialog } from '../MergeDuplicatesDialog';

describe('MergeDuplicatesDialog', () => {
  it('renders nothing when closed', () => {
    render(<MergeDuplicatesDialog open={false} onOpenChange={vi.fn()} submissionId="s1" contentType="venue" />);
    expect(screen.queryByText(/Bar A/)).toBeNull();
  });

  it('renders candidate when open', async () => {
    render(<MergeDuplicatesDialog open onOpenChange={vi.fn()} submissionId="s1" contentType="venue" />);
    await waitFor(() => expect(screen.getByText('Bar A')).toBeInTheDocument());
  });
});
