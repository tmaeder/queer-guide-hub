/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

import { ApiErrorsKanban } from '../ApiErrorsKanban';

function wrapper({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('ApiErrorsKanban', () => {
  it('renders empty kanban', () => {
    const { container } = render(
      <ApiErrorsKanban errors={[]} dailySeries={[]} onCopyPrompt={vi.fn()} onForward={vi.fn()} onStatusChange={vi.fn()} forwardingIds={new Set()} />,
      { wrapper },
    );
    expect(container).toBeTruthy();
  });
});
