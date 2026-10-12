/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrVars?: string | Record<string, unknown>) =>
      typeof defaultOrVars === 'string' ? defaultOrVars : key,
  }),
}));

const setMode = vi.fn();
let currentMode = 'community';
vi.mock('@/hooks/useUserMode', () => ({
  useUserMode: () => ({ mode: currentMode, setMode }),
}));

import { ModeSwitcher } from '../ModeSwitcher';
import { USER_MODES } from '@/config/navigation';

describe('ModeSwitcher', () => {
  it('renders one radio per mode with the active one checked', () => {
    currentMode = 'community';
    render(<ModeSwitcher />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(USER_MODES.length);
    const checked = radios.filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toContain('header.modes.community');
  });

  it('supports arrow keys, Home and End with a single tab stop', () => {
    currentMode = 'community';
    render(<ModeSwitcher />);
    const radios = screen.getAllByRole('radio');
    const active = radios.find((radio) => radio.getAttribute('aria-checked') === 'true')!;
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    active.focus();
    fireEvent.keyDown(active, { key: 'ArrowRight' });
    const next = (radios.indexOf(active) + 1) % USER_MODES.length;
    expect(document.activeElement).toBe(radios[next]);
    expect(setMode).toHaveBeenLastCalledWith(USER_MODES[next].value);
    fireEvent.keyDown(radios[next], { key: 'End' });
    expect(document.activeElement).toBe(radios.at(-1));
    fireEvent.keyDown(radios.at(-1)!, { key: 'Home' });
    expect(document.activeElement).toBe(radios[0]);
  });

  it('calls setMode with the chosen mode value on click', () => {
    currentMode = 'community';
    render(<ModeSwitcher />);
    const dating = screen
      .getAllByRole('radio')
      .find((r) => r.textContent?.includes('header.modes.dating'));
    expect(dating).toBeTruthy();
    fireEvent.click(dating!);
    expect(setMode).toHaveBeenCalledWith('dating');
  });
});
