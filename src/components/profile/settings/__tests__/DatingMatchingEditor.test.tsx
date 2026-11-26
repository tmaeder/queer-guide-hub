import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DEFAULT_MATCHING_SETTINGS, MATCHING_FIELDS } from '@/lib/intimate/matching';

const { query, save } = vi.hoisted(() => ({ query: vi.fn(), save: vi.fn() }));
vi.mock('@/hooks/useDatingMatching', () => ({
  useDatingMatchingSettings: () => query(),
  useSaveDatingMatchingSettings: () => ({ mutateAsync: save, isPending: false }),
}));
const intimate = vi.hoisted(() => ({
  me: null as Record<string, unknown> | null,
  upsert: vi.fn(),
}));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useMyIntimateProfile: () => ({ data: intimate.me }),
  useUpsertIntimateProfile: () => ({ mutateAsync: intimate.upsert, isPending: false }),
}));
vi.mock('@/components/intimate/HankyHints', () => ({ HankyHints: () => null }));
vi.mock('@/components/intimate/HankyCodePicker', () => ({
  HankyCodePicker: ({ onChange }: { onChange: (id: string, side: string | null) => void }) => (
    <button type="button" onClick={() => onChange('variant-red', 'left')}>
      pick red left
    </button>
  ),
}));
import { DatingMatchingEditor } from '../DatingMatchingEditor';

beforeEach(() => {
  query.mockReturnValue({ data: structuredClone(DEFAULT_MATCHING_SETTINGS), isLoading: false });
  save.mockReset().mockResolvedValue(undefined);
  intimate.me = null;
  intimate.upsert.mockReset().mockResolvedValue(undefined);
});
const mount = () =>
  render(
    <MemoryRouter>
      <DatingMatchingEditor />
    </MemoryRouter>,
  );

const setMust = (label: string) =>
  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: `${label}: importance` })).getByRole('radio', {
      name: 'Must',
    }),
  );

describe('DatingMatchingEditor', () => {
  it('puts every matching criterion in a group, so none disappears from the page', () => {
    mount();
    for (const group of [/^Relationships/, /^Intimacy/, /^Communication & access/]) {
      fireEvent.click(screen.getByRole('button', { name: group }));
    }
    for (const field of MATCHING_FIELDS) {
      expect(screen.getByRole('radiogroup', { name: `${field.label}: importance` })).toBeTruthy();
    }
  });
  it('shows the discovery switch, the 18+ confirmation, and a save bar only once something changed', () => {
    mount();
    expect(screen.getByRole('switch', { name: 'Show me in dating discovery' })).toBeTruthy();
    expect(screen.getByText('I am 18 or older and choose to use dating discovery')).toBeTruthy();
    // Nothing to save yet: no save bar at all.
    expect(screen.queryByRole('button', { name: 'Save matching preferences' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dates' }));
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save matching preferences' })).toBeEnabled();
  });

  it('requires adult affirmation before enabling discovery', async () => {
    mount();
    fireEvent.click(screen.getByLabelText('Show me in dating discovery'));
    fireEvent.click(screen.getByRole('button', { name: 'Save matching preferences' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Affirm that you are 18 or older');
    expect(save).not.toHaveBeenCalled();
  });
  it('requires values for a required condition and saves only explicitly', async () => {
    mount();
    setMust('Age ranges');
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
    setMust('Age ranges');
    fireEvent.click(screen.getByRole('button', { name: '30-34' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save matching preferences' }));
    await waitFor(() => expect(screen.getByText('Network unavailable')).toBeInTheDocument());
    expect(
      within(screen.getByRole('radiogroup', { name: 'Age ranges: importance' })).getByRole(
        'radio',
        { name: 'Must' },
      ),
    ).toHaveAttribute('aria-checked', 'true');
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
  it('edits the hanky must in Intimacy and saves it without touching the rules', async () => {
    intimate.me = {
      consent_18plus_at: '2026-01-01',
      dating_prefs: { seeking: { genitalia: ['penis'], hanky: {} } },
    };
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Intimacy/ }));
    fireEvent.click(screen.getByRole('button', { name: 'pick red left' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save matching preferences' }));
    await waitFor(() => expect(intimate.upsert).toHaveBeenCalledOnce());
    // Only hanky stays in seeking; genitals live in the rules now.
    expect(intimate.upsert.mock.calls[0][0]).toEqual({
      dating_prefs: { seeking: { hanky: { 'variant-red': 'left' } } },
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('offers the hanky must only with an 18+ intimate profile', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Intimacy/ }));
    expect(screen.queryByText('Hanky code')).toBeNull();
  });
});
