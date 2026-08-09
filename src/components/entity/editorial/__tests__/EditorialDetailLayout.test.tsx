/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { EditorialDetailLayout } from '../EditorialDetailLayout';
import type { SectionDef } from '../types';

vi.mock('@/hooks/useBreadcrumbs', () => ({ useBreadcrumbs: () => undefined }));

/**
 * `EditorialSection` emits kicker + <h2> + action unconditionally, and the
 * layout also feeds every section to `SectionNav`. So a section with nothing in
 * it used to render a full heading block, a "see all" link and a live nav
 * anchor over an empty <div>.
 *
 * Verified in production on /going-out's "Scenes" in Zürich (no landmarks), and
 * reachable on /shop's "Categories" on every first paint before the query
 * settled. The guard lives here rather than in each page so all six intent
 * pages and /city/:slug get it at once.
 */

const render = (sections: SectionDef[]) =>
  renderWithProviders(
    <EditorialDetailLayout
      header={<h1>Header</h1>}
      sections={sections}
      breadcrumbs={[{ label: 'Test', href: '/test' }]}
      entityType="intent"
      loading={false}
      error={null}
    />,
  );

const full: SectionDef = { id: 'full', label: 'Full', content: <p>real content</p> };

describe('EditorialDetailLayout empty-section guard', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['false', false],
    ['an empty array', []],
  ])('drops a section whose content is %s', (_name, content) => {
    render([full, { id: 'empty', label: 'Empty Section', kicker: 'Kicker', content }]);
    expect(screen.queryByText('Empty Section')).not.toBeInTheDocument();
    expect(screen.queryByText('Kicker')).not.toBeInTheDocument();
    // and the nav entry goes with it
    expect(screen.getAllByText('Full').length).toBeGreaterThan(0);
  });

  // The dominant real-world case: content is a valid element whose COMPONENT
  // returns null (CityLandmarksRail, VillagesRail, GoNowRail, GuidesRail,
  // TrendingStrip). The layout cannot detect that, so callers declare it.
  it('drops a section flagged hidden even though content is a valid element', () => {
    const NullRail = () => null;
    render([full, { id: 'rail', label: 'Rail Section', hidden: true, content: <NullRail /> }]);
    expect(screen.queryByText('Rail Section')).not.toBeInTheDocument();
  });

  it('keeps a section whose child returns null when hidden is not set', () => {
    // Documents the limit of the automatic filter: without `hidden`, a
    // null-returning child still leaves its heading. This is why SectionDef
    // carries the flag at all.
    const NullRail = () => null;
    render([full, { id: 'rail', label: 'Rail Section', content: <NullRail /> }]);
    expect(screen.getAllByText('Rail Section').length).toBeGreaterThan(0);
  });

  it('renders sections that do have content', () => {
    render([full]);
    expect(screen.getByText('real content')).toBeInTheDocument();
    expect(screen.getAllByText('Full').length).toBeGreaterThan(0);
  });

  it('renders an empty-string content as-is rather than dropping it', () => {
    // '' is falsy but is a deliberate caller choice, not an absent section.
    render([{ id: 'blank', label: 'Blank', content: '' }]);
    expect(screen.getAllByText('Blank').length).toBeGreaterThan(0);
  });
});
