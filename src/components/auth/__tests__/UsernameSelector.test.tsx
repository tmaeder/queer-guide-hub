/**
 * @vitest-environment jsdom
 *
 * Note: the 400ms debounce on custom username input is intentionally
 * not exercised — unmounted-setTimeout cleanup races hang the vitest
 * forks worker (same issue as `useSearchProfiles` / `useSavedSearches`
 * debounce paths). Integration tests at the dialog level cover that
 * path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { invokeMock, rpcMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    rpc: rpcMock,
  },
}));

import { UsernameSelector } from '../UsernameSelector';

beforeEach(() => {
  invokeMock.mockReset();
  rpcMock.mockReset();
  invokeMock.mockResolvedValue({
    data: { usernames: ['queer_dev', 'enby_coder', 'pride_user'] },
    error: null,
  });
});

describe('UsernameSelector — suggestion list', () => {
  it('renders generated suggestions from the edge function', async () => {
    const onChange = vi.fn();
    render(<UsernameSelector value={null} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'queer_dev' })).toBeInTheDocument();
    });
    expect(invokeMock).toHaveBeenCalledWith('generate-usernames', { body: {} });
  });

  it("shows fetch error when generate-usernames fails", async () => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: new Error('out of quota'),
    });
    render(<UsernameSelector value={null} onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/out of quota/i)).toBeInTheDocument());
  });

  it("clicking a suggestion calls onChange with that name", async () => {
    const onChange = vi.fn();
    render(<UsernameSelector value={null} onChange={onChange} />);

    await waitFor(() => screen.getByRole('button', { name: 'queer_dev' }));
    fireEvent.click(screen.getByRole('button', { name: 'queer_dev' }));

    expect(onChange).toHaveBeenCalledWith('queer_dev');
  });

  it("Reroll button re-invokes generate-usernames", async () => {
    render(<UsernameSelector value={null} onChange={vi.fn()} />);
    await waitFor(() => screen.getByRole('button', { name: 'queer_dev' }));

    fireEvent.click(screen.getByRole('button', { name: /Reroll/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
  });
});

describe('UsernameSelector — selected display', () => {
  it('renders "Selected: <name>" when value provided', async () => {
    render(<UsernameSelector value="pride_user" onChange={vi.fn()} />);
    await waitFor(() => screen.getByText(/Selected:/i));
    // Selected label is rendered in a <span class="font-mono">.
    const selected = screen.getByText('pride_user', { selector: 'span.font-mono' });
    expect(selected).toBeInTheDocument();
  });
});

describe('UsernameSelector — custom input idle states', () => {
  it('shows custom-username input with the right placeholder + label', async () => {
    render(<UsernameSelector value={null} onChange={vi.fn()} />);
    await waitFor(() => screen.getByLabelText(/Or type your own custom username/i));
    const input = screen.getByLabelText(/Or type your own custom username/i);
    expect(input).toHaveAttribute('placeholder', '8–15 letters, starts with a letter');
  });
});
