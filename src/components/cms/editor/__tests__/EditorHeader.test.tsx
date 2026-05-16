/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { EditorHeader } from '../EditorHeader';

const ct = { id: 'venues', label: { singular: 'Venue', plural: 'Venues' }, titleField: 'name', icon: () => null, fields: [] } as never;
const state = { data: { name: 'Test' }, dirty: false, itemId: 'v1' } as never;

describe('EditorHeader', () => {
  it('renders', () => {
    const { container } = render(
      <EditorHeader contentType={ct} state={state} onSave={vi.fn()} onReset={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
