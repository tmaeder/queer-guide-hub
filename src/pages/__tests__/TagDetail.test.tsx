import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { SafeModeProvider } from '@/providers/SafeModeProvider';
import type { ReactNode } from 'react';

const useMeta = vi.fn();
vi.mock('@/hooks/useMeta', () => ({ useMeta: (o: unknown) => useMeta(o) }));

// The not-found branch renders GatedDetailFallback, which reads useAuth (it
// only probes for a gated row when nobody is signed in) — and useAuth THROWS
// outside an AuthProvider. Signed-out is the interesting state here anyway:
// it is the only one that can be shown a term that does not appear to exist.
// Same mock as EventDetail.test.tsx / QueerVillageDetail.test.tsx.
// Mutable so one case can assert the SIGNED-IN path, where the gate query is
// disabled and must not leave the title stuck on "Loading".
let authUser: { id: string } | null = null;
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: authUser, session: null, loading: false }),
}));

// `gated_entity_exists` for the tag branch. Default: nothing is gated, so the
// existing not-found cases keep asserting the not-found UI.
let gatedSlugs: string[] = [];
const gatedRpc = vi.fn();
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: (fn: string, args: Record<string, unknown>) => {
    gatedRpc(fn, args);
    return Promise.resolve({
      data: fn === 'gated_entity_exists' && gatedSlugs.includes(String(args.p_slug)),
      error: null,
    });
  },
}));

let tagRow: Record<string, unknown> | null = null;
vi.mock('@/hooks/usePageFetchers', () => ({
  fetchTagWithCategories: () => Promise.resolve(tagRow),
}));

let usage: Record<string, number> | null = null;
vi.mock('@/hooks/useTagUsageBreakdown', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useTagUsageBreakdown')>(
    '@/hooks/useTagUsageBreakdown',
  );
  return { ...actual, useTagUsageBreakdown: () => ({ data: usage }) };
});

let tagReferences: { source_type: string; source_url: string }[] = [];
let substanceInteractions: Record<string, unknown>[] = [];
vi.mock('@/hooks/useTagRelationships', () => ({
  useSimilarTags: () => ({ data: [] }),
  useTagOntology: () => ({ data: { broader: [], narrower: [], related: [] } }),
  useTagReferenceLinks: () => ({ data: tagReferences }),
  // Added when the interaction band landed. A partial mock of this module is
  // why the whole suite broke last time an export was added here — every hook
  // TagDetail imports from it has to be present.
  useSubstanceInteractions: () => ({ data: substanceInteractions }),
}));
vi.mock('@/hooks/useTagContent', () => ({
  useTagContent: () => ({ data: null, isLoading: true }),
}));
vi.mock('@/hooks/useTagAliases', () => ({ useTagAliases: () => ({ aliases: [] }) }));
vi.mock('@/components/tags/FollowTagButton', () => ({
  FollowTagButton: () => <button>Follow</button>,
}));

import TagDetail from '../TagDetail';

const BASE = {
  id: 't1',
  name: 'Bear',
  slug: 'bear',
  description: 'A term of endearment.',
  usage_count: 5,
  created_at: '2026-01-01',
  updated_at: '2026-02-01',
  seo_indexable: true,
  entity_kind: 'concept',
  categories: [
    {
      id: 'c1',
      name: 'Slang & Terminology',
      slug: 'slang-terminology',
      is_primary: true,
      level: 1,
      parent_name: 'Community & Culture',
      parent_slug: 'community-culture',
    },
  ],
};

const wrap = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tags/bear']}>
        <SafeModeProvider>{children}</SafeModeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const renderPage = () =>
  render(
    <Routes>
      <Route path="/tags/:tagName" element={<TagDetail />} />
    </Routes>,
    { wrapper: wrap },
  );

const lastMeta = () => useMeta.mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  useMeta.mockClear();
  gatedRpc.mockClear();
  gatedSlugs = [];
  authUser = null;
  tagReferences = [];
  substanceInteractions = [];
  tagRow = { ...BASE };
  usage = {
    venue_count: 2,
    event_count: 0,
    news_count: 3,
    post_count: 0,
    group_count: 0,
    marketplace_count: 0,
    content_count: 0,
    usage_count: 5,
  };
  localStorage.clear();
});

describe('TagDetail — SEO', () => {
  it('canonical and JSON-LD url agree, and both point at /tags', async () => {
    // The defect this exists for: both used to say `/resources/<slug>`, which
    // public/_redirects 301s to `/tags/<slug>` — so every glossary page
    // declared a canonical pointing at a redirect and cancelled its own
    // indexing. Asserted against EACH OTHER, not against a literal, so the two
    // can never drift apart again.
    renderPage();
    await waitFor(() => expect(lastMeta()?.canonicalPath).toBe('/tags/bear'));
    const jsonLd = lastMeta().jsonLd as Record<string, unknown>;
    expect(jsonLd.url).toBe(`https://queer.guide${lastMeta().canonicalPath}`);
    expect(JSON.stringify(lastMeta())).not.toContain('/resources/');
  });

  it('points the DefinedTermSet at the live glossary index', async () => {
    renderPage();
    await waitFor(() => expect(lastMeta()?.jsonLd).toBeTruthy());
    const set = (lastMeta().jsonLd as Record<string, Record<string, string>>).inDefinedTermSet;
    expect(set.url).toBe('https://queer.guide/tags');
  });

  it('marks a non-indexable tag noindex', async () => {
    tagRow = { ...BASE, seo_indexable: false };
    renderPage();
    await waitFor(() => expect(lastMeta()?.noIndex).toBe(true));
  });

  it('marks an adult tag noindex even when it is indexable', async () => {
    tagRow = {
      ...BASE,
      categories: [
        {
          id: 'c9',
          name: 'Practices & Play',
          is_primary: true,
          level: 1,
          parent_name: 'Sexuality & Kink',
        },
      ],
    };
    renderPage();
    await waitFor(() => expect(lastMeta()?.noIndex).toBe(true));
  });

  it('leaves an ordinary tag indexable', async () => {
    renderPage();
    await waitFor(() => expect(lastMeta()?.canonicalPath).toBe('/tags/bear'));
    expect(lastMeta().noIndex).toBe(false);
  });
});

describe('TagDetail — page', () => {
  it('renders the term in the masthead, with its entity_kind as the status chip', async () => {
    tagRow = { ...BASE, entity_kind: 'practice' };
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Bear' })).toBeInTheDocument();
    expect(screen.getByText('Practice')).toBeInTheDocument();
  });

  // `concept` is the default kind for an unclassified row, so a chip reading
  // "CONCEPT" carried no information on most of the glossary.
  it('omits the status chip for the default `concept` kind', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Bear' });
    expect(screen.queryByText('Concept')).not.toBeInTheDocument();
  });

  it('omits the status chip for an unknown entity_kind rather than printing the raw enum', async () => {
    tagRow = { ...BASE, entity_kind: 'something_new' };
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Bear' });
    expect(screen.queryByText('something_new')).not.toBeInTheDocument();
  });

  it('builds stations only for bands that have content', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Bear' });
    const nav = screen.getByRole('navigation', { name: /sections/i });
    expect(nav).toHaveTextContent(/Venues/);
    expect(nav).toHaveTextContent(/News/);
    // Zero-count bands must not become dead stations.
    expect(nav).not.toHaveTextContent(/Events/);
    expect(nav).not.toHaveTextContent(/Shop/);
  });

  it('renders the content note synchronously, while linked content is still loading', async () => {
    // The crisis-surface rule that carries over: a failed or slow fetch must not
    // be able to blank a safety block. useTagContent is mocked as permanently
    // loading here on purpose.
    tagRow = { ...BASE, is_sensitive: true, sensitive_topics: ['self-harm'] };
    renderPage();
    expect(await screen.findByRole('note')).toBeInTheDocument();
    expect(screen.getByText('self harm')).toBeInTheDocument();
  });

  it('spends no --destructive on the content note', async () => {
    // Red is reserved for danger to the reader. A note about a topic they chose
    // to open does not qualify, and spending red here devalues it elsewhere.
    tagRow = { ...BASE, is_sensitive: true };
    renderPage();
    const note = await screen.findByRole('note');
    expect(note.className).not.toMatch(/destructive/);
  });

  it('shows no content note on an ordinary term', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Bear' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('404s on an unknown slug instead of falling back to the index', async () => {
    tagRow = null;
    renderPage();
    expect(await screen.findByTestId('tag-not-found')).toBeInTheDocument();
  });

  // `unified_tags_public_gated_read` withholds a sensitive term from anon until
  // an editor reviews it, so `fetchTagWithCategories` returns null for a term
  // that plainly exists — 101 active tags on prod 2026-09-03, every one of them
  // telling a signed-out reader "Nothing in the glossary is filed under
  // /footjob" while a signed-in reader read the entry in full. The row being
  // withheld is right; calling it absent is not.
  it('offers a sign-in gate, not "no such term", for a gated term', async () => {
    tagRow = null;
    gatedSlugs = ['bear'];
    renderPage();
    expect(
      await screen.findByRole('heading', { name: /sign in to view this term/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('tag-not-found')).not.toBeInTheDocument();
    expect(gatedRpc).toHaveBeenCalledWith('gated_entity_exists', {
      p_entity_type: 'tag',
      p_slug: 'bear',
    });
  });

  it('does not borrow the high-risk-destination copy for a glossary term', async () => {
    // The venue/event gate explains a criminalising jurisdiction. Reusing it
    // here would tell a reader that a kink term is a dangerous place to travel:
    // false, and alarming in the one register this site must not get wrong.
    tagRow = null;
    gatedSlugs = ['bear'];
    renderPage();
    await screen.findByRole('heading', { name: /sign in to view this term/i });
    expect(screen.queryByText(/heightened legal risk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/this place/i)).not.toBeInTheDocument();
  });

  it('keeps the gate out of the index — a sign-in wall is not indexable', async () => {
    tagRow = null;
    gatedSlugs = ['bear'];
    renderPage();
    await screen.findByRole('heading', { name: /sign in to view this term/i });
    await waitFor(() => expect(lastMeta()?.noIndex).toBe(true));
  });

  // The <title> is the reader's tab, bookmark and history entry. Titling a
  // gated term "No such term" is the same denial the page body stopped making:
  // observed on prod 2026-09-04 with the heading reading "Sign in to view this
  // term" and the tab reading "No such term | Queer Guide".
  it('titles a gated term as the gate, not as a 404', async () => {
    tagRow = null;
    gatedSlugs = ['bear'];
    renderPage();
    await screen.findByRole('heading', { name: /sign in to view this term/i });
    await waitFor(() => expect(lastMeta()?.title).toMatch(/sign in to view this term/i));
  });

  it('still titles a genuinely missing term "No such term"', async () => {
    // The other half of the pair. Without it the case above passes on a build
    // that titles EVERY dead glossary URL as a sign-in gate, which would be a
    // worse lie than the one being fixed.
    tagRow = null;
    gatedSlugs = [];
    renderPage();
    await screen.findByTestId('tag-not-found');
    await waitFor(() => expect(lastMeta()?.title).toBe('No such term'));
  });

  it('does not strand a SIGNED-IN reader on "Loading" for a missing term', async () => {
    // React Query v5 keeps a DISABLED query at status 'pending' forever, and
    // the gate query is disabled for every signed-in reader. Keying the title
    // on `isPending` alone therefore pins their 404 to "Loading" permanently —
    // caught here, not in review. `fetchStatus !== 'idle'` is the real
    // in-flight test.
    authUser = { id: 'u1' };
    tagRow = null;
    gatedSlugs = ['bear']; // would be gated IF asked — but signed-in never asks
    renderPage();
    await screen.findByTestId('tag-not-found');
    await waitFor(() => expect(lastMeta()?.title).toBe('No such term'));
    expect(lastMeta()?.title).not.toMatch(/loading/i);
    expect(gatedRpc).not.toHaveBeenCalled();
  });

  it('noindexes an unknown slug and does not title it "Loading"', async () => {
    // The meta memo used to branch on `!tag` alone, which conflated "still
    // loading" with "no such tag": a dead URL shipped `<title>Loading</title>`
    // and — because `noIndex` lived only on the resolved-tag branch — NO robots
    // tag at all, while `useMeta` still emitted a self-referential canonical.
    // That is an indexable soft 404, the shape that got merged slugs indexed
    // before they were 301'd. The canonical cannot be suppressed through
    // `useMeta`, so `noIndex` is the assertion that matters here.
    tagRow = null;
    renderPage();
    await screen.findByTestId('tag-not-found');
    await waitFor(() => expect(lastMeta()?.noIndex).toBe(true));
    expect(lastMeta()?.title).toBe('No such term');
    expect(lastMeta()?.title).not.toMatch(/loading/i);
  });

  it('cites an external source by host, and links out to it', async () => {
    // The label is derived from the URL rather than printed from
    // `claim_summary`, so an unvetted row cannot put prose on the page.
    tagReferences = [
      { source_type: 'editorial', source_url: 'https://en.saferparty.ch/substanzen/mdma' },
    ];
    renderPage();
    expect(await screen.findByText('en.saferparty.ch')).toBeInTheDocument();
    const link = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === 'https://en.saferparty.ch/substanzen/mdma');
    expect(link).toBeDefined();
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders no Elsewhere card when a tag has neither wiki links nor sources', async () => {
    // The card must not appear empty: BASE carries no wikipedia_url/wikidata_id
    // and tagReferences is reset to [] in beforeEach.
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Bear' });
    expect(screen.queryByText(/Elsewhere/i)).not.toBeInTheDocument();
  });
});
