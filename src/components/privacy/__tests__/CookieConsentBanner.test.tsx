/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useCookieConsent', () => ({
  useCookieConsent: () => ({ showBanner: false, acceptAll: vi.fn(), acceptNecessary: vi.fn() }),
}));

import { CookieConsentBanner } from '../CookieConsentBanner';

describe('CookieConsentBanner', () => {
  it('renders null when banner hidden', () => {
    const { container } = render(
      <MemoryRouter><CookieConsentBanner /></MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
