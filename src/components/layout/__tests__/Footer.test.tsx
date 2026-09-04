import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
vi.mock('@/components/theme/ThemeToggle', () => ({ ThemeToggle: () => <button>Theme</button> }));
vi.mock('@/components/i18n/CurrencySelector', () => ({
  CurrencySelector: () => <span>Currency</span>,
}));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <span>Lang</span>,
}));
// The real `t` returns the fallback when a key is unresolved, and every string
// in the footer passes one. The previous mock ignored the second argument and
// returned the bare key, so any assertion about actual copy silently tested the
// key instead — which is how the ODbL attribution could have gone missing
// without a test noticing.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
import { Footer } from '../Footer';
import { INTENT_NAV } from '@/config/navigation';
import { REQUIRED_ATTRIBUTION } from '@/lib/attribution';

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

describe('Footer', () => {
  it('should render footer links', () => {
    renderFooter();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.getByText('Privacy')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });

  it('should render copyright', () => {
    renderFooter();
    expect(screen.getByText(/Queer Guide/)).toBeInTheDocument();
  });

  // The data-attribution row was removed from the footer on 2026-09-04 by an
  // explicit product decision. This asserts its ABSENCE rather than leaving no
  // test at all, so that re-adding it is a deliberate edit to this file and
  // not something that drifts back in — and so the removal is legible as a
  // decision. `REQUIRED_ATTRIBUTION` still drives the /about colophon
  // (`src/pages/__tests__/About.test.tsx`); it is simply no longer rendered
  // anywhere a signed-out reader can see.
  it('does not render the data-attribution row', () => {
    const { container } = renderFooter();
    for (const source of REQUIRED_ATTRIBUTION) {
      expect(within(container).queryByRole('link', { name: source.name })).toBeNull();
    }
    expect(container.textContent).not.toContain('ODbL');
  });

  // The columns exist so the footer teaches the same six jobs the topbar does.
  // Asserting against INTENT_NAV rather than a literal list is the point: if a
  // seventh intent ships and the footer silently keeps rendering six, this
  // fails — which is the drift that once made /venues unreachable.
  it('renders one column per intent, headed by its own route', () => {
    renderFooter();
    const nav = screen.getByRole('navigation', { name: 'Footer navigation' });
    for (const intent of INTENT_NAV) {
      const heading = within(nav).getByRole('link', { name: intent.fallback });
      expect(heading).toHaveAttribute('href', intent.to);
    }
  });

  it('renders every child link the intent declares', () => {
    renderFooter();
    const nav = screen.getByRole('navigation', { name: 'Footer navigation' });
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    for (const intent of INTENT_NAV) {
      for (const child of intent.children) {
        expect(hrefs, `${intent.id} → ${child.to} missing`).toContain(child.to);
      }
    }
  });

  // "Report something" pointed at /report for as long as this footer existed
  // and no such route was ever registered, so the anti-discrimination block's
  // only call to action landed on the 404 board.
  it('sends "Report something" to a route that exists', () => {
    renderFooter();
    const report = screen.getByRole('link', { name: 'Report something' });
    expect(report).toHaveAttribute('href', '/contact?category=safety');
  });
});

describe('Footer, compact (panel 09)', () => {
  const renderCompact = () =>
    render(
      <MemoryRouter>
        <Footer variant="compact" />
      </MemoryRouter>,
    );

  // The whole point of the variant: whatever else drops, these two do not.
  it('keeps report and hotlines', () => {
    renderCompact();
    expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute(
      'href',
      '/contact?category=safety',
    );
    expect(screen.getByRole('link', { name: 'Hotlines' })).toHaveAttribute('href', '/help');
  });

  it('drops the track columns and the crisis card', () => {
    renderCompact();
    expect(screen.queryByRole('navigation', { name: 'Footer navigation' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Crisis lines/)).not.toBeInTheDocument();
  });

  it('leads with report, not with the legal links', () => {
    renderCompact();
    const nav = screen.getByRole('navigation', { name: 'Footer essentials' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(labels).toEqual(['Report', 'Hotlines', 'Privacy', 'Terms']);
  });
});
