import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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

const untypedFromMock = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'l1', name: 'Tiergarten' }, error: null }),
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: vi.fn(),
  untypedSupabase: { from: (...args: unknown[]) => untypedFromMock(...(args as [])) },
}));

import { supabase } from '@/integrations/supabase/client';
import { AdminFullEditSheet } from '../AdminFullEditSheet';

describe('AdminFullEditSheet', () => {
  beforeEach(() => {
    saveMock.mockReset();
  });

  it('renders no content when closed', () => {
    render(
      <AdminFullEditSheet
        open={false}
        onOpenChange={() => {}}
        contentType="venues"
        contentId="v1"
      />,
    );
    expect(screen.queryByText(/Edit Venue/i)).toBeNull();
  });

  it('renders grouped fields when open with seeded data', () => {
    render(
      <AdminFullEditSheet
        open={true}
        onOpenChange={() => {}}
        contentType="venues"
        contentId="v1"
        contentName="Test Venue"
        currentData={{ id: 'v1', name: 'Test Venue', category: 'bar' }}
      />,
    );
    expect(screen.getByText(/Edit Venue/i)).toBeInTheDocument();
    expect(screen.getByText('Test Venue')).toBeInTheDocument();
    // Venue registry has a "basic" group containing Name + Category
    expect(screen.getByText(/Basic Info/i)).toBeInTheDocument();
  });

  it('returns null for unknown content type', () => {
    const { container } = render(
      <AdminFullEditSheet
        open={true}
        onOpenChange={() => {}}
        contentType="not_a_type"
        contentId="x"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('uses inline save hook when a field is edited', async () => {
    saveMock.mockResolvedValue({ success: true });
    render(
      <AdminFullEditSheet
        open={true}
        onOpenChange={() => {}}
        contentType="venues"
        contentId="v1"
        currentData={{ id: 'v1', name: 'Hello', category: 'bar' }}
      />,
    );
    // Click the Edit pencil for the Name field
    const editButton = await screen.findByLabelText('Edit Name');
    fireEvent.click(editButton);
    const input = await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'World' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ value: 'World' }));
    });
  });

  it("loads a landmark through the type's own loader, not a plain table read", async () => {
    render(
      <AdminFullEditSheet
        open={true}
        onOpenChange={() => {}}
        contentType="landmarks"
        contentId="l1"
        contentName="Tiergarten"
      />,
    );
    await waitFor(() => expect(untypedFromMock).toHaveBeenCalledWith('cms_landmarks'));
    expect(supabase.from).not.toHaveBeenCalledWith('cms_landmarks');
  });
});
