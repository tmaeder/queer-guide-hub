/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useToastMock, useUploadMock, uploadMutateAsync } = vi.hoisted(() => ({
  useToastMock: vi.fn(),
  useUploadMock: vi.fn(),
  uploadMutateAsync: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useTripDocuments', () => ({
  useUploadDocument: useUploadMock,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));

import { AddDocumentDialog } from '../AddDocumentDialog';

beforeEach(() => {
  useToastMock.mockReset();
  useUploadMock.mockReset();
  uploadMutateAsync.mockReset();
  useToastMock.mockReturnValue({ toast: vi.fn() });
  useUploadMock.mockReturnValue({ mutateAsync: uploadMutateAsync, isPending: false });
});

describe('AddDocumentDialog', () => {
  it('renders nothing when closed', () => {
    render(<AddDocumentDialog open={false} onClose={vi.fn()} tripId="t1" />);
    expect(screen.queryByText(/passport/i)).toBeNull();
  });

  it('renders form when open', () => {
    render(<AddDocumentDialog open onClose={vi.fn()} tripId="t1" />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
