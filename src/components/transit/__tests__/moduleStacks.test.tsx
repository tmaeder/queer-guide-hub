import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HoursTable } from '@/components/transit/HoursTable';
import { AccessGrid } from '@/components/transit/AccessGrid';
import { OccurrenceList } from '@/components/transit/OccurrenceList';
import { ProvenanceLine } from '@/components/transit/ProvenanceLine';
import { Roster } from '@/components/transit/Roster';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { MemoryRouter } from 'react-router';
import { StopList } from '@/components/transit/StopList';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => ({
  day: d,
  open: '10:00 to 02:00',
}));

describe('HoursTable', () => {
  it('floods only the caller-supplied today row and marks it for AT', () => {
    const { container } = render(<HoursTable rows={DAYS} todayIndex={4} />);
    const rows = container.firstElementChild!.children;
    expect(rows).toHaveLength(7);
    expect(rows[4].className).toContain('bg-foreground');
    expect(rows[4].getAttribute('aria-current')).toBe('date');
    expect(rows[0].className).not.toContain('bg-foreground');
    expect(rows[0].getAttribute('aria-current')).toBeNull();
  });

  it('highlights nothing when the caller cannot determine local today', () => {
    // todayIndex is the venue's local day, not the reader's. Omitting it must
    // highlight NO row rather than defaulting to the reader's weekday, which
    // would assert a fact about a place in another timezone.
    const { container } = render(<HoursTable rows={DAYS} />);
    for (const r of container.firstElementChild!.children) {
      expect(r.className).not.toContain('bg-foreground');
    }
  });

  it('renders nothing with no rows', () => {
    const { container } = render(<HoursTable rows={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('AccessGrid', () => {
  it('always pairs the status dot with the written value', () => {
    // Colour is the index to the answer, never the answer: a wrong access
    // claim is real-world harm, so the text must carry it.
    render(
      <AccessGrid
        items={[
          { label: 'Step-free entry', value: 'Yes, left door', state: 'yes' },
          { label: 'Lift to balcony', value: 'No', state: 'no' },
          { label: 'Hearing loop', value: 'At the bar only', state: 'partial' },
        ]}
      />,
    );
    expect(screen.getByText('Yes, left door')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByText('At the bar only')).toBeInTheDocument();
    // The dot is decorative — AT reads the label + value, not the colour.
    const dots = document.querySelectorAll('[aria-hidden].rounded-full');
    expect(dots.length).toBe(3);
  });

  it('distinguishes the three states', () => {
    const { container } = render(
      <AccessGrid
        items={[
          { label: 'a', state: 'yes' },
          { label: 'b', state: 'partial' },
          { label: 'c', state: 'no' },
        ]}
      />,
    );
    const cls = [...container.querySelectorAll('[aria-hidden]')].map((e) => e.className);
    expect(cls[0]).toContain('bg-track-green');
    expect(cls[1]).toContain('bg-track-yellow');
    expect(cls[2]).toContain('bg-track-pink');
  });
});

describe('OccurrenceList', () => {
  it('floods the next occurrence only', () => {
    const { container } = render(
      <OccurrenceList
        occurrences={[
          { id: '1', date: 'FRI 14 AUG', status: '61 tickets' },
          { id: '2', date: 'FRI 11 SEP', status: 'Not on sale' },
        ]}
      />,
    );
    const rows = container.firstElementChild!.children;
    expect(rows[0].className).toContain('bg-foreground');
    expect(rows[1].className).not.toContain('bg-foreground');
  });
});

describe('ProvenanceLine', () => {
  it('renders an absolute date, never a relative one', () => {
    // "2 months ago" re-reads as fresh on every visit — the exact illusion
    // provenance exists to break.
    render(<ProvenanceLine addedBy="Ines K." checkedAt="2026-07-02T00:00:00Z" />);
    expect(
      screen.getByText(/Last checked 2 July 2026|Last checked July 2, 2026/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ago/)).toBeNull();
  });

  it('says "not checked" out loud rather than implying freshness by omission', () => {
    render(<ProvenanceLine addedBy="Rae M." addedAt="2022-01-01T00:00:00Z" />);
    expect(screen.getByText(/Not independently checked yet/)).toBeInTheDocument();
  });

  it('renders nothing with no provenance at all', () => {
    const { container } = render(<ProvenanceLine />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Roster', () => {
  it('shows roles and exposes no count or ranking affordance', () => {
    // "Never a follower count." This is not a social profile.
    render(
      <Roster
        people={[
          { id: '1', name: 'Ines K.', role: 'moderator' },
          { id: '2', name: 'Rae M.', role: 'house mother' },
        ]}
      />,
    );
    expect(screen.getByText('moderator')).toBeInTheDocument();
    expect(screen.getByText('house mother')).toBeInTheDocument();
    expect(screen.queryByText(/\bfollowers?\b/i)).toBeNull();
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });
});

describe('NestedEntityCard', () => {
  it("leads with the OTHER type's bullet so the network reads from any page", () => {
    render(
      <MemoryRouter>
        <NestedEntityCard type="venue" eyebrow="Venue" name="SO36" href="/venues/so36" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Venue')).toBeInTheDocument();
    expect(screen.getByText('V')).toBeInTheDocument();
  });
});

describe('StopList', () => {
  it('renders the walk BETWEEN stops, not as metadata on a card', () => {
    // "The value is the walk between stations" — for both villages and guides.
    render(
      <MemoryRouter>
        <StopList
          stops={[
            { id: '1', name: 'SO36', type: 'venue' },
            { id: '2', name: 'Südblock', type: 'venue', walkFromPrevious: '6 min walk' },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('6 min walk')).toBeInTheDocument();
    expect(screen.getByText('SO36')).toBeInTheDocument();
  });

  it('numbers stops as sequence and exposes no rank or score', () => {
    // A guide is "not a ranked listicle" — ranking breaks zero-hierarchy.
    const { container } = render(
      <MemoryRouter>
        <StopList
          stops={[
            { id: '1', name: 'A' },
            { id: '2', name: 'B' },
          ]}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector('ol')).toBeTruthy();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders nothing with no stops', () => {
    const { container } = render(<StopList stops={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
