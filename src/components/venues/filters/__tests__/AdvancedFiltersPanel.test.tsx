import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/hooks/useManagedOptions', () => ({
  useVocabularyOptions: () => [],
}));

import { AdvancedFiltersPanel, type AdvancedFiltersPanelProps } from '../AdvancedFiltersPanel';

/**
 * Both variants (bottom sheet + inline nav) used to be mounted at once and
 * hidden by CSS. jsdom ignores CSS, so the defect shows here as two copies of
 * every control: on desktop the Sheet's overlay blocked the page, on mobile the
 * shared `open` state let the hidden copy close the visible dropdown.
 */
function Harness({ onToggleTag }: { onToggleTag: (v: string) => void }) {
  const [tagsOpen, setTagsOpen] = useState(false);
  const noop = () => {};
  const props: AdvancedFiltersPanelProps = {
    open: true,
    onOpenChange: noop,
    city: '',
    onCityChange: noop,
    onSearch: noop,
    tagsOpen,
    onTagsOpenChange: setTagsOpen,
    selectedTags: [],
    tagsLoading: false,
    tagItems: [{ key: 't1', label: 'Leather' }],
    onToggleTag,
    selectedAmenities: [],
    selectedServices: [],
    selectedAccessibilityAttributes: [],
    amenityOptions: [],
    accessibilityOptions: [],
    vocabLoading: false,
    accessibilityLabel: (s) => s,
    onToggleAmenity: noop,
    onToggleService: noop,
    onToggleAccessibility: noop,
    targetGroupsOpen: false,
    onTargetGroupsOpenChange: noop,
    selectedTargetGroups: [],
    targetGroupsLoading: false,
    targetGroupItems: [],
    onToggleTargetGroup: noop,
    hasActiveFilters: false,
    onClearFilters: noop,
  };
  return <AdvancedFiltersPanel {...props} />;
}

function setWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
}

describe('AdvancedFiltersPanel', () => {
  const original = window.innerWidth;
  afterEach(() => setWidth(original));

  it('desktop: renders the inline panel only — no modal overlay', async () => {
    setWidth(1440);
    await act(async () => {
      render(<Harness onToggleTag={() => {}} />);
    });
    expect(screen.getAllByText('Select tags...')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Venue filters' })).toBeTruthy();
  });

  it('mobile: renders the sheet only, and the tags dropdown opens and selects', async () => {
    setWidth(400);
    const onToggleTag = vi.fn();
    await act(async () => {
      render(<Harness onToggleTag={onToggleTag} />);
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    const triggers = screen
      .getAllByText('Select tags...')
      .map((el) => el.closest('button') as HTMLButtonElement);
    expect(triggers).toHaveLength(1);

    // The Sheet focuses its first control on the next frame; let that land
    // first, as it always has by the time a real user taps.
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    await act(async () => {
      fireEvent.click(triggers[0]);
    });
    expect(triggers[0].getAttribute('aria-expanded')).toBe('true');
    const option = await screen.findByRole('option', { name: 'Leather' });
    await act(async () => {
      fireEvent.click(option);
    });
    expect(onToggleTag).toHaveBeenCalledWith('Leather');
  });
});
