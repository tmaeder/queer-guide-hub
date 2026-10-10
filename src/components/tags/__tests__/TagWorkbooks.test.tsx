/**
 * Behavioural test for the workbook band.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE SOURCE GUARD
 *
 * `src/lib/__tests__/tagWorkbooks.test.ts` reads source text. It can assert
 * that the overlay-sibling pattern is spelled correctly; it cannot assert that
 * the rendered DOM has no nested interactive element, which is what axe and
 * the a11y sweep actually fail on.
 *
 * And CI structurally cannot catch that before this ships: the band renders
 * only for a tag that carries a workbook, the workbooks arrive with the
 * migrations, and the migrations are applied on merge. So `axe full route
 * sweep` and the Lighthouse jobs meet this band for the FIRST TIME after the
 * merge that creates its data. This test is the only pre-merge check of the
 * rendered output, which is why it renders rather than greps.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, expectNoNestedInteractive } from '@/test/test-utils';
import type { TagWorkbook } from '@/hooks/useTagWorkbooks';

const mockWorkbooks = vi.fn();
const mockAuth = vi.fn();
const mockIntimate = vi.fn();

vi.mock('@/hooks/useTagWorkbooks', async () => {
  const actual =
    await vi.importActual<typeof import('@/hooks/useTagWorkbooks')>('@/hooks/useTagWorkbooks');
  return { ...actual, useTagWorkbooks: () => mockWorkbooks() };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockAuth() }));
vi.mock('@/hooks/useIntimateProfile', () => ({ useMyIntimateProfile: () => mockIntimate() }));

const { TagWorkbooks } = await import('../TagWorkbooks');

const wb = (over: Partial<TagWorkbook> = {}): TagWorkbook => ({
  id: 'w1',
  slug: 'contract-preparation',
  title: 'Preparing a power-exchange agreement',
  dek: 'Three passes over the same ground.',
  intro_md: 'Intro.',
  kind: 'negotiation',
  day_count: null,
  requires_partner: true,
  sort_order: 10,
  step_count: 21,
  steps: [],
  ...over,
});

beforeEach(() => {
  mockAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
  mockIntimate.mockReturnValue({ data: { opted_in_at: '2026-01-01T00:00:00Z' } });
  mockWorkbooks.mockReturnValue({ data: [wb()] });
});

describe('TagWorkbooks', () => {
  it('renders nothing when the term carries no workbook', () => {
    // The band is self-selecting, like TagDiagnosticCodes: /tags/mayonnaise
    // must not grow an empty "Exercises" heading.
    mockWorkbooks.mockReturnValue({ data: [] });
    const { container } = renderWithProviders(<TagWorkbooks tagId="t1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the query is still loading', () => {
    mockWorkbooks.mockReturnValue({ data: undefined });
    const { container } = renderWithProviders(<TagWorkbooks tagId="t1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('owns the #workbooks anchor the route strip and the rail point at', () => {
    const { container } = renderWithProviders(<TagWorkbooks tagId="t1" />);
    const section = container.querySelector('section#workbooks');
    expect(section).not.toBeNull();
    // Labelled by its own heading, not by a bare aria-label.
    expect(section).toHaveAttribute('aria-labelledby', 'workbooks-heading');
    expect(document.getElementById('workbooks-heading')).not.toBeNull();
  });

  it('has NO nested interactive element — the card link is an overlay sibling', () => {
    // The thing a source grep cannot prove. A card-wide anchor wrapping the
    // heading would be axe `nested-interactive` (serious, WCAG 4.1.2).
    const { container } = renderWithProviders(<TagWorkbooks tagId="t1" />);

    // POSITIVE CONTROL, and it is load-bearing: "no nested interactive" is
    // trivially true of a band that rendered no interactive element at all.
    // The first draft of this test asserted a link by ACCESSIBLE NAME, which
    // failed — and a reader could easily have concluded the link was missing
    // and that the assertion below was therefore vacuous. It was not; the name
    // simply arrives uninterpolated in this environment (see below). Asserting
    // the count first removes the ambiguity.
    expect(container.querySelectorAll('a[href]').length).toBeGreaterThan(0);

    expectNoNestedInteractive(container);
  });

  it('gives the overlay link an accessible name and the runner href', () => {
    // Queried by ROLE, not by name. `renderWithProviders` wraps QueryClient +
    // MemoryRouter but does not initialise i18next, so `t(key, 'Start
    // {{title}}', { title })` returns its default value UNINTERPOLATED here —
    // the accessible name in this environment is the literal "Start
    // {{title}}". That is a test-environment artifact, not a product defect,
    // so this asserts the two things that are real: the link has a name at all
    // (it has no text of its own, so without one it is unusable), and it
    // points at the runner.
    const { container } = renderWithProviders(<TagWorkbooks tagId="t1" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('aria-label')).toBeTruthy();
    expect(link).toHaveAttribute('href', '/tools/workbook/contract-preparation');
    // And it really is the overlay, not a wrapper: it carries no visible text.
    expect(link.textContent).toBe('');
    // Which also means the heading is NOT inside it.
    expect(link.querySelector('h3')).toBeNull();
    expect(container.querySelector('h3')).not.toBeNull();
  });

  it('shows a signed-out reader the exercise and the gate, but no link into it', () => {
    // Locked is not an error state: hiding the card would make the band's own
    // emptiness ambiguous. But it must not offer a route the reader cannot use.
    mockAuth.mockReturnValue({ user: null, loading: false });
    mockIntimate.mockReturnValue({ data: null });
    renderWithProviders(<TagWorkbooks tagId="t1" />);
    expect(screen.getByText(/Preparing a power-exchange agreement/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('locks a signed-in reader who has not opted in', () => {
    mockAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
    mockIntimate.mockReturnValue({ data: { opted_in_at: null } });
    renderWithProviders(<TagWorkbooks tagId="t1" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('never renders a prompt or an answer, only the workbook summary', () => {
    // The whole privacy split: prompts are public content but belong to the
    // runner, answers belong to nobody but their author. Neither is reachable
    // from this band, which is also why it has no crawler emission.
    mockWorkbooks.mockReturnValue({
      data: [
        wb({
          steps: [
            {
              id: 's1',
              key: 'what-you-fear',
              position: 10,
              day_offset: null,
              kind: 'prompt',
              heading: null,
              prompt_md: 'What are you afraid this will cost you?',
              help_md: null,
              kink_category_slug: null,
              answer_max_len: 4000,
            },
          ],
        }),
      ],
    });
    const { container } = renderWithProviders(<TagWorkbooks tagId="t1" />);
    expect(container.textContent).not.toContain('What are you afraid this will cost you?');
  });

  it('describes a program by DAYS and a non-program by STEPS', () => {
    // Asserts which SENTENCE is chosen, not the interpolated number: i18next is
    // not initialised here, so `t(key, '{{count}} days', { count: 4 })` returns
    // the literal '{{count}} days'. The branch is the product decision — for a
    // four-day program the pacing is what a reader needs up front, not that it
    // happens to contain seven prompts.
    mockWorkbooks.mockReturnValue({
      data: [wb({ kind: 'program', day_count: 4, step_count: 7, requires_partner: true })],
    });
    const { container } = renderWithProviders(<TagWorkbooks tagId="t1" />);
    expect(container.textContent).toContain('days');
    expect(container.textContent).not.toContain('steps');
  });

  it('and falls back to steps when a program has no day_count', () => {
    // The CHECK forbids publishing such a row, so this is the belt to that
    // braces: if one ever existed the band must still say something true
    // rather than render "{{count}} days" over a null.
    mockWorkbooks.mockReturnValue({
      data: [wb({ kind: 'program', day_count: null, step_count: 7 })],
    });
    const { container } = renderWithProviders(<TagWorkbooks tagId="t1" />);
    expect(container.textContent).toContain('steps');
    expect(container.textContent).not.toContain('days');
  });

  it('distinguishes a solo workbook from a partner one', () => {
    mockWorkbooks.mockReturnValue({ data: [wb({ requires_partner: false })] });
    const { container } = renderWithProviders(<TagWorkbooks tagId="t1" />);
    expect(container.textContent).toMatch(/On your own/i);
  });

  it('states the privacy rule on the band itself', () => {
    // A reader decides whether to start from this band, so the two-opt-in rule
    // has to be legible before they click rather than after.
    const { container } = renderWithProviders(<TagWorkbooks tagId="t1" />);
    expect(container.textContent).toMatch(/private/i);
  });
});
