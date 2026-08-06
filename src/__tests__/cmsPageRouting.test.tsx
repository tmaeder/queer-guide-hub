/**
 * @vitest-environment jsdom
 *
 * Regression guard for the /p/:slug ↔ optional :locale? collision.
 *
 * Same bug class as submitRouting.test.tsx. The locale layout parent is
 * `<Route path="/:locale?">`; React Router expands the optional segment, so for
 * a URL like /p/about two branches match and score IDENTICALLY (17):
 *   - /:locale/about   (locale="p" → About page)  — an earlier-declared sibling
 *   - /p/:slug         (slug="about" → CMSPage)
 * The tie breaks toward the earlier-declared sibling, so LocaleRouter sees "p"
 * as an unknown locale and renders NotFound.
 *
 * This bites ONLY the CMS slugs that also name a top-level route (about,
 * contact, help, blog, press, …). A slug with no top-level namesake resolves
 * fine — "p" is not swallowed because it is one character, it is swallowed
 * because the *second* segment happens to name a real route.
 *
 * The fix declares `p/:slug` as the FIRST child of the locale parent so it wins
 * every score tie for a URL starting with `/p/`. It cannot steal any other URL
 * because its first segment is static.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'en', changeLanguage: () => {} },
  }),
}));

vi.mock('@/providers/SearchTelemetryProvider', () => ({
  useSearchTelemetry: () => {},
}));

vi.mock('@/components/security/AdminRouteGuard', () => ({
  AdminRouteGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/motion', () => ({
  MotionPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mirror the real Page.tsx param read so the test catches not just "a CMS page
// rendered" but "the right slug reached it".
vi.mock('@/pages/Page', async () => {
  const { useParams } = await import('react-router');
  const PageMock = () => {
    const { slug } = useParams<{ slug: string }>();
    return <div>CMS_PAGE_SENTINEL:{slug ?? 'NONE'}</div>;
  };
  return { default: PageMock };
});
vi.mock('@/pages/NotFound', () => ({ default: () => <div>NOT_FOUND_SENTINEL</div> }));
vi.mock('@/pages/About', () => ({ default: () => <div>ABOUT_SENTINEL</div> }));
vi.mock('@/pages/Contact', () => ({ default: () => <div>CONTACT_SENTINEL</div> }));
vi.mock('@/pages/HelpHotlines', () => ({ default: () => <div>HELP_SENTINEL</div> }));

import { AppRoutes } from '@/routes';

/**
 * Every single-segment route declared under the `/:locale?` parent. A CMS page
 * whose slug matches one of these is exactly the set that the collision breaks,
 * so `/p/<name>` must resolve to the CMS page for all of them.
 * Regenerate with:
 *   sed -n '/path="\/:locale?"/,/^ *<\/Route>/p' src/routes.tsx \
 *     | grep -oE 'path="[^"]*"' | sed 's/path="//;s/"//' | grep -vE '/|\*' | sort -u
 */
const TOP_LEVEL_ROUTE_NAMES = [
  'about', 'about-hub', 'accessibility', 'africa', 'blog', 'bookings', 'cities',
  'community', 'contact', 'cookies', 'cruising', 'dashboard', 'directory',
  'discover', 'dmca', 'donate', 'europe', 'events', 'favorites', 'feed',
  'feedback', 'festivals', 'flights', 'friends', 'going-out', 'groups',
  'guides', 'help', 'help-hotlines', 'history', 'home', 'hotels', 'hub',
  'inbox', 'intimate', 'kink', 'legal', 'login', 'mailbox', 'map',
  'marketplace', 'me', 'messages', 'milestones', 'my-groups', 'news',
  'organizations', 'people', 'personalities', 'places', 'press', 'pride',
  'privacy', 'quests', 'resources', 'ressources', 'rights', 'search',
  'settings', 'share-target', 'shop', 'signin', 'sitemap', 'submit', 'support',
  'sustainability', 'tags', 'terms', 'travel', 'trips', 'users', 'values',
  'venues', 'villages', 'vision', 'wishlists',
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

async function expectCmsPage(path: string, slug: string) {
  const { unmount } = renderAt(path);
  expect(
    await screen.findByText(`CMS_PAGE_SENTINEL:${slug}`),
    `${path} should render the CMS page for "${slug}", not NotFound or a top-level page`,
  ).toBeTruthy();
  expect(screen.queryByText('NOT_FOUND_SENTINEL')).toBeNull();
  unmount();
}

describe('CMS page route resolution', () => {
  it('resolves a slug with no top-level namesake', async () => {
    await expectCmsPage('/p/some-editorial-page', 'some-editorial-page');
  });

  it('resolves the slugs that exist in cms_pages today', async () => {
    for (const slug of ['about', 'contact', 'help']) {
      await expectCmsPage(`/p/${slug}`, slug);
    }
  });

  it('resolves a slug colliding with any top-level route name', async () => {
    for (const slug of TOP_LEVEL_ROUTE_NAMES) {
      await expectCmsPage(`/p/${slug}`, slug);
    }
  });

  it('resolves the locale-prefixed form', async () => {
    await expectCmsPage('/en/p/about', 'about');
    await expectCmsPage('/de/p/contact', 'contact');
  });

  it('still resolves the standalone top-level pages', async () => {
    const about = renderAt('/about');
    expect(await screen.findByText('ABOUT_SENTINEL')).toBeTruthy();
    about.unmount();

    const contact = renderAt('/contact');
    expect(await screen.findByText('CONTACT_SENTINEL')).toBeTruthy();
    contact.unmount();

    const help = renderAt('/help');
    expect(await screen.findByText('HELP_SENTINEL')).toBeTruthy();
    help.unmount();
  });
});
