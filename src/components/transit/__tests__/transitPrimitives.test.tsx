import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FilterChip } from '@/components/transit/FilterChip';
import { StationRing } from '@/components/transit/StationRing';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { ROUTE_BULLET_MAP } from '@/components/transit/routeBulletMap';
import { DepartureRow } from '@/components/transit/DepartureRow';
import { LineStepper } from '@/components/transit/LineStepper';

describe('StationRing', () => {
  it('renders the three states', () => {
    const { container: open } = render(<StationRing state="open" />);
    expect(open.firstElementChild!.className).toContain('bg-background');
    const { container: done } = render(<StationRing state="done" />);
    expect(done.firstElementChild!.className).toContain('bg-foreground');
    const { container: typed } = render(<StationRing state="typed" track="green" />);
    expect(typed.firstElementChild!.className).toContain('bg-track-green');
  });
});

describe('RouteBullet', () => {
  it('maps entity types to letter + track and always uses ink for the letter', () => {
    // Ink on EVERY track fill — paper-on-pink measures 3.43:1 and the bullet
    // letter is 17px, well under the large-text threshold. See the
    // text-on-track lock in tokenContrast.test.ts.
    render(<RouteBullet type="venue" />);
    const bullet = screen.getByText('V');
    expect(bullet.className).toContain('bg-track-pink');
    expect(bullet.className).toContain('text-foreground');
    render(<RouteBullet type="event" />);
    expect(screen.getByText('E').className).toContain('text-foreground');
  });

  it('covers the search entity vocabulary', () => {
    for (const t of [
      'venue',
      'event',
      'city',
      'country',
      'queer_village',
      'personality',
      'news',
      'marketplace',
      'guide',
      'group',
      'hotel',
      'organization',
      'landmark',
    ]) {
      expect(ROUTE_BULLET_MAP[t], t).toBeDefined();
    }
  });

  it('exposes the full type name to AT and falls back safely', () => {
    render(<RouteBullet type="hotel" />);
    expect(screen.getByLabelText('Hotel')).toBeInTheDocument();
    render(<RouteBullet type="somethingnew" />);
    expect(screen.getByLabelText('somethingnew').className).toContain('bg-foreground');
  });
});

describe('DepartureRow', () => {
  it('lays out bullet / time / title / status', () => {
    render(
      <DepartureRow
        type="event"
        time="FRI 21:00"
        title="Ballroom Is Burning"
        status="Selling fast"
        urgent
      />,
    );
    expect(screen.getByText('FRI 21:00')).toBeInTheDocument();
    expect(screen.getByText('Ballroom Is Burning')).toBeInTheDocument();
    expect(screen.getByText('Selling fast')).toBeInTheDocument();
  });
});

describe('LineStepper', () => {
  it('renders one station circle per step, filled up to current', () => {
    const { container } = render(
      <LineStepper steps={['Basics', 'Details', 'Review']} current={1} />,
    );
    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(3);
    expect(circles[0].getAttribute('fill')).toBe('hsl(var(--foreground))'); // done
    expect(circles[1].getAttribute('fill')).toBe('hsl(var(--foreground))'); // current
    expect(circles[2].getAttribute('fill')).toBe('hsl(var(--background))'); // ahead
  });
});

describe('FilterChip', () => {
  it('fills ink when active and never casts the hard shadow', () => {
    // "A card fills ink on hover or lifts with the hard shadow — never both."
    // A chip is too small to carry a 6px offset legibly, so it is always the
    // fill side of that rule; card-lift on a chip is the violation to catch.
    const { container } = render(<FilterChip active label="Pride" />);
    const button = container.querySelector('button')!;
    expect(button.className).toContain('bg-foreground');
    expect(button.className).not.toContain('card-lift');
    expect(button.className).not.toContain('shadow-hard');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('forwards a ref and arbitrary props to the button', () => {
    // Radix `asChild` triggers clone their child with a ref plus
    // aria-expanded / aria-haspopup / data-state. A chip that swallowed them
    // rendered a popover that never opened and announced nothing — which is
    // why MarketplaceControlBar kept a private copy instead of using this.
    const ref = createRef<HTMLButtonElement>();
    render(
      <FilterChip
        ref={ref}
        active={false}
        label="Department"
        aria-expanded="false"
        aria-haspopup="dialog"
        data-state="closed"
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current!.getAttribute('aria-haspopup')).toBe('dialog');
    expect(ref.current!.getAttribute('aria-expanded')).toBe('false');
    expect(ref.current!.getAttribute('data-state')).toBe('closed');
  });
});
