/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { RevisionDiff } from '../RevisionDiff';

describe('RevisionDiff', () => {
  it('renders empty', () => {
    const { container } = render(<RevisionDiff changes={[]} onClose={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
