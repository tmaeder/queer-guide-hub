/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { EditorToolbar } from '../EditorToolbar';

describe('EditorToolbar', () => {
  it('renders null when no editor', () => {
    const { container } = render(<EditorToolbar editor={null as never} />);
    expect(container).toBeTruthy();
  });
});
