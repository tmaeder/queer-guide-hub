/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// Mirrors ConsolidatedStats: every field is `number | null`, and the page must
// read `events_upcoming` (actionable) rather than `events` (the 40k archive,
// 99% of it in the past). The two are deliberately different here so a
// regression back to `events` shows up as the wrong number on screen.
vi.mock('@/hooks/useConsolidatedStats', () => ({
  useConsolidatedStats: () => ({
    stats: {
      venues: 21000,
      profiles: null,
      cities: 1800,
      countries: 180,
      events: 40000,
      events_upcoming: 320,
      posts: null,
      personalities: null,
      groups: null,
      tags: null,
      marketplace: null,
      news: null,
      cms: null,
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

// The colophon is members-only, so About now calls `useAuth`, which throws
// outside an AuthProvider. Mocked rather than wrapped in a real provider: the
// provider talks to Supabase on mount, and every assertion below is about what
// a given auth state renders, not about how that state is obtained.
let mockUser: { id: string } | null = null;
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

import About from '../About';
import { REQUIRED_ATTRIBUTION } from '@/lib/attribution';
import { submissionRegistry } from '@/config/submissionRegistry';

const renderAbout = () =>
  render(
    <MemoryRouter>
      <About />
    </MemoryRouter>,
  );

describe('About', () => {
  beforeEach(() => {
    // Signed in by DEFAULT, so the pre-existing colophon assertions keep
    // measuring the colophon. A signed-out default would turn every one of
    // them into a vacuous pass against a section that no longer renders.
    mockUser = { id: 'member' };
  });

  it('renders without crashing', () => {
    const { container } = renderAbout();
    expect(container).toBeTruthy();
  });

  it('shows upcoming events, not the full archive', () => {
    renderAbout();
    expect(screen.getByText('320+')).toBeInTheDocument();
    expect(screen.queryByText('40,000+')).not.toBeInTheDocument();
  });

  // The colophon is the only place several of these are credited at all, and
  // for six of them the credit is a licence condition rather than a courtesy.
  // Deleting a row to tidy the section is therefore a licence breach, not a
  // design decision — this is what stops it.
  //
  // Driven off REQUIRED_ATTRIBUTION rather than a list retyped here, because
  // that constant is what the footer renders for signed-out readers. Two hand-
  // maintained lists would be free to disagree about who is owed a credit, and
  // the version this replaced already had: it named four sources and omitted
  // World Bank and Wikidata, both CC BY variants that do compel attribution.
  it('credits every source whose licence requires attribution', () => {
    const { container } = renderAbout();
    const section = container.querySelector('#sources');
    expect(section).toBeTruthy();
    const text = section?.textContent ?? '';
    expect(REQUIRED_ATTRIBUTION.length).toBeGreaterThan(0);
    for (const source of REQUIRED_ATTRIBUTION) {
      expect(text).toContain(source.name);
    }
  });

  // The gate itself. `#sources` absent is only evidence of the gate if the
  // page around it rendered, hence the positive control — otherwise a crash in
  // About would pass this test.
  it('hides the colophon from signed-out readers', () => {
    mockUser = null;
    const { container } = renderAbout();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(container.querySelector('#sources')).toBeNull();
  });

  // A property, not a list: whatever the colophon names, it must actually
  // reach. A credit that renders as bare text credits nobody, and an
  // unattributed `target="_blank"` is a tabnabbing hole. Written this way so a
  // source added later is covered without anyone remembering to extend a test.
  it('makes every credit a safe outbound link', () => {
    const { container } = renderAbout();
    const links = Array.from(container.querySelectorAll('#sources a'));
    expect(links.length).toBeGreaterThan(20);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  // For as long as the "get involved" tiles existed, "Add a venue" pointed at
  // `/venues/new` and "Post an event" at `/events/new`. Neither is a route.
  // Both fell through to the detail route's `:slug`, so on prod the first
  // opened a real unrelated New York bar whose slug is "new" and the second a
  // soft 404 — a wrong destination that looks deliberate, which is worse than
  // a 404 because nothing reports it.
  //
  // Asserted as a PROPERTY against `submissionRegistry` (the same object
  // routes.tsx generates the static /submit/<slug> routes from) rather than
  // against the two strings that were wrong, so a third tile inventing a new
  // create-path is caught too.
  it('sends every submission CTA to a real /submit route', () => {
    const { container } = renderAbout();
    const slugs = Object.keys(submissionRegistry);
    expect(slugs).toContain('venue');
    expect(slugs).toContain('event');

    const internal = Array.from(container.querySelectorAll('a[href^="/"]')).map(
      (a) => a.getAttribute('href') ?? '',
    );
    expect(internal.length).toBeGreaterThan(0);

    for (const href of internal) {
      // Nothing may point at a create-path under a detail route.
      expect(href).not.toMatch(/^\/(venues|events|hotels|marketplace)\/new$/);
      // Anything that does claim to be a submission path must name a type
      // the registry actually publishes a route for.
      const submit = href.match(/^\/submit\/([^/?#]+)/);
      if (submit) expect(slugs).toContain(submit[1]);
    }
  });

  // The page used to describe a volunteer movement that does not exist:
  // "verified by the community" and "reviewed by real people" against zero
  // venue reviews and zero user submissions, a "local ambassadors" corps that
  // appears in src/ only as a gamification tier, and moderators working
  // "around the clock" — which /contact now correctly tells a person in
  // crisis is NOT the case. Measured on prod 2026-09-05: 1 moderator, 17
  // accounts, 0 reviews, 0 check-ins, 0 submissions, and 26,528 of 26,905
  // venues carrying a recorded upstream source.
  //
  // Scanned over rendered text rather than source, so it covers the copy a
  // reader actually gets in either auth state.
  it('makes no community-verification claim the data does not support', () => {
    for (const signedIn of [true, false]) {
      mockUser = signedIn ? { id: 'member' } : null;
      const { container, unmount } = renderAbout();
      const text = container.textContent ?? '';
      // Positive control: a crash or an empty render must not pass this.
      expect(text).toContain('Queer Guide');
      for (const claim of [
        /verified by the community/i,
        /reviewed by real/i,
        /ambassador/i,
        /around the clock/i,
        /contributor circle/i,
      ]) {
        expect(text).not.toMatch(claim);
      }
      unmount();
    }
  });

  it('renders one route bullet per line in the line index', () => {
    renderAbout();
    for (const label of ['Venue', 'Event', 'Marketplace', 'Group', 'City']) {
      expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
    }
  });
});
