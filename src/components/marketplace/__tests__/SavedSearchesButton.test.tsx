/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const { useSavedSearchesMock, saveFn, removeFn, navigateFn } = vi.hoisted(() => ({
  useSavedSearchesMock: vi.fn(),
  saveFn: vi.fn(),
  removeFn: vi.fn(),
  navigateFn: vi.fn(),
}));

vi.mock('@/hooks/useSavedSearches', () => ({ useSavedSearches: useSavedSearchesMock }));
vi.mock('react-router', async (orig) => {
  const real = await orig<typeof import('react-router')>();
  return { ...real, useNavigate: () => navigateFn };
});

import { SavedSearchesButton } from '../SavedSearchesButton';

const inRoute = (ui: React.ReactNode, path = '/marketplace?cat=foo') => (
  <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
);

beforeEach(() => {
  useSavedSearchesMock.mockReset();
  saveFn.mockReset();
  removeFn.mockReset();
  navigateFn.mockReset();
  useSavedSearchesMock.mockReturnValue({ searches: [], save: saveFn, remove: removeFn });
});

describe('SavedSearchesButton', () => {
  it('renders trigger button without count badge when empty', () => {
    render(inRoute(<SavedSearchesButton />));
    expect(screen.getByRole('button', { name: /Saved searches/i })).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });

  it('shows count badge when searches exist', () => {
    useSavedSearchesMock.mockReturnValue({
      searches: [{ id: 's1', name: 'My filter', query: '?cat=foo' }],
      save: saveFn,
      remove: removeFn,
    });
    render(inRoute(<SavedSearchesButton />));
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('opens popover, save disabled until name typed', () => {
    render(inRoute(<SavedSearchesButton />));
    fireEvent.click(screen.getByRole('button', { name: /Saved searches/i }));
    expect(screen.getByRole('button', { name: /Save search/i })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Name this search/i), { target: { value: 'My new' } });
    expect(screen.getByRole('button', { name: /Save search/i })).not.toBeDisabled();
  });

  it('save() called with name + current query', () => {
    render(inRoute(<SavedSearchesButton />));
    fireEvent.click(screen.getByRole('button', { name: /Saved searches/i }));
    fireEvent.change(screen.getByPlaceholderText(/Name this search/i), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /Save search/i }));
    expect(saveFn).toHaveBeenCalledWith('X', '?cat=foo');
  });

  it('saved entry click navigates to its query', () => {
    useSavedSearchesMock.mockReturnValue({
      searches: [{ id: 's1', name: 'Berlin shops', query: '?city=berlin' }],
      save: saveFn,
      remove: removeFn,
    });
    render(inRoute(<SavedSearchesButton />));
    fireEvent.click(screen.getByRole('button', { name: /Saved searches/i }));
    fireEvent.click(screen.getByText('Berlin shops'));
    expect(navigateFn).toHaveBeenCalledWith({ search: '?city=berlin' });
  });

  it('delete button calls remove(id)', () => {
    useSavedSearchesMock.mockReturnValue({
      searches: [{ id: 's1', name: 'Berlin', query: '?x=1' }],
      save: saveFn,
      remove: removeFn,
    });
    render(inRoute(<SavedSearchesButton />));
    fireEvent.click(screen.getByRole('button', { name: /Saved searches/i }));
    fireEvent.click(screen.getByRole('button', { name: /Delete saved search Berlin/i }));
    expect(removeFn).toHaveBeenCalledWith('s1');
  });

  it('placeholder + disabled state when no current filters', () => {
    render(inRoute(<SavedSearchesButton />, '/marketplace'));
    fireEvent.click(screen.getByRole('button', { name: /Saved searches/i }));
    expect(screen.getByPlaceholderText(/Apply filters first/i)).toBeDisabled();
  });
});
