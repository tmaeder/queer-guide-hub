import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { StatLine } from '@/components/transit/StatLine';
import { Checklist } from '@/components/transit/Checklist';
import { Vouches } from '@/components/transit/Vouches';
import { Boundaries } from '@/components/transit/Boundaries';
import { MembershipState } from '@/components/transit/MembershipState';
import { Itinerary } from '@/components/transit/Itinerary';
import { VariantPicker } from '@/components/transit/VariantPicker';
import { MapInset } from '@/components/transit/MapInset';

describe('StatLine', () => {
  it('drops empty stats', () => {
    render(<StatLine stats={[{ label: 'Capacity', value: 240 }, { label: 'Door', value: null }]} />);
    expect(screen.getByText('240')).toBeInTheDocument();
    expect(screen.queryByText('Door')).toBeNull();
  });
});

describe('Checklist', () => {
  it('surfaces form number, wait, and by-post as first-class facts', () => {
    // For a legal name change these three ARE the content: the form number,
    // the wait to sequence around, and whether you must appear in person —
    // which in a hostile jurisdiction decides whether the process is safe.
    render(
      <Checklist
        steps={[
          { id: '1', title: 'File the deed poll', form: 'Form C1', wait: '6-8 weeks', byPost: true },
        ]}
      />,
    );
    expect(screen.getByText('Form C1')).toBeInTheDocument();
    expect(screen.getByText(/Wait 6-8 weeks/)).toBeInTheDocument();
    expect(screen.getByText('By post')).toBeInTheDocument();
  });
});

describe('Vouches', () => {
  it('accepts no score and renders none', () => {
    // "Names, not stars. Nobody is scored out of five."
    render(<Vouches people={[{ id: '1', name: 'Ines K.', role: 'moderator' }]} />);
    expect(screen.getByText('Ines K.')).toBeInTheDocument();
    expect(screen.queryByText(/★|\/5|out of 5/i)).toBeNull();
  });

  it('renders nothing without vouches (no data exists in the product yet)', () => {
    const { container } = render(<Vouches people={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Boundaries', () => {
  it('styles "Not into" identically to the other two', () => {
    // A stated limit is not a warning. Framing it as an alert makes someone's
    // boundary look like a problem.
    const { container } = render(
      <Boundaries boundaries={{ into: ['a'], notInto: ['b'], askMe: ['c'] }} />,
    );
    const secs = [...container.querySelectorAll('section')].map((s) => s.className);
    expect(new Set(secs).size).toBe(1);
    expect(screen.getByText('Not into')).toBeInTheDocument();
  });

  it('drops empty columns but keeps declared order', () => {
    render(<Boundaries boundaries={{ into: ['x'], askMe: ['y'] }} />);
    expect(screen.queryByText('Not into')).toBeNull();
    const heads = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(heads).toEqual(['Into', 'Ask me']);
  });
});

describe('MembershipState', () => {
  it('always states the join path, not just the badge', () => {
    render(<MembershipState state="vetted" />);
    expect(screen.getByText(/vouches for you/i)).toBeInTheDocument();
  });

  it('says a private list is not public — a safety property', () => {
    render(<MembershipState state="private" />);
    expect(screen.getByText(/member list is not public/i)).toBeInTheDocument();
  });
});

describe('Itinerary', () => {
  it('keeps an empty day visible', () => {
    // The one deliberate exception to "no empty shells": dropping a day
    // silently renumbers the reader's own plan.
    render(
      <Itinerary
        days={[
          { id: '1', label: 'Fri 14 Aug', entries: [] },
          { id: '2', label: 'Sat 15 Aug', entries: [{ id: 'e', name: 'Ball', type: 'event' }] },
        ]}
      />,
    );
    expect(screen.getByText('Fri 14 Aug')).toBeInTheDocument();
    expect(screen.getByText('Nothing planned yet.')).toBeInTheDocument();
  });
});

describe('VariantPicker', () => {
  it('keeps sold-out variants visible but disabled', () => {
    // Hiding them would misrepresent the maker as only ever having made two.
    render(
      <VariantPicker
        groupLabel="Size"
        variants={[
          { id: 's', label: 'S', available: true },
          { id: 'm', label: 'M', available: false },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /^M/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^S/ })).toBeEnabled();
  });

  it('exposes no rating or review surface', () => {
    // "Ratings rank people" — marketplace sellers are community makers.
    const { container } = render(
      <VariantPicker groupLabel="Size" variants={[{ id: 's', label: 'S', available: true }]} />,
    );
    expect(container.textContent).not.toMatch(/review|rating|stars/i);
  });

  it('reports selection to assistive tech', () => {
    const onSelect = vi.fn();
    render(
      <VariantPicker
        groupLabel="Size"
        selectedId="s"
        onSelect={onSelect}
        variants={[{ id: 's', label: 'S', available: true }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'S' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('MapInset', () => {
  it('frames the caller\'s map rather than building a second one', () => {
    render(
      <MemoryRouter>
        <MapInset caption="Kottbusser Tor · U1, U8">
          <div data-testid="the-real-map" />
        </MapInset>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('the-real-map')).toBeInTheDocument();
    expect(screen.getByText(/Kottbusser Tor/)).toBeInTheDocument();
  });
});
