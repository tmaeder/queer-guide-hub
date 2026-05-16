/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { CommandPalette } from '../CommandPalette';

describe('CommandPalette', () => {
  it('renders closed without crashing', () => {
    const { container } = render(
      <CommandPalette open={false} onOpenChange={vi.fn()} onNavigate={vi.fn()} onEdit={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
