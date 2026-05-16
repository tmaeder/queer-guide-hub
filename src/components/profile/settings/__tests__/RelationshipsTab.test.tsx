/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { RelationshipsTab } from '../RelationshipsTab';

describe('RelationshipsTab', () => {
  it('renders', () => {
    const { container } = render(<RelationshipsTab formData={{} as never} onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
