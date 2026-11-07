/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
        {
          id: 'd1',
          title: 'Passport',
          doc_type: 'passport',
          expiry_date: null,
          file_path: 'x',
          created_at: iso,
          file_mime: 'application/pdf',
        },
        {
          id: 'd2',
          title: 'Visa',
          doc_type: 'visa',
          expiry_date: null,
          file_path: 'y',
          created_at: iso,
          file_mime: 'application/pdf',
        },
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

  describe('opening a document (Safari popup rules)', () => {
    const iso = new Date().toISOString();
    const doc = {
      id: 'd1',
      title: 'Passport',
      doc_type: 'passport',
      expiry_date: null,
      file_path: 'x',
      created_at: iso,
      file_mime: 'application/pdf',
    };
    afterEach(() => vi.restoreAllMocks());

    it('opens the tab inside the click, before the signed URL resolves', async () => {
      useDocsMock.mockReturnValue({ data: [doc], isLoading: false });
      const win = { opener: {}, closed: false, location: { href: 'about:blank' }, close: vi.fn() };
      const open = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
      let resolveUrl: (u: string) => void = () => {};
      dlUrlMock.mockReturnValue(new Promise<string>((r) => (resolveUrl = r)));
      render(<DocumentsList tripId="t1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
      // Still inside the click: the URL is not known yet, but the tab is open.
      expect(open).toHaveBeenCalledTimes(1);
      expect(win.location.href).toBe('about:blank');
      resolveUrl('https://storage.example/signed/passport.pdf');
      await waitFor(() =>
        expect(win.location.href).toBe('https://storage.example/signed/passport.pdf'),
      );
      expect(open).toHaveBeenCalledTimes(1);
    });

    it('closes the pending tab and shows an error when there is no URL', async () => {
      useDocsMock.mockReturnValue({ data: [doc], isLoading: false });
      const toast = vi.fn();
      useToastMock.mockReturnValue({ toast });
      const win = { opener: {}, closed: false, location: { href: 'about:blank' }, close: vi.fn() };
      vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
      dlUrlMock.mockResolvedValue(null);
      render(<DocumentsList tripId="t1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
      await waitFor(() => expect(win.close).toHaveBeenCalledTimes(1));
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
  });
});
