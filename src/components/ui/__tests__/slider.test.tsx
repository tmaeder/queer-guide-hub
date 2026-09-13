/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Slider } from '../slider';

describe('Slider', () => {
  it('renders', () => {
    const { container } = render(<Slider defaultValue={[50]} min={0} max={100} />);
    expect(container.querySelector('[role="slider"]')).toBeTruthy();
  });
});

describe('accessible name lands on the focusable element', () => {
  // role="slider" is the THUMB. Radix does not forward Root's aria-* to it, so
  // an aria-label passed to <Slider> used to decorate a wrapper div and the
  // focusable control had no name at all (WCAG 4.1.2). Measured on prod via
  // the podcast player: aria-label null on [role="slider"] while the caller
  // passed one. All five call sites in this repo that pass a label were
  // affected.
  it('puts aria-label and aria-valuetext on [role="slider"]', () => {
    render(<Slider value={[30]} max={100} aria-label="Seek" aria-valuetext="0:30 of 1:40" />);
    const thumb = screen.getByRole('slider');
    expect(thumb).toHaveAttribute('aria-label', 'Seek');
    expect(thumb).toHaveAttribute('aria-valuetext', '0:30 of 1:40');
    // getByRole('slider', {name}) is the assertion a11y tooling makes, and it
    // fails when the name sits on an ancestor.
    expect(screen.getByRole('slider', { name: 'Seek' })).toBe(thumb);
  });

  it('leaves the wrapper unnamed so the name is not announced twice', () => {
    const { container } = render(<Slider value={[1]} max={10} aria-label="Seek" />);
    const root = container.firstElementChild!;
    expect(root.getAttribute('role')).not.toBe('slider');
    expect(root).not.toHaveAttribute('aria-label');
  });
});
