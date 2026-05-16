/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { EventsCsvImport } from '../EventsCsvImport';

describe('EventsCsvImport', () => {
  it('renders trigger', () => {
    const { container } = render(<EventsCsvImport onImportComplete={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
