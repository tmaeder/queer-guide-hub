/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { ActiveFilterBadges } from '../filters/ActiveFilterBadges';

/**
 * `src/test/setup.ts` does NOT initialize i18next, and an uninitialized `t()`
 * echoes the default string with `{{label}}` still in it. That would make the
 * distinct-names assertion below vacuous — every name would come out as the
 * identical literal "Remove filter {{label}}", which is precisely the bug this
 * file exists to prevent, passing as if it were the fix. So initialize the one
 * key for real.
 */
beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({
      lng: 'en',
      resources: { en: { translation: { search: { removeFilter: 'Remove filter {{label}}' } } } },
      interpolation: { escapeValue: false },
    });
  }
});

/**
 * WHAT THESE GUARD, and what they deliberately do NOT.
 *
 * The bug was `<X role="button" aria-label="Remove filter" onClick>` — a lucide
 * SVG. `role="button"` puts it in the accessibility tree but does NOT make it
 * focusable, so the control was pointer-only.
 *
 * A `getByRole('button')` assertion would therefore have PASSED on the broken
 * code: jsdom resolves the role from the attribute and has no real focus model
 * or tab order. So the assertion that carries weight here is the ELEMENT TYPE —
 * a real `<button>` is focusable by construction, an `<svg role="button">` is
 * not — plus a real `userEvent.tab()` reaching it and Enter firing the handler.
 * Proving the tab ORDER end-to-end still belongs in Playwright.
 */

const noop = () => {};

const baseProps = {
  search: '',
  city: '',
  selectedTags: [] as string[],
  selectedAmenities: [] as string[],
  selectedServices: [] as string[],
  selectedAccessibilityAttributes: [] as string[],
  selectedTargetGroups: [] as string[],
  nearMe: false,
  accessibilityLabel: (slug: string) => slug,
  onRemoveSearch: noop,
  onRemoveCity: noop,
  onToggleTag: noop,
  onToggleAmenity: noop,
  onToggleService: noop,
  onToggleAccessibility: noop,
  onToggleTargetGroup: noop,
  onNearMeToggle: noop,
  onClearAll: noop,
};

function removeButtons() {
  return Array.from(document.querySelectorAll('button[data-filter-label]'));
}

describe('ActiveFilterBadges', () => {
  it('renders every remove control as a real <button>, not a role-bearing svg', () => {
    render(
      <ActiveFilterBadges
        {...baseProps}
        city="Berlin"
        selectedTags={['queer-owned', 'wheelchair']}
        nearMe
      />,
    );

    const buttons = removeButtons();
    expect(buttons).toHaveLength(4); // city + 2 tags + nearMe

    // The regression this exists for: an <svg role="button"> is not focusable.
    for (const el of buttons) {
      expect(el.tagName).toBe('BUTTON');
    }
    expect(document.querySelectorAll('svg[role="button"]')).toHaveLength(0);
  });

  it('gives each remove control a name that says WHICH filter it removes', () => {
    render(
      <ActiveFilterBadges
        {...baseProps}
        city="Berlin"
        selectedTags={['queer-owned']}
        selectedAmenities={['wifi']}
      />,
    );

    const names = removeButtons().map((el) => el.getAttribute('aria-label'));

    expect(names).toEqual([
      'Remove filter Berlin',
      'Remove filter queer-owned',
      'Remove filter wifi',
    ]);
    // The defect was eight controls all announcing the bare "Remove filter".
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain('Remove filter');
  });

  it('can take focus, which the svg it replaced could not', () => {
    const onToggleTag = vi.fn();

    render(
      <ActiveFilterBadges
        {...baseProps}
        selectedTags={['queer-owned']}
        onToggleTag={onToggleTag}
      />,
    );

    const button = screen.getByRole('button', { name: 'Remove filter queer-owned' });

    // This is the real discriminator available in jsdom: focus() lands on a
    // <button> and does nothing at all on an <svg role="button">, which is what
    // this used to be.
    button.focus();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    expect(onToggleTag).toHaveBeenCalledWith('queer-owned');
  });

  it('keeps Clear all when the only active filter has no chip of its own', () => {
    // The caller gates on `hasActiveFilters`, which counts `category` — and
    // category has no chip here. Returning null on an empty chip list would
    // take Clear-all away in exactly that case.
    render(<ActiveFilterBadges {...baseProps} />);

    expect(removeButtons()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeTruthy();
  });
});
