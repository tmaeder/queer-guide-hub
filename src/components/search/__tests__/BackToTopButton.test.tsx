import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrVars?: string | Record<string, unknown>) =>
      typeof defaultOrVars === 'string' ? defaultOrVars : key,
  }),
}));

import { BackToTopButton } from '../BackToTopButton';

describe('BackToTopButton', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  });

  it('hidden until scrollY > threshold', () => {
    const { container } = render(<BackToTopButton />);
    expect(container.firstChild).toBeNull();
  });

  it('appears past 600px and scrolls to top on click', () => {
    const scrollSpy = vi.fn();
    window.scrollTo = scrollSpy as unknown as typeof window.scrollTo;
    render(<BackToTopButton />);
    act(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 800 });
      window.dispatchEvent(new Event('scroll'));
    });
    const btn = screen.getByRole('button', { name: /Back to top/i });
    fireEvent.click(btn);
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
