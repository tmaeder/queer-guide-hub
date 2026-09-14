/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TriageItemRow } from '../TriageItemRow';

const item = {
  id: 'i1',
  title: 'Pending venue',
  subtitle: 'low_quality_score',
  queue_type: 'staging',
  content_type: 'venues',
  confidence_score: 0.65,
  has_diff: true,
  created_at: new Date(Date.now() - 5 * 3_600_000).toISOString(),
} as never;

describe('TriageItemRow', () => {
  it('renders title + queue + content badges', () => {
    render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    expect(screen.getByText('Pending venue')).toBeInTheDocument();
    expect(screen.getByText('Staging')).toBeInTheDocument();
    expect(screen.getByText('Venue')).toBeInTheDocument();
    expect(screen.getByText('diff')).toBeInTheDocument();
  });

  it('shows confidence + age', () => {
    render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    expect(screen.getByText('5h')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
  });

  it('clicking the row opens the item', () => {
    const onSelect = vi.fn();
    render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={onSelect}
        onToggleCheck={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Pending venue' }));
    expect(onSelect).toHaveBeenCalled();
  });

  /**
   * The row was `role="button" tabIndex={0}` wrapping the Checkbox until
   * 2026-09-14 — axe `nested-interactive` (serious, WCAG 4.1.2), a button with
   * focusable descendants. It is the same "overlay siblings, never wrappers"
   * rule this repo applies to cards.
   *
   * The a11y suite could not see it: /admin/inbox rendered "Failed to load
   * triage queue" (the triage UNION type mismatch), so no row ever mounted in
   * CI and the axe scan found nothing to fault. These assertions run in jsdom
   * and do not need the route to load.
   */
  it('has no interactive element nested inside another', () => {
    const { container } = render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    const interactive = 'a, button, [role="button"], [role="checkbox"], [tabindex]';
    const nested = Array.from(container.querySelectorAll(interactive)).filter((el) =>
      el.parentElement?.closest(interactive),
    );
    expect(nested.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);
  });

  it('makes the whole row clickable with an overlay, not a wrapper', () => {
    // jsdom has no layout, so "click the title" cannot be asserted directly.
    // What makes it true in a browser is that the overlay covers the row and
    // paints last — assert that, rather than a click jsdom cannot model.
    const { container } = render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    const overlay = screen.getByRole('button', { name: 'Open Pending venue' });
    expect(overlay.className).toContain('absolute');
    expect(overlay.className).toContain('inset-0');
    expect(container.firstElementChild?.className).toContain('relative');
    expect(container.firstElementChild?.lastElementChild).toBe(overlay);
  });

  it('gives the checkbox a 24px target that sits above the overlay', () => {
    // WCAG 2.5.8: axe measured the old 16px box at /admin/inbox and failed it
    // `target-size` (serious). The primitive stays 16px and says tap size comes
    // from a surrounding label row — this checkbox has none, so it is overridden
    // here. z-10 is what keeps the overlay from swallowing its clicks.
    render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    const box = screen.getByRole('checkbox');
    expect(box.className).toContain('h-6');
    expect(box.className).toContain('w-6');
    expect(box.className).toContain('z-10');
    // Load-bearing: `h-6` merely BEING present proves nothing — if tailwind-merge
    // kept the primitive's `h-4 w-4` alongside it, stylesheet order would decide
    // and the box could still render at 16px while this test stayed green.
    // Verified against the merged string: the 4s are gone.
    expect(box.className).not.toMatch(/\bh-4\b/);
    expect(box.className).not.toMatch(/\bw-4\b/);
  });

  it('names the checkbox for assistive tech', () => {
    render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Select Pending venue' })).toBeInTheDocument();
  });

  it('clicking checkbox calls onToggleCheck and stops propagation', () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={onSelect}
        onToggleCheck={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
