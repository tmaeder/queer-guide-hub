import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CityNetwork, lineWidthForBox } from '../CityNetwork';
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

  it('line weight follows the rendered box, clamped to a floor and a ceiling', () => {
    // A 48px search thumbnail must not clog: the floor holds.
    expect(lineWidthForBox(64, 48)).toBe(4.5);
    // The 96px-tall /going-out tiles, which read as hairlines at 3.5px.
    expect(lineWidthForBox(321, 96)).toBe(4.5);
    // The homepage city card at a 1440px viewport (273x153) keeps its 6px.
    expect(lineWidthForBox(273, 153)).toBe(6);
    // Between floor and ceiling the weight scales with the box.
    expect(lineWidthForBox(260, 130)).toBe(5);
    // A masthead backdrop is capped.
    expect(lineWidthForBox(1400, 400)).toBe(7);
    // An unmeasured (zero) box falls back instead of producing 0px lines.
    expect(lineWidthForBox(0, 0)).toBe(4.5);
  });

  it('lineWidth overrides the thumb weight for large picture slots', () => {
    const { container } = render(<CityNetwork slug={subjectSlug} variant="thumb" lineWidth={6} />);
    const paths = pathsOf(container);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.getAttribute('stroke-width') === '6')).toBe(true);
  });

  it('backdrop variant crops, anchors right and draws heavier non-scaling lines', () => {
    const { container } = render(<CityNetwork slug={subjectSlug} variant="backdrop" />);
    const { crop } = subject;
    const svg = svgOf(container);
    expect(svg?.getAttribute('viewBox')).toBe(`${crop.x} ${crop.y} ${crop.w} ${crop.h}`);
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMaxYMid meet');
    const paths = pathsOf(container);
    expect(paths).toHaveLength(subject.lines.length);
    expect(paths.every((p) => p.getAttribute('vector-effect') === 'non-scaling-stroke')).toBe(true);
    expect(paths.every((p) => Number(p.getAttribute('stroke-width')) > 2.5)).toBe(true);
  });

  it('backdrop never falls back to the template line — it must be city-specific', () => {
    const { container } = render(<CityNetwork slug="no-such-city" variant="backdrop" index={0} />);
    expect(svgOf(container)).toBeNull();
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
