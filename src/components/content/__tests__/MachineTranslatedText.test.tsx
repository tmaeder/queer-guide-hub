import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const { rpcMock, lang } = vi.hoisted(() => ({ rpcMock: vi.fn(), lang: { current: 'de' } }));

vi.mock('@/integrations/supabase/untyped', () => ({ untypedRpc: rpcMock }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback: string) => fallback,
    i18n: { language: lang.current },
  }),
}));

import { MachineTranslatedText } from '../MachineTranslatedText';

const ORIGINAL = 'A welcoming bar in Lisbon.';
let id = 0;
const renderIt = (i18n: Record<string, string> | null) =>
  render(
    <MachineTranslatedText
      entityType="venues"
      entityId={`v${++id}`}
      original={ORIGINAL}
      i18n={i18n}
    >
      {(text) => <p data-testid="body">{text}</p>}
    </MachineTranslatedText>,
  );

describe('MachineTranslatedText', () => {
  beforeEach(() => {
    rpcMock.mockReset().mockResolvedValue({ data: 1, error: null });
    lang.current = 'de';
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh) Safari/605',
      configurable: true,
    });
  });

  it('shows the translation with a label and toggles to the original', () => {
    renderIt({ de: 'Eine einladende Bar in Lissabon.' });
    expect(screen.getByTestId('body').textContent).toBe('Eine einladende Bar in Lissabon.');
    expect(screen.getByText(/Machine-translated/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show original' }));
    expect(screen.getByTestId('body').textContent).toBe(ORIGINAL);
    expect(
      screen.getByRole('button', { name: 'Show translation' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('shows the original without a label and requests a translation when none exists', () => {
    renderIt({ fr: 'Un bar accueillant.' });
    expect(screen.getByTestId('body').textContent).toBe(ORIGINAL);
    expect(screen.queryByText(/Machine-translated/)).toBeNull();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('request_translation', {
      p_entity_type: 'venues',
      p_entity_id: `v${id}`,
      p_locale: 'de',
    });
  });

  it('never requests on English pages or for crawlers', () => {
    lang.current = 'en';
    renderIt(null);
    lang.current = 'ja';
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (compatible; Googlebot/2.1)',
      configurable: true,
    });
    renderIt(null);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Machine-translated/)).toBeNull();
  });

  it('treats regional locales as their primary language (de-CH → de)', () => {
    lang.current = 'de-CH';
    renderIt({ de: 'Übersetzt.' });
    expect(screen.getByTestId('body').textContent).toBe('Übersetzt.');
  });
});
