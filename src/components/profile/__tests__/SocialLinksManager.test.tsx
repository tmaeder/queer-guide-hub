/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { SocialLinksManager } from '../SocialLinksManager';

describe('SocialLinksManager', () => {
  it('renders empty', () => {
    const { container } = render(<SocialLinksManager onUpdate={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
