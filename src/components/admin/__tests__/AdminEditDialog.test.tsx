/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAdminEdit', () => ({
  useAdminEdit: () => ({
    loading: false,
    editContent: vi.fn().mockResolvedValue({}),
    fetchEditLog: vi.fn().mockResolvedValue([]),
  }),
}));

import { AdminEditDialog } from '../AdminEditDialog';

describe('AdminEditDialog', () => {
  it('renders closed without crashing', () => {
    const { container } = render(
      <AdminEditDialog
        open={false} onOpenChange={vi.fn()}
        contentType="venues" contentId="v1" contentName="Test" currentData={{}}
        onSaved={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });
});
