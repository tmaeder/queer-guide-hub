/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useModeration', () => ({ useModeration: () => ({ createFlag: vi.fn(), loading: false }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ReportDialog } from '../ReportDialog';

describe('ReportDialog', () => {
  it('renders closed', () => {
    const { container } = render(
      <ReportDialog open={false} onOpenChange={vi.fn()} contentType="venue" contentId="v1" />,
    );
    expect(container).toBeTruthy();
  });
});
