/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { AIAssistDrawer } from '../AIAssistDrawer';

describe('AIAssistDrawer', () => {
  it('renders closed without crashing', () => {
    const { container } = render(
      <AIAssistDrawer open={false} onClose={vi.fn()} config={{ id: 'venues', label: { singular: 'Venue', plural: 'Venues' }, fields: [] } as never} recordId="r1" source={{} as never} onApply={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
