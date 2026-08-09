import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    for (const t of ['venue', 'event', 'city', 'country', 'queer_village', 'personality', 'news', 'marketplace', 'guide', 'group', 'hotel', 'organization', 'landmark']) {
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
    render(<DepartureRow type="event" time="FRI 21:00" title="Ballroom Is Burning" status="Selling fast" urgent />);
    expect(screen.getByText('FRI 21:00')).toBeInTheDocument();
    expect(screen.getByText('Ballroom Is Burning')).toBeInTheDocument();
    expect(screen.getByText('Selling fast')).toBeInTheDocument();
  });
});

describe('LineStepper', () => {
  it('renders one station circle per step, filled up to current', () => {
    const { container } = render(<LineStepper steps={['Basics', 'Details', 'Review']} current={1} />);
    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(3);
    expect(circles[0].getAttribute('fill')).toBe('hsl(var(--foreground))'); // done
    expect(circles[1].getAttribute('fill')).toBe('hsl(var(--foreground))'); // current
    expect(circles[2].getAttribute('fill')).toBe('hsl(var(--background))'); // ahead
  });
});
