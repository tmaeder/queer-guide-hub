/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useGroupMemberManagement', () => ({
  useSearchProfiles: () => ({ results: [], isSearching: false }),
  useGroupMemberManagement: () => ({ addMember: { mutateAsync: vi.fn() } }),
}));

import { AddMemberDialog } from '../AddMemberDialog';

describe('AddMemberDialog', () => {
  it('renders', () => {
    const { container } = render(<AddMemberDialog groupId="g1" existingMemberIds={[]} onMemberAdded={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
