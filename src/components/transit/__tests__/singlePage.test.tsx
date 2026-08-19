import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SinglePage, SingleSection } from '@/components/transit/SinglePage';

describe('SinglePage', () => {
  it('renders the spine in the fixed order: bullet, title, tags, action', () => {
    const { container } = render(
      <SinglePage
        type="venue"
        title="Südblock"
        tags={<span data-testid="tags">tags</span>}
        action={<button>Find your way here</button>}
        body={<div data-testid="body" />}
      />,
    );
    const txt = container.textContent ?? '';
    expect(txt.indexOf('Südblock')).toBeLessThan(txt.indexOf('tags'));
    expect(txt.indexOf('tags')).toBeLessThan(txt.indexOf('Find your way here'));
    expect(screen.getByLabelText('Venue')).toBeInTheDocument();
  });

  it('keeps the rail in the DOM on every breakpoint', () => {
    // "Every single works at 390px with the same modules in the same order,
    // stacked. No mobile-only cuts." A `hidden lg:block` rail would drop
    // content on a phone; the rail must reflow, not disappear.
    const { container } = render(
      <SinglePage type="city" title="Berlin" body={<div />} rail={<div data-testid="rail" />} />,
    );
    expect(screen.getByTestId('rail')).toBeInTheDocument();
    const aside = container.querySelector('aside')!;
    expect(aside.className).not.toMatch(/\bhidden\b/);
  });

  it('labels the rail with a stable hook, because `article aside` is not unique', () => {
    // e2e/singles.spec.ts asserts the rail reflows on a phone. It used to
    // locate it as `article aside`, which is ambiguous the moment a signed-in
    // reader's trip covers the destination: TripCoveringBanner is a second
    // <aside> in the same <article>. Strict mode then fails the assertion for
    // a reason that has nothing to do with the rail.
    render(
      <SinglePage type="city" title="Berlin" body={<div />} rail={<div data-testid="rail" />} />,
    );
    expect(screen.getByTestId('single-rail')).toBeInTheDocument();
  });

  it('omits the rail and footer entirely when not supplied', () => {
    const { container } = render(<SinglePage type="page" title="Terms" body={<div />} />);
    expect(container.querySelector('aside')).toBeNull();
  });
});

describe('SingleSection', () => {
  it('gives every module the same heading rank', () => {
    render(
      <SingleSection title="Hours" note="Kitchen closes earlier.">
        <div />
      </SingleSection>,
    );
    const h = screen.getByRole('heading', { level: 2 });
    expect(h.textContent).toBe('Hours');
    expect(h.className).toContain('font-display');
  });
});
