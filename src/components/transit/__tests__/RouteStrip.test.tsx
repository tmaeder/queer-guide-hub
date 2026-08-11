/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RouteStrip, type RouteStation } from '@/components/transit/RouteStrip';

const STATIONS: RouteStation[] = [
  { id: 'what-are-cookies', title: 'What Are Cookies', depth: 1 },
  { id: 'types', title: 'Types of Cookies', depth: 1 },
  { id: 'essential', title: 'Essential Cookies', depth: 2 },
  { id: 'preference', title: 'Preference Cookies', depth: 2 },
  { id: 'managing-cookies', title: 'Managing Cookies', depth: 1 },
];

describe('RouteStrip', () => {
  it('renders every station as a fragment anchor, not a button', () => {
    render(<RouteStrip stations={STATIONS} activeId="types" />);
    // The old TOC used <button> + scrollIntoView and never wrote a hash, so no
    // section of any policy was linkable. Anchors are the whole point.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(STATIONS.length);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '#what-are-cookies',
      '#types',
      '#essential',
      '#preference',
      '#managing-cookies',
    ]);
  });

  it('numbers only depth-1 stations, so the rail agrees with the prose counter', () => {
    // `.qg-cms-body--legal h2` increments a CSS counter that skips <h3>. If the
    // rail numbered sub-stations too, the sidebar would say "section 5" while
    // the heading beside it said "3".
    render(<RouteStrip stations={STATIONS} activeId="types" />);
    const links = screen.getAllByRole('link');
    expect(within(links[0]).getByText('1')).toBeInTheDocument();
    expect(within(links[1]).getByText('2')).toBeInTheDocument();
    expect(links[2].textContent).toBe('Essential Cookies');
    expect(links[3].textContent).toBe('Preference Cookies');
    expect(within(links[4]).getByText('3')).toBeInTheDocument();
  });

  it('indents sub-stations', () => {
    render(<RouteStrip stations={STATIONS} activeId="types" />);
    const sub = screen.getByRole('link', { name: /Essential Cookies/ });
    expect(sub.innerHTML).toContain('ml-4');
  });

  it('marks the active station and only the active station', () => {
    render(<RouteStrip stations={STATIONS} activeId="types" />);
    const current = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current'));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '#types');
  });

  it('draws the line in the track colour, and in ink when there is no track', () => {
    const { container: green } = render(
      <RouteStrip stations={STATIONS} activeId="types" track="green" />,
    );
    expect(green.innerHTML).toContain('bg-track-green');

    // Accessibility runs monochrome on purpose — a page about not depending on
    // colour must not use colour as its only identity.
    const { container: ink } = render(<RouteStrip stations={STATIONS} activeId="types" />);
    expect(ink.innerHTML).not.toContain('bg-track-');
    expect(ink.innerHTML).toContain('bg-foreground');
  });

  it('defaults a station with no depth to a full stop', () => {
    render(<RouteStrip stations={[{ id: 'a', title: 'Alpha' }]} activeId="a" />);
    expect(within(screen.getByRole('link')).getByText('1')).toBeInTheDocument();
  });

  it('renders the horizontal bar as a sticky band whose bleed follows the page gutter', () => {
    const { container } = render(
      <RouteStrip stations={STATIONS} activeId="types" orientation="horizontal" />,
    );
    const nav = container.querySelector('nav')!;
    // A flat -mx-4 leaves the rule 16px short of the gutter from `sm` up.
    for (const cls of ['sticky', '-mx-4', 'sm:-mx-6', 'md:-mx-8', 'border-b-2']) {
      expect(nav.className).toContain(cls);
    }
  });

  it('names the nav landmark', () => {
    render(<RouteStrip stations={STATIONS} activeId="types" label="Sections of this policy" />);
    expect(screen.getByRole('navigation', { name: 'Sections of this policy' })).toBeInTheDocument();
  });
});
