/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { LegalPageLayout } from '../LegalPageLayout';
import type { RouteStation } from '@/components/transit/RouteStrip';

const SECTIONS: RouteStation[] = [
  { id: 'acceptance', title: 'Acceptance of Terms', depth: 1 },
  { id: 'description', title: 'Description of Service', depth: 1 },
  { id: 'sub', title: 'A sub-clause', depth: 2 },
];

const renderTerms = (props: Partial<Parameters<typeof LegalPageLayout>[0]> = {}) =>
  renderWithProviders(
    <LegalPageLayout
      title="Terms of Service"
      subtitle="Rules and guidelines"
      lastUpdated="23 June 2026"
      sections={SECTIONS}
      slug="terms"
      {...props}
    >
      <p>body</p>
    </LegalPageLayout>,
  );

describe('LegalPageLayout', () => {
  // jsdom shares one `window.location` across every test in a file, and the
  // layout seeds its active station from the fragment — so a hash left behind
  // by an earlier test silently changes the next one's starting state.
  beforeEach(() => {
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('renders one masthead shape for every policy', () => {
    renderTerms();
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByText('Rules and guidelines')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
  });

  it('carries the line bullet for its slug', () => {
    renderTerms();
    expect(screen.getAllByLabelText('Terms line').length).toBeGreaterThan(0);
  });

  it('states the last-updated date and how long the document is', () => {
    const { container } = renderTerms();
    // Only full stations count — a reader asking "how long is this" means
    // sections, not the sub-clauses inside them. SECTIONS has 3 entries, one
    // of which is depth 2, so this must read 2.
    const stamp = [...container.querySelectorAll('header > p')].at(-1)!;
    expect(stamp.textContent).toContain('23 June 2026');
    expect(stamp.textContent).toContain('2 sections');
  });

  it('renders both rails: the sticky sidebar and the mobile band', () => {
    renderTerms();
    const rails = screen.getAllByRole('navigation', { name: 'Sections of this policy' });
    expect(rails).toHaveLength(2);
  });

  it('links on to the sibling lines but never back to itself', () => {
    const { container } = renderTerms();
    const end = container.querySelector('section[aria-labelledby="end-of-line"]')!;
    const hrefs = within(end as HTMLElement)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((h) => !h?.startsWith('mailto:'));
    expect(hrefs).toEqual(['/privacy', '/cookies', '/dmca']);
  });

  it('gives the contact address exactly once', () => {
    // It used to be hardcoded here AND again in the legal hub, so the two
    // could drift apart.
    renderTerms();
    expect(screen.getAllByText('legal@queer.guide')).toHaveLength(1);
  });

  it('renders a page with no sections without a rail', () => {
    renderWithProviders(
      <LegalPageLayout title="Terms" sections={[]}>
        <p>body</p>
      </LegalPageLayout>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Terms' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Sections of this policy' })).toBeNull();
  });

  it('takes an extra footer block before the end-of-line card', () => {
    renderTerms({ footer: <div>live controls</div> });
    expect(screen.getByText('live controls')).toBeInTheDocument();
  });

  describe('scroll-spy', () => {
    /** jsdom does no layout, so every rect is 0×0 — position has to be faked. */
    const positionHeadings = (tops: Record<string, number>) => {
      for (const [id, top] of Object.entries(tops)) {
        const el = document.getElementById(id);
        if (el) el.getBoundingClientRect = () => ({ top }) as DOMRect;
      }
    };

    const renderWithHeadings = () =>
      renderWithProviders(
        <LegalPageLayout title="Terms of Service" sections={SECTIONS} slug="terms">
          <div>
            <h2 id="acceptance">Acceptance of Terms</h2>
            <h2 id="description">Description of Service</h2>
            <h3 id="sub">A sub-clause</h3>
          </div>
        </LegalPageLayout>,
      );

    const activeHrefs = () =>
      screen
        .getAllByRole('navigation', { name: 'Sections of this policy' })
        .flatMap((nav) => within(nav).queryAllByRole('link'))
        .filter((a) => a.getAttribute('aria-current') === 'true')
        .map((a) => a.getAttribute('href'));

    it('moves the marker to the last station above the trigger line', async () => {
      // This is the regression an IntersectionObserver could not carry: it
      // reports *changes* in intersection, so once section 1 was far above the
      // fold it had nothing left to report and the rail stayed pinned to it.
      renderWithHeadings();
      positionHeadings({ acceptance: -900, description: 40, sub: 600 });
      fireEvent.scroll(window);

      await waitFor(() => {
        expect(activeHrefs()).toEqual(['#description', '#description']);
      });
    });

    it('does not advance to a station still below the trigger line', async () => {
      renderWithHeadings();
      positionHeadings({ acceptance: 20, description: 800, sub: 1200 });
      fireEvent.scroll(window);

      await waitFor(() => {
        expect(activeHrefs()).toEqual(['#acceptance', '#acceptance']);
      });
    });

    it('writes the fragment when the reader moves between stations', async () => {
      renderWithHeadings();
      positionHeadings({ acceptance: 20, description: 800, sub: 1200 });
      fireEvent.scroll(window);
      await waitFor(() => expect(activeHrefs()).toEqual(['#acceptance', '#acceptance']));

      // jsdom does no layout, so until the stub above lands every heading
      // reports top 0 and the very first resolve picks the LAST station.
      // That artifact is not a reader movement — drop the fragment it wrote.
      // The real "clean URL on load" guarantee needs real layout and is
      // asserted in e2e/legal-pages.spec.ts.
      window.history.replaceState(null, '', window.location.pathname);

      positionHeadings({ acceptance: -900, description: 40, sub: 600 });
      fireEvent.scroll(window);
      await waitFor(() => expect(window.location.hash).toBe('#description'));
    });
  });
});
