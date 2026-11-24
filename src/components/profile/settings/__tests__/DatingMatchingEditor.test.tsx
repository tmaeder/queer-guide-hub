import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DEFAULT_MATCHING_SETTINGS } from '@/lib/intimate/matching';

const { query, save } = vi.hoisted(() => ({ query: vi.fn(), save: vi.fn() }));
vi.mock('@/hooks/useDatingMatching', () => ({
  useDatingMatchingSettings: () => query(),
  useSaveDatingMatchingSettings: () => ({ mutateAsync: save, isPending: false }),
}));
import { DatingMatchingEditor } from '../DatingMatchingEditor';

beforeEach(() => {
  query.mockReturnValue({ data: structuredClone(DEFAULT_MATCHING_SETTINGS), isLoading: false });
  save.mockReset().mockResolvedValue(undefined);
});
const mount = () =>
  render(
    <MemoryRouter>
      <DatingMatchingEditor />
    </MemoryRouter>,
  );

describe('DatingMatchingEditor', () => {
  it('requires adult affirmation before enabling discovery', async () => {
    mount();
    fireEvent.click(screen.getByLabelText('Show me in dating discovery'));
    fireEvent.click(screen.getByRole('button', { name: 'Save matching preferences' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Affirm that you are 18 or older');
    expect(save).not.toHaveBeenCalled();
  });
  it('requires values for a required condition and saves only explicitly', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Age ranges: importance'), {
      target: { value: 'required' },
    });
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save matching preferences' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose at least one option');
    fireEvent.click(screen.getByRole('button', { name: '30-34' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save matching preferences' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].rules.age_bands).toEqual({
      strength: 'required',
      values: ['30-34'],
    });
    expect(save.mock.calls[0][0].use_identity).toBe(false);
    expect(save.mock.calls[0][0].use_checklist).toBe(false);
  });
  it('keeps unsaved requirements on save failure', async () => {
    save.mockRejectedValue(new Error('Network unavailable'));
    mount();
    fireEvent.change(screen.getByLabelText('Age ranges: importance'), {
      target: { value: 'required' },
    });
    fireEvent.click(screen.getByRole('button', { name: '30-34' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save matching preferences' }));
    await waitFor(() => expect(screen.getByText('Network unavailable')).toBeInTheDocument());
    expect(screen.getByLabelText('Age ranges: importance')).toHaveValue('required');
    expect(screen.getByRole('button', { name: '30-34' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('does not offer editable defaults when settings could not load', () => {
    query.mockReturnValue({ data: undefined, error: new Error('Offline'), refetch: vi.fn() });
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(
      screen.queryByRole('button', { name: 'Save matching preferences' }),
    ).not.toBeInTheDocument();
  });
});
