import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
vi.mock('@/components/theme/ThemeToggle', () => ({ ThemeToggle: () => <button>Theme</button> }));
vi.mock('@/components/i18n/CurrencySelector', () => ({
  CurrencySelector: () => <span>Currency</span>,
}));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <span>Lang</span>,
}));
// The footer reads published branding for the compact variant's home-link
// accessible name — it carried a hardcoded "Queer Guide" while the Header read
// the same value from this hook, so a rebranded /admin/design deployment still
// announced the stock name there.
//
// `useSiteBranding` wraps `useQuery`, and this suite renders Footer BARE with
// no QueryClientProvider, so adding the hook turned all nine tests into "No
// QueryClient set". It is mocked at the module boundary rather than wrapping
// the suite in a provider: a provider would quietly convert a layout test into
// a data-fetching test.
vi.mock('@/hooks/useSiteBranding', () => ({
  useSiteBranding: () => ({ siteName: 'Queer Guide' }),
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
import { OPEN_COOKIE_PREFERENCES_EVENT } from '@/lib/analyticsConsent';

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
    fireEvent.click(screen.getByText('Site information'));
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.getByText('Privacy')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'API & agents' })).toHaveAttribute('href', '/docs');
    expect(screen.getByRole('link', { name: 'Email updates' })).toHaveAttribute(
      'href',
      '/email-updates',
    );
  });

  it('keeps essentials visible while secondary links are collapsed', () => {
    renderFooter();
    expect(screen.getByText('Email updates')).not.toBeVisible();
    for (const name of ['Report', 'Crisis support', 'Privacy']) {
      expect(screen.getByRole('link', { name })).toBeVisible();
    }
    const summary = screen.getByText('Site information');
    fireEvent.click(summary);
    expect(screen.getByRole('link', { name: 'Email updates' })).toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByText('Email updates')).not.toBeVisible();
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

  it('keeps every top-level intent reachable in the compact navigation row', () => {
    renderFooter();
    const nav = screen.getByRole('navigation', { name: 'Footer navigation' });
    expect(within(nav).getAllByRole('link')).toHaveLength(INTENT_NAV.length);
    for (const intent of INTENT_NAV) {
      expect(within(nav).getByRole('link', { name: intent.fallback })).toHaveAttribute(
        'href',
        intent.to,
      );
    }
  });

  it('opens cookie preferences after consent has already been saved', () => {
    renderFooter();
    const listener = vi.fn();
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, listener);
    screen.getByRole('button', { name: 'Cookie preferences' }).click();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, listener);
  });

  it('keeps crisis support directly reachable', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: 'Crisis support' })).toHaveAttribute('href', '/help');
  });

  // "Report" pointed at /report for as long as this footer existed
  // and no such route was ever registered, so the anti-discrimination block's
  // only call to action landed on the 404 board.
  it('sends "Report" to a route that exists', () => {
    renderFooter();
    const report = screen.getByRole('link', { name: 'Report' });
    expect(report).toHaveAttribute('href', '/submit/feedback?category=safety');
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
      '/submit/feedback?category=safety',
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
