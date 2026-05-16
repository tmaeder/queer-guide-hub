/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { EditorField } from '../EditorField';

describe('EditorField', () => {
  it('renders text field', () => {
    const { container } = render(
      <EditorField field={{ name: 'x', label: 'X', type: 'text' } as never} value="" onChange={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
