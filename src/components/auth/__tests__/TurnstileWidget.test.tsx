/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import { TurnstileWidget, isTurnstileEnabled } from '../TurnstileWidget';
import { useTurnstile } from '@/hooks/useTurnstile';

// VITE_TURNSTILE_SITE_KEY is unset in the test env, so the widget degrades
// gracefully: it renders nothing and never blocks form submission. This is the
// contract that keeps local dev / CAPTCHA-disabled Supabase projects working.
describe('TurnstileWidget — no site key configured', () => {
  it('isTurnstileEnabled is false when no site key is set', () => {
    expect(isTurnstileEnabled).toBe(false);
  });

  it('renders nothing when no site key is configured', () => {
    const { container } = render(<TurnstileWidget onVerify={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('useTurnstile reports required=false and a null token', () => {
    const { result } = renderHook(() => useTurnstile());
    expect(result.current.required).toBe(false);
    expect(result.current.token).toBeNull();
  });
});
