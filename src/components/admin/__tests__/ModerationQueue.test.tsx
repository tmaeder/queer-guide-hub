/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useModeration', () => ({
  useModeration: () => ({
    flags: [], totalCount: 0, loading: false,
    fetchFlags: vi.fn(), updateFlagStatus: vi.fn(), bulkUpdateFlags: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => ({ isAdmin: true, isModerator: true, canManageContent: () => true }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ listFromWhere: vi.fn().mockResolvedValue([]) }));

import { ModerationQueue } from '../ModerationQueue';

describe('ModerationQueue', () => {
  it('renders without crashing', () => {
    const { container } = render(<ModerationQueue />);
    expect(container).toBeTruthy();
  });
});
