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

  // This row is a licence obligation, not a design element. The /about
  // colophon that used to carry it is members-only now, so for a signed-out
  // reader the footer is the ONLY place these credits appear — and the reader
  // of an OSM-derived diagram is exactly the person ODbL asks to be told.
  //
  // Asserted as a property over REQUIRED_ATTRIBUTION, not a retyped list, so a
  // source added to that constant is covered without anyone remembering this
  // file exists.
  it('credits every source whose licence requires attribution', () => {
    const { container } = renderFooter();
    expect(REQUIRED_ATTRIBUTION.length).toBeGreaterThan(0);
    for (const source of REQUIRED_ATTRIBUTION) {
      const link = within(container).getByRole('link', { name: source.name });
      expect(link).toHaveAttribute('href', source.href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      // The licence has to be named next to the credit. A bare link satisfies
      // nobody: "OpenStreetMap" without "ODbL" does not say what the terms are.
      expect(link.parentElement?.textContent).toContain(source.licence);
    }
  });

  // The credit must not become the complement of the /about gate. It renders
  // for everyone, so there is no auth state in which the obligation lapses —
  // including the window while auth is still resolving. The footer takes no
  // user prop and this test is what keeps it that way.
  it('renders the attribution with no auth state of any kind', () => {
    const { container } = renderFooter();
    expect(within(container).getByRole('link', { name: 'OpenStreetMap' })).toBeInTheDocument();
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
