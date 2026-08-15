import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CityNetwork } from '../CityNetwork';
import { CITY_NETWORKS, NETWORK_VIEWBOX, hasCityNetwork } from '../cityNetworkGeometry';

/**
 * Which cities have geometry changes every time the generator runs, so these
 * tests pick a subject out of the data rather than naming one — otherwise the
 * suite breaks whenever a city gains or loses its network.
 */
const [subjectSlug, subject] = Object.entries(CITY_NETWORKS)[0];

const svgOf = (c: HTMLElement) => c.querySelector('svg');
const pathsOf = (c: HTMLElement) => [...c.querySelectorAll('path')];

describe('CityNetwork', () => {
  it('hasCityNetwork answers for real and unknown slugs', () => {
    expect(hasCityNetwork(subjectSlug)).toBe(true);
    expect(hasCityNetwork('a-city-that-does-not-exist')).toBe(false);
    expect(hasCityNetwork(null)).toBe(false);
    expect(hasCityNetwork(undefined)).toBe(false);
  });

  it('card variant draws the full frame, one path per line', () => {
    const { container } = render(<CityNetwork slug={subjectSlug} />);
    expect(svgOf(container)?.getAttribute('viewBox')).toBe(
      `0 0 ${NETWORK_VIEWBOX.w} ${NETWORK_VIEWBOX.h}`,
    );
    expect(pathsOf(container)).toHaveLength(subject.lines.length);
    // No ink casing: a line is ONE stroke. Two paths per line would mean the
    // casing came back (see the design-system note).
    expect(pathsOf(container).every((p) => p.getAttribute('vector-effect') === null)).toBe(true);
  });

  it('thumb variant crops to the city bounding box and pins stroke width', () => {
    const { container } = render(<CityNetwork slug={subjectSlug} variant="thumb" />);
    const { crop } = subject;
    expect(svgOf(container)?.getAttribute('viewBox')).toBe(
      `${crop.x} ${crop.y} ${crop.w} ${crop.h}`,
    );
    // Without non-scaling-stroke the same width renders at a different
    // thickness per city, because each thumb has its own user-unit scale.
    expect(
      pathsOf(container).every((p) => p.getAttribute('vector-effect') === 'non-scaling-stroke'),
    ).toBe(true);
  });

  it('renders nothing for an unknown city unless a template index is given', () => {
    const { container } = render(<CityNetwork slug="no-such-city" />);
    expect(svgOf(container)).toBeNull();

    // The homepage opts in, so its grid never has a hole.
    const withTemplate = render(<CityNetwork slug="no-such-city" index={0} />);
    expect(svgOf(withTemplate.container)).not.toBeNull();
    // The template is the bending line, not octilinear geometry.
    expect(pathsOf(withTemplate.container)[0].getAttribute('d')).toContain('C');
  });

  it('is decorative — it carries no accessible name', () => {
    const { container } = render(<CityNetwork slug={subjectSlug} />);
    expect(svgOf(container)?.getAttribute('aria-hidden')).toBe('true');
  });
});
