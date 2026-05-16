/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { PrivacyTab } from '../PrivacyTab';

describe('PrivacyTab', () => {
  it('renders', () => {
    const { container } = render(
      <PrivacyTab formData={{ privacy_settings: { profile_visibility: 'public', identity_visibility: 'friends', relationships_visibility: 'friends', travel_visibility: 'public' } } as never} hasPasskey={false} onPrivacyChange={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
