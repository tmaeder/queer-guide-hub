/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updateProfile = vi.fn().mockResolvedValue({ error: null });
const toggleLookingFor = vi.fn().mockResolvedValue({ error: null });
const setMode = vi.fn();
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
vi.mock('@/hooks/useUserMode', () => ({ useUserMode: () => ({ mode: 'dating', setMode }) }));
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
    setMode.mockClear();
    derived = null;
  });

  // The mode picker used to live in a separate sheet and a separate Settings
  // card; it is part of this one editor now.
  it('renders the mode chips and saves a pick through useUserMode', () => {
    render(<StatusEditor />);
    expect(screen.getByText("What you're here for")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /header\.modes\.friends/ }));
    expect(setMode).toHaveBeenCalledWith('friends');
  });

  it('offers the next trip as travel intent', () => {
    derived = { tripId: 't1', cityName: 'Berlin' };
    render(<StatusEditor />);
    expect(screen.getByText(/Heading to Berlin/)).toBeTruthy();
  });

  it('compact mode shows the vibe line only', () => {
    render(<StatusEditor compact />);
    expect(screen.queryByText("What you're here for")).toBeNull();
    expect(screen.queryByText('Travel')).toBeNull();
  });

  it('renders both sections: vibe input and intent chips', () => {
    render(<StatusEditor />);
    expect(screen.getByPlaceholderText("What's your vibe?")).toBeTruthy();
    expect(screen.getByText('Looking for')).toBeTruthy();
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

  it('4h sets a future expiry', async () => {
    render(<StatusEditor />);
    // '4h' is a toggle now; the expiry applies on Save.
    fireEvent.click(screen.getByRole('button', { name: '4h' }));
    expect(screen.getByRole('button', { name: '4h' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    const arg = updateProfile.mock.calls[0][0];
    expect(arg.vibe_expires_at).toBeTruthy();
    expect(new Date(arg.vibe_expires_at).getTime()).toBeGreaterThan(Date.now());
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
