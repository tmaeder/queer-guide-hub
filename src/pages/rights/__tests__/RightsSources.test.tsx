/**
 * @vitest-environment jsdom
 *
 * The methodology sections of /tags/rights-by-country/sources: every scoring
 * rule is published with its points, and the page offers a citation.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import RightsSources from '../RightsSources';
import { EQUALITY_SCORE_RULES } from '../../../../supabase/functions/_shared/equality-score';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/hooks/useIntentData', () => ({
  useAllCountriesRights: () => ({
    data: [{ equality_score: 80, lgbti_criminalization: { legal: true } }],
    isLoading: false,
    error: null,
  }),
}));

describe('RightsSources methodology', () => {
  it('publishes every scoring rule with signed points', () => {
    render(
      <MemoryRouter>
        <RightsSources />
      </MemoryRouter>,
    );
    const table = screen.getByRole('table', { name: /equality score points/i });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(EQUALITY_SCORE_RULES.length);
    expect(within(table).getByText('Same-sex marriage').closest('tr')).toHaveTextContent('+10');
    expect(
      within(table).getByText('Same-sex sexual acts are criminalised').closest('tr'),
    ).toHaveTextContent('−25');
  });

  it('offers a citation naming ILGA and the canonical URL', () => {
    render(
      <MemoryRouter>
        <RightsSources />
      </MemoryRouter>,
    );
    const cite = screen.getByTestId('rights-citation');
    expect(cite).toHaveTextContent('ILGA World Database');
    expect(cite).toHaveTextContent('https://queer.guide/tags/rights-by-country/sources');
    expect(screen.getByRole('button', { name: 'Copy citation' })).toBeInTheDocument();
  });

  it('confirms copying only after the citation is written', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(
      <MemoryRouter>
        <RightsSources />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy citation' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(screen.getByTestId('rights-citation').textContent);
  });

  for (const unavailable of [true, false]) {
    it(`provides manual copy guidance when the clipboard is ${unavailable ? 'unavailable' : 'denied'}`, async () => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: unavailable
          ? undefined
          : { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
      });
      render(
        <MemoryRouter>
          <RightsSources />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Copy citation' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Select and copy the citation above.',
      );
      expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
    });
  }
});
