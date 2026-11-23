/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updateProfile = vi.fn().mockResolvedValue({ error: null });
const toggleLookingFor = vi.fn().mockResolvedValue({ error: null });
let derived: { tripId: string; cityName: string } | null = null;

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: { vibe_emoji: '🌈', vibe_text: 'good day', looking_for: ['friends'] },
    updateProfile,
  }),
}));
vi.mock('@/hooks/useUserIntent', async () => {
  const actual =
    await vi.importActual<typeof import('@/hooks/useUserIntent')>('@/hooks/useUserIntent');
  return {
    LOOKING_FOR_OPTIONS: actual.LOOKING_FOR_OPTIONS,
    LOOKING_FOR_LABELS: actual.LOOKING_FOR_LABELS,
    useUserIntent: () => ({
      lookingFor: ['friends'],
      toggleLookingFor,
      travel: null,
      setTravel: vi.fn(),
    }),
    useDerivedTravelIntent: () => ({ data: derived }),
  };
});
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | Record<string, unknown>) => {
      if (typeof opts === 'string') return opts;
      const tpl = (opts?.defaultValue as string) ?? key;
      return tpl.replace(/\{\{(\w+)\}\}/g, (_m, n) => String(opts?.[n] ?? ''));
    },
  }),
}));
vi.mock('@/components/messaging/EmojiPicker', () => ({
  EmojiPicker: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

import { StatusEditor } from '../StatusEditor';

describe('StatusEditor', () => {
  beforeEach(() => {
    updateProfile.mockClear();
    toggleLookingFor.mockClear();
    derived = null;
  });

  // One "here for" row replaced the separate mode row; no mode chips remain.
  it('asks one here-for question, not a second mode row', () => {
    render(<StatusEditor />);
    expect(screen.getByText("I'm here for")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /header\.modes\./ })).toBeNull();
  });

  it('offers the next trip as travel intent', () => {
    derived = { tripId: 't1', cityName: 'Berlin' };
    render(<StatusEditor />);
    expect(screen.getByText(/Heading to Berlin/)).toBeTruthy();
  });

  it('shows no travel row without a trip', () => {
    render(<StatusEditor />);
    expect(screen.queryByText(/Heading to/)).toBeNull();
  });

  it('compact mode shows the vibe line only', () => {
    render(<StatusEditor compact />);
    expect(screen.queryByText("I'm here for")).toBeNull();
  });

  it('renders both sections: vibe input and intent chips', () => {
    render(<StatusEditor />);
    expect(screen.getByPlaceholderText("What's your vibe?")).toBeTruthy();
    expect(screen.getByText("I'm here for")).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dating/ })).toBeTruthy();
    // Active chip is pressed
    expect(screen.getByRole('button', { name: /Friends/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('Save persists vibe without expiry and calls onDone', async () => {
    const onDone = vi.fn();
    render(<StatusEditor onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    const arg = updateProfile.mock.calls[0][0];
    expect(arg.vibe_text).toBe('good day');
    expect(arg.vibe_expires_at).toBeNull();
    expect(onDone).toHaveBeenCalled();
  });

  it('Clear nulls all vibe fields', async () => {
    render(<StatusEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    expect(updateProfile.mock.calls[0][0]).toMatchObject({
      vibe_emoji: null,
      vibe_text: null,
      vibe_set_at: null,
      vibe_expires_at: null,
    });
  });

  it('chip toggle delegates to useUserIntent', () => {
    render(<StatusEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Dating/ }));
    expect(toggleLookingFor).toHaveBeenCalledWith('dating');
  });
});
