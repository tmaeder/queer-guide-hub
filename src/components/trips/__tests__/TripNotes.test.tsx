/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useToastMock, useTripNotesMock, createMutate, updateMutate, deleteMutate, togglePinMutate } = vi.hoisted(() => ({
  useToastMock: vi.fn(),
  useTripNotesMock: vi.fn(),
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  togglePinMutate: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useTripCollaboration', () => ({ useTripNotes: useTripNotesMock }));
vi.mock('@/components/animation/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layout/PageLoadingState', () => ({
  PageLoadingState: () => <div data-testid="loading" />,
}));

import { TripNotes } from '../TripNotes';

function withMocks(notes: unknown[] = []) {
  useTripNotesMock.mockReturnValue({
    data: notes,
    isLoading: false,
    createNote: { mutate: createMutate, isPending: false },
    updateNote: { mutate: updateMutate, isPending: false },
    deleteNote: { mutate: deleteMutate, isPending: false },
    togglePin: { mutate: togglePinMutate, isPending: false },
  });
}

beforeEach(() => {
  useToastMock.mockReset();
  useTripNotesMock.mockReset();
  createMutate.mockReset();
  updateMutate.mockReset();
  deleteMutate.mockReset();
  togglePinMutate.mockReset();
  useToastMock.mockReturnValue({ toast: vi.fn() });
});

describe('TripNotes', () => {
  it('shows loading state', () => {
    useTripNotesMock.mockReturnValue({ data: undefined, isLoading: true, createNote: {}, updateNote: {}, deleteNote: {}, togglePin: {} });
    render(<TripNotes tripId="t1" />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows empty state when no notes', () => {
    withMocks([]);
    render(<TripNotes tripId="t1" />);
    expect(screen.getByText(/No notes yet/i)).toBeInTheDocument();
  });

  it('renders one card per note', () => {
    withMocks([
      { id: 'n1', title: 'Logistics', content: 'flight info', category: 'logistics', is_pinned: false, updated_at: new Date().toISOString(), author: { display_name: 'Me' } },
      { id: 'n2', title: 'Safety', content: 'tips', category: 'safety', is_pinned: true, updated_at: new Date().toISOString(), author: { display_name: 'Me' } },
    ]);
    render(<TripNotes tripId="t1" />);
    expect(screen.getByText('Logistics')).toBeInTheDocument();
    expect(screen.getByText('Safety')).toBeInTheDocument();
  });

  it('clicking New Note opens dialog with empty fields', () => {
    withMocks([]);
    render(<TripNotes tripId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: /New Note/i }));
    expect(screen.getByPlaceholderText(/Note title/i)).toHaveValue('');
  });

  it('Save (create) fires createNote.mutate', () => {
    withMocks([]);
    render(<TripNotes tripId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: /New Note/i }));
    fireEvent.change(screen.getByPlaceholderText(/Note title/i), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));
    expect(createMutate).toHaveBeenCalled();
  });
});
