/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useDocsMock, useDeleteMock, useToastMock, deleteMutate, dlUrlMock } = vi.hoisted(() => ({
  useDocsMock: vi.fn(),
  useDeleteMock: vi.fn(),
  useToastMock: vi.fn(),
  deleteMutate: vi.fn(),
  dlUrlMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useTripDocuments', () => ({
  useTripDocuments: useDocsMock,
  useDeleteDocument: useDeleteMock,
  getDocumentDownloadUrl: dlUrlMock,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/utils/docExpiry', () => ({
  expiryStatus: () => 'ok',
  expiryLabel: () => 'OK',
}));
vi.mock('../AddDocumentDialog', () => ({
  AddDocumentDialog: (p: { open: boolean }) => (p.open ? <div data-testid="add-dlg" /> : null),
}));

import { DocumentsList } from '../DocumentsList';

beforeEach(() => {
  useDocsMock.mockReset();
  useDeleteMock.mockReset();
  useToastMock.mockReset();
  deleteMutate.mockReset();
  dlUrlMock.mockReset();
  useDeleteMock.mockReturnValue({ mutate: deleteMutate });
  useToastMock.mockReturnValue({ toast: vi.fn() });
});

describe('DocumentsList', () => {
  it('shows skeletons while loading', () => {
    useDocsMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<DocumentsList tripId="t1" />);
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it('renders Add button when no docs', () => {
    useDocsMock.mockReturnValue({ data: [], isLoading: false });
    render(<DocumentsList tripId="t1" />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('renders one card per document', () => {
    const iso = new Date().toISOString();
    useDocsMock.mockReturnValue({
      data: [
        { id: 'd1', title: 'Passport', doc_type: 'passport', expiry_date: null, file_path: 'x', created_at: iso, file_mime: 'application/pdf' },
        { id: 'd2', title: 'Visa', doc_type: 'visa', expiry_date: null, file_path: 'y', created_at: iso, file_mime: 'application/pdf' },
      ],
      isLoading: false,
    });
    render(<DocumentsList tripId="t1" />);
    expect(screen.getByText('Passport')).toBeInTheDocument();
    expect(screen.getByText('Visa')).toBeInTheDocument();
  });

  it('Add button opens AddDocumentDialog', () => {
    useDocsMock.mockReturnValue({ data: [], isLoading: false });
    render(<DocumentsList tripId="t1" />);
    const addBtns = screen.getAllByRole('button');
    fireEvent.click(addBtns[0]);
    expect(screen.getByTestId('add-dlg')).toBeInTheDocument();
  });
});
