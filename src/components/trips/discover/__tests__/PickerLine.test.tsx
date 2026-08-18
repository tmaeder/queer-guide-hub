/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, fireEvent } from '@/test/test-utils';
import { PickerLine, type PickerOption } from '../PickerLine';

const opts = (over: Partial<PickerOption>[] = []): PickerOption[] =>
  ['a', 'b', 'c', 'd'].map((id, i) => ({
    id,
    label: `Option ${id.toUpperCase()}`,
    short: id.toUpperCase(),
    meta: `${i} stations`,
    ...over[i],
  }));

describe('PickerLine', () => {
  it('draws one bending segment per option and never a straight one', () => {
    const { container } = renderWithProviders(
      <PickerLine options={opts()} activeId={null} onSelect={vi.fn()} label="Vibe" />,
    );
    const paths = [...container.querySelectorAll('svg > path')];
    expect(paths).toHaveLength(4);
    for (const p of paths) {
      expect(p.getAttribute('d') ?? '').not.toMatch(/[LHVlhv]/);
    }
  });

  // Toggle-button group, not radio and not tablist: re-clicking the active
  // option must clear the filter, which role="radio" cannot express.
  it('clears the filter when the active option is clicked again', () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <PickerLine options={opts()} activeId="b" onSelect={onSelect} label="Vibe" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Option B' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('selects an inactive option', () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <PickerLine options={opts()} activeId="b" onSelect={onSelect} label="Vibe" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Option C' }));
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('exposes the group under its accessible name', () => {
    renderWithProviders(
      <PickerLine options={opts()} activeId={null} onSelect={vi.fn()} label="When" />,
    );
    expect(screen.getByRole('group', { name: 'When' })).toBeInTheDocument();
  });

  describe('an empty option', () => {
    const withEmpty = opts([{}, { disabled: true, disabledReason: '2 stations, too far apart' }]);

    // aria-disabled, NOT disabled. A `disabled` button leaves the tab order and
    // explains nothing — and here the explanation ("December is thin") is the
    // entire reason the option is still on screen.
    it('stays focusable and carries its reason in the accessible name', () => {
      renderWithProviders(
        <PickerLine options={withEmpty} activeId={null} onSelect={vi.fn()} label="When" />,
      );
      const btn = screen.getByRole('button', { name: /Option B — 2 stations, too far apart/ });
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).not.toBeDisabled();
    });

    it('cannot be selected', () => {
      const onSelect = vi.fn();
      renderWithProviders(
        <PickerLine options={withEmpty} activeId={null} onSelect={onSelect} label="When" />,
      );
      fireEvent.click(screen.getByRole('button', { name: /Option B —/ }));
      expect(onSelect).not.toHaveBeenCalled();
    });

    // Ink is the absence of a track, not another track — so an empty stop never
    // becomes a colour code.
    it('renders its segment in ink rather than a track colour', () => {
      const { container } = renderWithProviders(
        <PickerLine options={withEmpty} activeId={null} onSelect={vi.fn()} label="When" />,
      );
      const strokes = [...container.querySelectorAll('svg > path')].map((p) => p.getAttribute('stroke'));
      expect(strokes[1]).toBe('hsl(var(--foreground))');
      expect(strokes[0]).toBe('hsl(var(--track-pink))');
    });
  });

  it('sizes its columns inline, because a dynamic grid-cols-N class gets purged', () => {
    const { container } = renderWithProviders(
      <PickerLine options={opts().slice(0, 3)} activeId={null} onSelect={vi.fn()} label="Pace" />,
    );
    const list = container.querySelector('[role="group"]') as HTMLElement;
    expect(list.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
  });

  it('renders nothing below two options', () => {
    const { container } = renderWithProviders(
      <PickerLine options={opts().slice(0, 1)} activeId={null} onSelect={vi.fn()} label="Pace" />,
    );
    expect(container.querySelector('[role="group"]')).toBeNull();
  });

  // role="group" replaces the implicit `list` role, so <li> children would have
  // a parent that is not a list — axe `listitem`, serious, and it shipped.
  it('carries the group on a non-list element, so no list item is orphaned', () => {
    const { container } = renderWithProviders(
      <PickerLine options={opts()} activeId={null} onSelect={vi.fn()} label="Vibe" />,
    );
    expect(container.querySelector('[role="group"]')?.tagName).toBe('DIV');
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
});
