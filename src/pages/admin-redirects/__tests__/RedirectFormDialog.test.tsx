/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { RedirectFormDialog } from '../RedirectFormDialog';

describe('RedirectFormDialog', () => {
  it('renders closed without crashing', () => {
    const { container } = render(
      <RedirectFormDialog open={false} editingRedirect={null} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
