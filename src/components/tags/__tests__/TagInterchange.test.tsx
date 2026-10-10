/**
 * TagInterchange — guards the defect this band was rebuilt to remove.
 *
 * The one that matters is NO FLAT CHAIN: two parents must render as two
 * separate lines, not as consecutive stops above the tag. On prod that defect
 * was live on 184 of the 1,000 tags carrying a parent, and `/tags/cis-man`
 * published "Cisgender -> Male -> Cis Man", which asserts Male is narrower
 * than Cisgender.
 *
 * Every assertion is scoped to the half of the DOM it is about. Asserting
 * over the whole section is how a check goes vacuous here: the interchange
 * station is REPEATED per line by design, so a naive "the tag name appears
 * once" test fails on correct markup, and a naive "both parents appear" test
 * passes just as well against the single flat line this replaced.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router';
import { TagInterchange } from '@/components/tags/TagInterchange';
import type { TagOntologyNetwork } from '@/hooks/useTagRelationships';

let network: TagOntologyNetwork = { lines: [], narrower: [], related: [] };
let safeEnabled = false;

vi.mock('@/hooks/useTagRelationships', () => ({
  useTagOntologyNetwork: () => ({ data: network }),
}));
vi.mock('@/providers/SafeModeProvider', () => ({
  useSafeMode: () => ({ enabled: safeEnabled }),
}));
vi.mock('react-i18next', () => ({
  // Return the English default so assertions read as the shipped copy rather
  // than as translation keys, which would pass against any wording.
  useTranslation: () => ({
    t: (_k: string, fallback: string, vars?: Record<string, unknown>) =>
      typeof fallback === 'string' && vars
        ? fallback.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(vars[name]))
        : fallback,
  }),
}));

const node = (name: string, extra: Partial<Record<string, unknown>> = {}) => ({
  id: name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  category: null,
  is_adult: false,
  ...extra,
});

const line = (name: string, over: Record<string, unknown> = {}) => ({
  ...node(name),
  upstream: [],
  stops: [],
  stop_total: 0,
  ...over,
});

function draw() {
  return render(
    <MemoryRouter>
      <TagInterchange tagId="t1" tagName="Cis Man" />
    </MemoryRouter>,
  );
}

/** The columns are the direct children of the lines grid. Scoping to them is
 *  what makes "parent A and parent B are on DIFFERENT lines" checkable at all. */
function columns(container: HTMLElement): HTMLElement[] {
  const grid = container.querySelector('section > div.grid');
  return grid ? (Array.from(grid.children) as HTMLElement[]) : [];
}

beforeEach(() => {
  network = { lines: [], narrower: [], related: [] };
  safeEnabled = false;
});

describe('TagInterchange', () => {
  it('draws two parents as two separate lines, never as one chain', () => {
    network = {
      lines: [
        line('Cisgender', {
          upstream: [node('Gender')],
          stops: [node('Cis Woman')],
          stop_total: 1,
        }),
        line('Male', { upstream: [node('Gender Binary')] }),
      ],
      narrower: [],
      related: [],
    };
    const { container } = draw();
    const cols = columns(container);

    expect(cols).toHaveLength(2);
    // The load-bearing claim: each parent is alone on its own line. A flat
    // chain puts both in one list, which this fails on.
    expect(within(cols[0]).getByText('Cisgender')).toBeTruthy();
    expect(within(cols[0]).queryByText('Male')).toBeNull();
    expect(within(cols[1]).getByText('Male')).toBeTruthy();
    expect(within(cols[1]).queryByText('Cisgender')).toBeNull();

    // The second hop is the reason a network view is justified at all.
    expect(within(cols[0]).getByText('Gender')).toBeTruthy();
    expect(within(cols[0]).getByText('Cis Woman')).toBeTruthy();
    expect(within(cols[1]).getByText('Gender Binary')).toBeTruthy();
  });

  it('prints the interchange station on every line it passes through', () => {
    network = {
      lines: [line('Cisgender'), line('Male')],
      narrower: [],
      related: [],
    };
    const { container } = draw();
    const cols = columns(container);
    // Repetition is the design (a station is printed on each of its lines),
    // so this asserts presence PER COLUMN rather than a global count.
    for (const col of cols) expect(within(col).getByText('Cis Man')).toBeTruthy();
  });

  it('gives each line its own track so converging lines are distinguishable', () => {
    network = {
      lines: [line('A'), line('B'), line('C')],
      narrower: [],
      related: [],
    };
    const { container } = draw();
    const tracks = columns(container).map((col) => {
      const rail = col.querySelector('[aria-hidden] > span');
      return (rail?.className.match(/bg-track-\w+/) ?? [''])[0];
    });
    expect(new Set(tracks).size).toBe(3);
  });

  it('counts the overflow from stop_total, not from the capped list', () => {
    // The 8-stop cap lives in the RPC. Deriving the overflow from stops.length
    // alone reports nothing hidden on a 31-child parent.
    network = {
      lines: [
        line('Fetishist', {
          stops: Array.from({ length: 8 }, (_, i) => node(`Stop ${i}`)),
          stop_total: 31,
        }),
      ],
      narrower: [],
      related: [],
    };
    draw();
    expect(screen.getByText('+23 more on this line')).toBeTruthy();
  });

  it('does not offer an overflow link when the line is merely short', () => {
    network = {
      lines: [line('Mask', { stops: [node('Padded')], stop_total: 1 })],
      narrower: [],
      related: [],
    };
    draw();
    expect(screen.queryByText(/more on this line/)).toBeNull();
  });

  it('drops a whole line in Safe mode when its PARENT is adult', () => {
    // Filtering only the stops would leave a line labelled with the very term
    // Safe mode exists to withhold.
    safeEnabled = true;
    network = {
      lines: [
        line('Mask', {
          ...node('Mask', { is_adult: true }),
          upstream: [],
          stops: [],
          stop_total: 0,
        }),
        line('Gender'),
      ],
      narrower: [],
      related: [],
    };
    const { container } = draw();
    const cols = columns(container);
    expect(cols).toHaveLength(1);
    expect(within(cols[0]).getByText('Gender')).toBeTruthy();
    expect(screen.queryByText('Mask')).toBeNull();
  });

  it('heads its own line when the tag has children but no parent', () => {
    // Measured shape of /tags/consent: 0 lines, 3 narrower.
    network = { lines: [], narrower: [node('Safe Word'), node('Hard Limits')], related: [] };
    draw();
    expect(screen.getByText('Stops on this line')).toBeTruthy();
    expect(screen.getByText('Cis Man')).toBeTruthy();
    expect(screen.getByText('Safe Word')).toBeTruthy();
  });

  it('labels its children as the line continuing when it also has parents', () => {
    network = { lines: [line('Cisgender')], narrower: [node('Cis Guy')], related: [] };
    draw();
    expect(screen.getByText('Continues to')).toBeTruthy();
    expect(screen.queryByText('Stops on this line')).toBeNull();
  });

  it('renders nothing at all when the curated ontology is empty', () => {
    // Measured: /tags/drag, /tags/lesbian and /tags/top are all empty today,
    // and an empty band is worse than no band.
    const { container } = draw();
    expect(container.querySelector('#taxonomy')).toBeNull();
  });

  it('keeps the #taxonomy anchor, which the route strip and an e2e pin', () => {
    network = { lines: [line('Cisgender')], narrower: [], related: [] };
    const { container } = draw();
    expect(container.querySelector('section#taxonomy')).toBeTruthy();
  });
});
