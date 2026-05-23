import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const saveMock = vi.fn();
vi.mock('@/hooks/useInlineSave', () => ({
  useInlineSave: () => ({ save: saveMock, saving: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

import { AdminFullEditSheet } from '../AdminFullEditSheet';

function withQuery(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe('AdminFullEditSheet', () => {
  beforeEach(() => {
    saveMock.mockReset();
  });

  it('renders no content when closed', () => {
    render(
      withQuery(
        <AdminFullEditSheet
          open={false}
          onOpenChange={() => {}}
          contentType="venues"
          contentId="v1"
        />,
      ),
    );
    expect(screen.queryByText(/Edit Venue/i)).toBeNull();
  });

  it('renders grouped fields when open with seeded data', () => {
    render(
      withQuery(
        <AdminFullEditSheet
          open={true}
          onOpenChange={() => {}}
          contentType="venues"
          contentId="v1"
          contentName="Test Venue"
          currentData={{ id: 'v1', name: 'Test Venue', category: 'bar' }}
        />,
      ),
    );
    expect(screen.getByText(/Edit Venue/i)).toBeInTheDocument();
    expect(screen.getByText('Test Venue')).toBeInTheDocument();
    expect(screen.getByText(/Basic Info/i)).toBeInTheDocument();
  });

  it('returns null for unknown content type', () => {
    const { container } = render(
      withQuery(
        <AdminFullEditSheet
          open={true}
          onOpenChange={() => {}}
          contentType="not_a_type"
          contentId="x"
        />,
      ),
    );
    expect(container.firstChild).toBeNull();
  });

  it('uses inline save hook when a field is edited', async () => {
    saveMock.mockResolvedValue({ success: true });
    render(
      withQuery(
        <AdminFullEditSheet
          open={true}
          onOpenChange={() => {}}
          contentType="venues"
          contentId="v1"
          currentData={{ id: 'v1', name: 'Hello', category: 'bar' }}
        />,
      ),
    );
    const editButton = await screen.findByLabelText('Edit Name');
    fireEvent.click(editButton);
    const input = await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'World' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'World' }),
      );
    });
  });
});
