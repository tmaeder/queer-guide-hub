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

describe('GlossaryVocabularyProvider', () => {
  it('degrades to plain prose when the fetch fails', async () => {
    // `retry: false` plus a query function that rejects: the provider must
    // publish an empty vocabulary rather than propagate the error. A failed
    // vocabulary lookup may never blank a page of body text.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryDefaults(['glossary-link-vocabulary'], {
      queryFn: () => Promise.reject(new Error('offline')),
      retry: false,
    });

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
