import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HoursTable } from '@/components/transit/HoursTable';
import { AccessGrid } from '@/components/transit/AccessGrid';
import { TicketTiers } from '@/components/transit/TicketTiers';
import { OccurrenceList } from '@/components/transit/OccurrenceList';

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

describe('TicketTiers', () => {
  it('renders every tier identically — no recommended highlight', () => {
    // "Nobody is turned away for money": emphasising a tier puts a thumb on
    // a scale the reader is meant to set themselves.
    const { container } = render(
      <TicketTiers
        tiers={[
          { price: '€8', name: 'Low end', note: 'Take this if money is tight.' },
          { price: '€12', name: 'Standard' },
          { price: '€15', name: 'Solidarity' },
        ]}
      />,
    );
    const items = [...container.querySelectorAll('li')].map((li) => li.className);
    expect(new Set(items).size).toBe(1);
    expect(screen.getByText('€8')).toBeInTheDocument();
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
