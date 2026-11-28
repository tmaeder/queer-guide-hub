import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import CultureSymbols from '@/pages/CultureSymbols';

const hook = vi.hoisted(() => ({ useCulturalSymbols: vi.fn() }));
vi.mock('@/hooks/useCulturalSymbols', () => hook);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (_key: string, def: string, vars?: Record<string, unknown>) =>
      def.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars?.[k] ?? '')),
  }),
}));

describe('CultureSymbols', () => {
  it('lists each symbol and links only those with a glossary entry', () => {
    hook.useCulturalSymbols.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          slug: 'lambda',
          name: 'Lambda',
          era: '1970',
          meaning: 'Chosen by the New York Gay Activists Alliance.',
          glossarySlug: 'lambda',
        },
        {
          slug: 'violets',
          name: 'Violets',
          era: 'Antiquity',
          meaning: 'A flower associated with Sappho.',
          glossarySlug: null,
        },
      ],
    });
    renderWithProviders(<CultureSymbols />);

    expect(screen.getByRole('heading', { level: 1, name: 'Queer symbols' })).toBeInTheDocument();
    expect(screen.getByText('A flower associated with Sappho.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Glossary entry: Lambda' })).toHaveAttribute(
      'href',
      '/tags/lambda',
    );
    expect(screen.queryByRole('link', { name: 'Glossary entry: Violets' })).toBeNull();
    expect(screen.getByRole('link', { name: 'See all pride flags' })).toHaveAttribute(
      'href',
      '/tags/c/symbols-flags',
    );
  });

  it('says so when the list cannot load', () => {
    hook.useCulturalSymbols.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    renderWithProviders(<CultureSymbols />);
    expect(screen.getByText('This list could not be loaded right now.')).toBeInTheDocument();
  });
});
