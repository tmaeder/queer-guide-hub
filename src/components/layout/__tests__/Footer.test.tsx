import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
vi.mock('@/components/theme/ThemeToggle', () => ({ ThemeToggle: () => <button>Theme</button> }));
vi.mock('@/components/i18n/CurrencySelector', () => ({ CurrencySelector: () => <span>Currency</span> }));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => <span>Lang</span> }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'footer.about': 'About',
        'footer.legalLink': 'Legal',
        'footer.privacy': 'Privacy',
        'footer.terms': 'Terms',
        'footer.contact': 'Contact',
        'footer.supportUs': 'Support Us',
      };
      return map[key] ?? key;
    },
  }),
}));
import { Footer } from '../Footer';
describe('Footer', () => {
  it('should render footer links', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.getByText('Privacy')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });
  it('should render copyright', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(screen.getByText(/Queer Guide/)).toBeInTheDocument();
  });
});
