import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlossaryLinkedProse, GlossaryLinkedText } from '../GlossaryLinkedText';
import { GlossaryVocabularyProvider } from '@/hooks/useGlossaryLinkVocabulary';
import type { GlossaryLinkTerm } from '@/lib/glossaryLinks';

/**
 * The behaviour under test is mostly the FAIL-OPEN contract, because that is
 * where this component first went wrong: calling `useQuery` inside it made every
 * prose site require a QueryClientProvider, React Query throws when there is
 * none, and four unrelated test files broke on the first full run. A decorative
 * text renderer must never be able to take down a page.
 */

describe('GlossaryLinkedText without a vocabulary provider', () => {
  it('renders the text unchanged instead of throwing', () => {
    // Deliberately NO GlossaryVocabularyProvider and NO QueryClientProvider —
    // this is the exact tree that used to throw "No QueryClient set".
    render(
      <MemoryRouter>
        <p>
          <GlossaryLinkedText text="Ask about PrEP before you travel." />
        </p>
      </MemoryRouter>,
    );
    expect(screen.getByText('Ask about PrEP before you travel.')).toBeInTheDocument();
    expect(document.querySelector('a')).toBeNull();
  });

  it('renders nothing for empty or missing text', () => {
    const { container } = render(
      <MemoryRouter>
        <GlossaryLinkedText text={null} />
        <GlossaryLinkedText text="" />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });

  it('GlossaryLinkedProse also survives with no provider', () => {
    render(
      <MemoryRouter>
        <GlossaryLinkedProse text={'First paragraph.\n\nSecond paragraph.'} />
      </MemoryRouter>,
    );
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
  });
});

/**
 * Mount `children` under a provider serving a fixed vocabulary, without
 * touching the network.
 */
function renderWithVocabulary(children: React.ReactNode, terms: GlossaryLinkTerm[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['glossary-link-vocabulary'], terms);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GlossaryVocabularyProvider>{children}</GlossaryVocabularyProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('GlossaryLinkedText with a vocabulary', () => {
  // The positive control. Every other test here asserts an ABSENCE, and
  // "no bad link" is vacuously true when nothing links at all.
  it('renders a real anchor to the glossary entry', () => {
    renderWithVocabulary(
      <p>
        <GlossaryLinkedText text="Ask about PrEP before you travel." />
      </p>,
      [{ surfaceForm: 'PrEP', slug: 'prep' }],
    );

    const link = screen.getByRole('link', { name: 'PrEP' });
    expect(link).toHaveAttribute('href', '/tags/prep');
    expect(link).toHaveAttribute('data-glossary-link', 'prep');
    // The surrounding prose survives verbatim.
    expect(link.parentElement?.textContent).toBe('Ask about PrEP before you travel.');
  });

  it('links a term once and leaves later mentions as text', () => {
    renderWithVocabulary(
      <p>
        <GlossaryLinkedText text="PrEP is daily. PrEP is not PEP. PrEP again." />
      </p>,
      [{ surfaceForm: 'PrEP', slug: 'prep' }],
    );
    expect(screen.getAllByRole('link', { name: 'PrEP' })).toHaveLength(1);
  });

  it('does not link the entry it is rendered on', () => {
    renderWithVocabulary(
      <p>
        <GlossaryLinkedText text="PrEP and poppers." currentSlug="prep" />
      </p>,
      [
        { surfaceForm: 'PrEP', slug: 'prep' },
        { surfaceForm: 'poppers', slug: 'poppers' },
      ],
    );
    expect(screen.queryByRole('link', { name: 'PrEP' })).toBeNull();
    expect(screen.getByRole('link', { name: 'poppers' })).toHaveAttribute('href', '/tags/poppers');
  });

  it('spends the link budget across the document, not per paragraph', () => {
    renderWithVocabulary(
      <GlossaryLinkedProse text={'PrEP in one.\n\nPrEP in two.\n\nPrEP in three.'} />,
      [{ surfaceForm: 'PrEP', slug: 'prep' }],
    );
    // First mention only — a per-paragraph pass would produce three.
    expect(screen.getAllByRole('link', { name: 'PrEP' })).toHaveLength(1);
    expect(screen.getByText(/PrEP in three/)).toBeInTheDocument();
  });
});

describe('the fetch flag', () => {
  // The flag legitimately flips — `false` for the round where
  // `glossary_link_terms_public` did not yet exist on prod (a PostgREST 404 on
  // every page, which failed e2e/trip-creation.spec.ts's `no console errors`),
  // `true` once it did. So nothing here pins its VALUE; a test that has to be
  // edited on every flip is one nobody trusts.
  //
  // NO BEHAVIOURAL "was it fetched" TEST HERE, DELIBERATELY — and the first
  // draft of this file had one that was VACUOUS. It installed a counting
  // `queryFn` via `client.setQueryDefaults` and asserted zero calls, but
  // `GlossaryVocabularyProvider` passes its own `queryFn` to `useQuery`, which
  // overrides the default — so the counter could never increment and the
  // assertion held no matter what the flag said. Writing it the other way round
  // (flag on, expect ≥1) is what exposed that. Proving the fetch really fires
  // needs the supabase client mocked, which tests the mock more than the wiring.
  it('is the thing `enabled` is wired to, so the flag is load-bearing', () => {
    // This is the assertion that actually bites: with the flag `true`, deleting
    // `enabled:` changes no behaviour, so only reading the source can catch the
    // flag being quietly disconnected and left as decoration.
    const src = readFileSync(
      resolve(process.cwd(), 'src/hooks/useGlossaryLinkVocabulary.ts'),
      'utf8',
    );
    expect(src).toContain('enabled: GLOSSARY_LINK_FETCH_ENABLED');
    expect(src).toMatch(/export const GLOSSARY_LINK_FETCH_ENABLED = (true|false);/);
  });

  it('never lets the fetch gate body prose being visible', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <GlossaryVocabularyProvider>
            <p>
              <GlossaryLinkedText text="Ask about PrEP." />
            </p>
          </GlossaryVocabularyProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Ask about PrEP.')).toBeInTheDocument();
  });
});

describe('GlossaryVocabularyProvider', () => {
  // An earlier version of this test installed a REJECTING `queryFn` through
  // `client.setQueryDefaults` and called itself "degrades when the fetch fails".
  // It was vacuous for the same reason as the deleted flag test: the provider
  // passes its own `queryFn`, so the rejecting one never ran and the test only
  // ever exercised the not-yet-resolved path. Asserting that path HONESTLY is
  // what it is doing now.
  it('publishes an empty vocabulary while no data has resolved', () => {
    // `data` is undefined until (and unless) a fetch resolves, and
    // `data ?? EMPTY_VOCABULARY` is what stops that reaching the matcher as
    // undefined. Nothing is seeded here, so this is that path.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <p>
            <GlossaryVocabularyProvider>
              <GlossaryLinkedText text="Ask about PrEP." />
            </GlossaryVocabularyProvider>
          </p>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Prose intact, and NOT linked — an unresolved vocabulary must render plain
    // rather than throw or blank the paragraph.
    expect(screen.getByText('Ask about PrEP.')).toBeInTheDocument();
    expect(document.querySelector('a[data-glossary-link]')).toBeNull();
  });
});
