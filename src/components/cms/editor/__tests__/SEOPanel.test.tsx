/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { SEOPanel } from '../SEOPanel';

describe('SEOPanel', () => {
  it('renders', () => {
    const { container } = render(<SEOPanel metadata={{}} onUpdate={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
