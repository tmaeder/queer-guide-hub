/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/utils/timezone', () => ({ timeAgo: () => '5m ago' }));
vi.mock('@/components/icons/brand', () => ({ Github: () => <svg /> }));

import { HandoffSection } from '../HandoffSection';

describe('HandoffSection', () => {
  it('renders without crashing on empty', () => {
    const { container } = render(
      <HandoffSection handoffs={[]} prompt="" onRecord={vi.fn()} onUpdateStatus={vi.fn()} isRecording={false} />,
    );
    expect(container).toBeTruthy();
  });

  it('renders handoff entries', () => {
    render(
      <HandoffSection
        handoffs={[
          { id: 'h1', target: 'claude-code', status: 'sent', at: '2026-05-15T00:00:00Z' } as never,
        ]}
        prompt="some prompt"
        onRecord={vi.fn()} onUpdateStatus={vi.fn()} isRecording={false}
      />,
    );
    expect(screen.getByText(/Claude Code/)).toBeInTheDocument();
  });
});
