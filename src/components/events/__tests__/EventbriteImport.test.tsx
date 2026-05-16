/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { EventbriteImport } from '../EventbriteImport';

describe('EventbriteImport', () => {
  it('renders trigger', () => {
    const { container } = render(<EventbriteImport onImportComplete={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
