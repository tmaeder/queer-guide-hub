import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { EventProgramme } from '@/components/events/EventProgramme';
import { byType, isParade, shouldOfferTypeToggle } from '@/utils/eventProgrammeView';
import type { ProgrammeChild } from '@/utils/prideProgramme';

/**
 * The defect these exist for: the three Pride lanes keyed on `pride_subtypes`, which
 * is NULL on every child in the corpus, so every child fell to the `week` lane — and
 * this component renders for ANY umbrella. A Madrid New Year's Eve party was
 * published under a heading reading "Pride Week". Measured 8 of 8, twice.
 */

let seq = 0;
const child = (over: Partial<ProgrammeChild> = {}): ProgrammeChild => ({
  id: `c${seq++}`,
  slug: `slug-${seq}`,
  title: `Child ${seq}`,
  start_date: '2026-09-11T19:00:00',
  ...over,
});

function mount(entries: ProgrammeChild[]) {
  return render(
    <MemoryRouter>
      <EventProgramme entries={entries} />
    </MemoryRouter>,
  );
}

describe('the Pride Week mislabel cannot come back', () => {
  it('never renders a Pride-lane heading for children with no subtypes', () => {
    mount([
      child({ title: "WE Party Madrid New Year's Eve Party", pride_subtypes: null }),
      child({ title: "WE NYF Madrid New Year's Day Party", pride_subtypes: null }),
    ]);

    expect(screen.queryByText(/Pride Week/i)).not.toBeInTheDocument();
    // Positive control: the rows must actually be on screen, or "no Pride Week"
    // is also true of a component that rendered nothing at all.
    expect(screen.getByText(/New Year's Eve Party/)).toBeInTheDocument();
  });

  it('groups by day instead', () => {
    mount([
      child({ title: 'Thursday thing', start_date: '2026-09-10T19:00:00' }),
      child({ title: 'Friday thing', start_date: '2026-09-11T19:00:00' }),
    ]);
    expect(screen.getByText(/Thu, 10 Sep/)).toBeInTheDocument();
    expect(screen.getByText(/Fri, 11 Sep/)).toBeInTheDocument();
  });
});

describe('the parade pin', () => {
  it('pins a parade above the timetable and does not repeat it below', () => {
    mount([
      child({ title: 'The Parade', pride_subtypes: ['parade'] }),
      child({ title: 'Afterparty', pride_subtypes: null }),
    ]);

    expect(screen.getByRole('heading', { name: /Parade/ })).toBeInTheDocument();
    // Once, not twice — a pinned child that also appears in its day group reads as
    // two separate events.
    expect(screen.getAllByText('The Parade')).toHaveLength(1);
  });

  it('renders no parade heading when nothing is a parade', () => {
    mount([child({ title: 'Just a party' })]);
    expect(screen.queryByRole('heading', { name: /Parade/ })).not.toBeInTheDocument();
  });
});

describe('the by-type toggle', () => {
  // Measured on the corpus when this shipped: every umbrella's children share one
  // event_type and the largest programme is 3 children, so the toggle is dormant
  // everywhere today. That is deliberate — a control that reveals a single group is
  // a control that does nothing.
  it('is absent for a small programme', () => {
    mount([child({ event_type: 'party' }), child({ event_type: 'concert' })]);
    expect(screen.queryByRole('button', { name: /By type/i })).not.toBeInTheDocument();
  });

  it('is absent when every child shares one type, however many there are', () => {
    mount(Array.from({ length: 9 }, () => child({ event_type: 'party' })));
    expect(screen.queryByRole('button', { name: /By type/i })).not.toBeInTheDocument();
  });

  it('appears and regroups once a programme is big and mixed', async () => {
    mount([
      ...Array.from({ length: 4 }, (_, i) =>
        child({ event_type: 'party', title: `Party ${i}`, start_date: '2026-09-11T22:00:00' }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        child({
          event_type: 'workshop',
          title: `Workshop ${i}`,
          start_date: '2026-09-12T14:00:00',
        }),
      ),
    ]);

    const toggle = screen.getByRole('button', { name: /By type/i });
    expect(toggle).toBeInTheDocument();
    // Day view first.
    expect(screen.getByText(/Fri, 11 Sep/)).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByRole('heading', { name: /^Party$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Workshop$/ })).toBeInTheDocument();
    expect(screen.queryByText(/Fri, 11 Sep/)).not.toBeInTheDocument();
  });
});

describe('time rendering', () => {
  it('prints no clock time for a midnight start', () => {
    mount([child({ title: 'All day', start_date: '2026-09-11T00:00:00' })]);
    // Falls back to the weekday rather than inventing "00:00".
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();
    expect(screen.getByText('All day')).toBeInTheDocument();
  });

  it('prints the clock time when there is one', () => {
    mount([child({ title: 'Evening', start_date: '2026-09-11T19:30:00' })]);
    expect(screen.getByText('19:30')).toBeInTheDocument();
  });
});

describe('byType', () => {
  it('buckets an unclassified child as other rather than hiding it', () => {
    const groups = byType([child({ event_type: null }), child({ event_type: 'party' })]);
    expect(groups.map(([k]) => k).sort()).toEqual(['other', 'party']);
  });

  it('orders the largest group first', () => {
    const groups = byType([
      child({ event_type: 'party' }),
      child({ event_type: 'party' }),
      child({ event_type: 'film' }),
    ]);
    expect(groups[0][0]).toBe('party');
  });
});

describe('isParade', () => {
  it('counts a rally as a parade', () => {
    expect(isParade(child({ pride_subtypes: ['rally'] }))).toBe(true);
  });
  it('is false for no subtypes', () => {
    expect(isParade(child({ pride_subtypes: null }))).toBe(false);
  });
});

describe('shouldOfferTypeToggle', () => {
  it('needs both size and variety', () => {
    const nine = (type: string) => Array.from({ length: 9 }, () => child({ event_type: type }));
    expect(shouldOfferTypeToggle(nine('party'))).toBe(false);
    expect(
      shouldOfferTypeToggle([...nine('party').slice(0, 5), child({ event_type: 'film' })]),
    ).toBe(true);
  });
});
