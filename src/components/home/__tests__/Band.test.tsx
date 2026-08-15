/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, expectNoNestedInteractive } from '@/test/test-utils';
import { Band } from '../Band';

describe('Band', () => {
  it('emits the 4px ink rule that separates every homepage band', () => {
    const { container } = renderWithProviders(
      <Band title="Departures">rows</Band>,
    );
    const section = container.querySelector('section');
    // HomeSection, which this replaces, only emitted the rule when a `tinted`
    // prop was passed — and no caller ever passed it, so five bands rendered
    // no rule at all. The rule is mandatory here; only the tint is optional.
    expect(section?.className).toContain('border-b-4');
    expect(section?.className).toContain('border-foreground');
  });

  it('paints the tint only on the tint surface', () => {
    const { container: paper } = renderWithProviders(<Band title="A">x</Band>);
    expect(paper.querySelector('section')?.className).not.toContain('bg-surface-container');

    const { container: tint } = renderWithProviders(
      <Band title="B" surface="tint">
        x
      </Band>,
    );
    expect(tint.querySelector('section')?.className).toContain('bg-surface-container');
  });

  it('labels the section with its own heading', () => {
    renderWithProviders(<Band title="Where are you riding?">x</Band>);
    const section = screen.getByRole('region', { name: 'Where are you riding?' });
    const heading = screen.getByRole('heading', { level: 2, name: 'Where are you riding?' });
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
  });

  it('renders the heading at display rank on the display face', () => {
    renderWithProviders(<Band title="News">x</Band>);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.className).toContain('font-display');
    expect(heading.className).toContain('text-display');
  });

  it('frames content through PageContainer so the content edge matches the header', () => {
    const { container } = renderWithProviders(<Band title="A">x</Band>);
    // PageContainer owns the one gutter ladder and the page cap; a band that
    // hand-rolls its own frame fails e2e/page-layout.spec.ts.
    expect(container.querySelector('.max-w-page')).not.toBeNull();
  });

  it('keeps the action slot a SIBLING of the see-all link, not nested in it', () => {
    const { container } = renderWithProviders(
      <Band title="Near you" seeAllHref="/events" seeAllLabel="Full board" action={<button>Berlin</button>}>
        x
      </Band>,
    );
    // A control inside an anchor is invalid HTML and trips axe
    // `nested-interactive` (WCAG 4.1.2) — the guard e2e/nested-interactive
    // enforces on `/`. Assert it at unit level so it fails before CI.
    expectNoNestedInteractive(container);
  });

  it('omits the head trailing group entirely when there is no action or see-all', () => {
    renderWithProviders(<Band title="A">x</Band>);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
