/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/usePlaceMarks', () => ({
  useEntityMarks: () => ({ data: [] }),
  useTogglePlaceMark: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { MarkVisitedButton } from '../MarkVisitedButton';

describe('MarkVisitedButton', () => {
  it('renders', () => {
    const { container } = render(<MarkVisitedButton entityType="venue" entityId="v1" />);
    expect(container).toBeTruthy();
  });
});
