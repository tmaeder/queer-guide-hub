import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { SafeModeProvider } from '@/providers/SafeModeProvider';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/components/tags/TagRelationshipGraph', () => ({ default: () => <div>graph</div> }));

let aliasHits: unknown[] = [];
vi.mock('@/hooks/useTagAliasSearch', () => ({
  useTagAliasSearch: () => ({ hits: aliasHits, loading: false }),
}));

const cat = (id: string, name: string, parent: string) => [
  { id, name, is_primary: true, level: 1, parent_name: parent },
];

const tag = (over: Record<string, unknown> = {}) => ({
  id: 'a',
  name: 'Bear',
  slug: 'bear',
  usage_count: 3,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  categories: cat('c1', 'Slang & Terminology', 'Community & Culture'),
  ...over,
});

const PLAIN = [
  tag({ id: '1', name: 'Bear', slug: 'bear' }),
  tag({
    id: '2',
    name: 'Drag',
    slug: 'drag',
    categories: cat('c2', 'Expression & Presentation', 'Identity & Expression'),
  }),
];

/** Filed under the one parent the age gate covers. */
const ADULT = tag({
  id: '3',
  name: 'Puppy play',
  slug: 'puppy-play',
  categories: cat('c3', 'Practices & Play', 'Sexuality & Kink'),
});

let corpus: unknown[] = PLAIN;
// Mutable so a test can hold the page in its loading state, the same way
// `corpus` and `aliasHits` are swapped above.
let tagsLoading = false;
vi.mock('@/hooks/useCentralizedTags', () => ({
  useCentralizedTags: () => ({
    allTags: tagsLoading ? [] : corpus,
    categoriesTree: [
      {
        id: 'p1',
        name: 'Identity & Expression',
        slug: 'identity-expression',
        level: 0,
        sort_order: 0,
        tag_count: 1,
        total_tag_count: 1,
        children: [
          {
            id: 'c2',
            name: 'Expression & Presentation',
            slug: 'expression-presentation',
            level: 1,
            sort_order: 0,
            parent_id: 'p1',
            tag_count: 1,
          },
        ],
      },
    ],
    loading: tagsLoading,
    error: null,
  }),
  useTagUsageCounts: () => ({ data: { Bear: 5, Drag: 2 } }),
}));

import TagsIndex from '../TagsIndex';

const wrap = (route: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const W = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <SafeModeProvider>{children}</SafeModeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return W;
};

const renderAt = (route: string) =>
  render(
    <Routes>
      <Route path="/tags" element={<TagsIndex />} />
      <Route path="/tags/c/:categorySlug" element={<TagsIndex />} />
      <Route path="/personalities" element={<div>personalities</div>} />
    </Routes>,
    { wrapper: wrap(route) },
  );

beforeEach(() => {
  corpus = PLAIN;
  aliasHits = [];
  tagsLoading = false;
  localStorage.clear();
});

describe('TagsIndex', () => {
  // A page must be able to say what it is before its data arrives.
  //
  // The loading branch used to render the spinner alone, so /tags had no `h1`
  // until `useCentralizedTags()` resolved — which made the page's identity a
  // function of database latency. `e2e/intent-nav.spec.ts` asserts `main h1`
  // is visible within 5s, and on 2026-08-24 that failed three times running on
  // a PR that had not touched tags, while the tag tables were slow enough that
  // `tag_hygiene_stats()` was returning 57014 statement timeouts. The right fix
  // is a heading that does not wait, not a longer timeout — a screen reader on
  // a slow connection got an unlabelled spinner too.
  it('names itself while still loading, so the heading never waits on the query', () => {
    tagsLoading = true;
    renderAt('/tags');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/glossary/i);
  });

  it('leads with browse and search, not a help hub', () => {
    // The regression this guards: the page it replaces was headlined "Help &
    // resources." and hid the glossary behind a collapsed disclosure.
    renderAt('/tags');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/glossary/i);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByText(/help & resources/i)).not.toBeInTheDocument();
  });

  it('renders the result set immediately — no disclosure to open', () => {
    renderAt('/tags');
    expect(screen.getByRole('link', { name: /Bear/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Drag/ })).toBeInTheDocument();
  });

  it('carries no crisis strip, topic hubs or org directory', () => {
    renderAt('/tags');
    expect(screen.queryByText(/hotline/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/topic hubs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/support organisations/i)).not.toBeInTheDocument();
  });

  it('offers all four display modes as tabs', () => {
    renderAt('/tags');
    const tabs = screen.getAllByRole('tab').map((el) => el.textContent);
    expect(tabs.join(' ')).toMatch(/Grid/);
    expect(tabs.join(' ')).toMatch(/List/);
    expect(tabs.join(' ')).toMatch(/Chips/);
    expect(tabs.join(' ')).toMatch(/Graph/);
  });

  it('narrows to one line on /tags/c/:categorySlug and drops the site-wide stats', () => {
    renderAt('/tags/c/identity-expression');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Identity/);
    expect(screen.getByRole('link', { name: /Drag/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Bear/ })).not.toBeInTheDocument();
    // The ink scale-board is site-wide; restating it on a category is a lie.
    expect(screen.queryByText(/the corpus/i)).not.toBeInTheDocument();
  });

  it('puts ONLY the count in the live region, never the grid itself', () => {
    // Announcing a whole list of cards on every keystroke is what makes a live
    // region hostile with a screen reader, so the structural assertion (no
    // links inside the region) is the one that matters here. The number itself
    // is covered by the filter tests — i18next is not initialised under vitest,
    // so `t()` returns the raw default and `{{count}}` never interpolates.
    renderAt('/tags');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/terms/);
    expect(within(status).queryByRole('link')).toBeNull();
    expect(within(status).queryByRole('article')).toBeNull();
  });

  it('filters by letter from the URL', () => {
    renderAt('/tags?letter=D');
    expect(screen.getByRole('link', { name: /Drag/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Bear/ })).not.toBeInTheDocument();
  });

  it('renders alias-only hits under their own heading, never interleaved', () => {
    // A fuzzy trigram hit must not be presented as a direct match.
    aliasHits = [{ id: '1', name: 'Bear', slug: 'bear', match_via: 'alias', match_score: 0.9 }];
    renderAt('/tags?q=ursine');
    expect(screen.getByText(/also found under other names/i)).toBeInTheDocument();
  });

  it('does not repeat a term in the alias block when it already matched directly', () => {
    aliasHits = [{ id: '1', name: 'Bear', slug: 'bear', match_via: 'alias', match_score: 0.9 }];
    renderAt('/tags?q=bear');
    expect(screen.queryByText(/also found under other names/i)).not.toBeInTheDocument();
  });

  it('shows an empty state rather than a bare page when nothing matches', () => {
    renderAt('/tags?q=zzzznotathing');
    expect(screen.getByText(/no terms match/i)).toBeInTheDocument();
  });

  it('hides 18+ terms by default, and offers an explicit way in', () => {
    // Behaviour change: the index did NO safe-mode filtering at all, so 18+
    // terms sat in the grid for signed-out visitors while the detail page
    // dutifully gated them.
    corpus = [...PLAIN, ADULT];
    renderAt('/tags');
    expect(screen.queryByRole('link', { name: /Puppy play/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /include 18\+/i })).toBeInTheDocument();
  });

  it('shows 18+ terms when the reader opts in with ?adult=1', () => {
    corpus = [...PLAIN, ADULT];
    renderAt('/tags?adult=1');
    expect(screen.getByRole('link', { name: /Puppy play/ })).toBeInTheDocument();
  });
});
