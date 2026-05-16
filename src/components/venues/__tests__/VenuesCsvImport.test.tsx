/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { VenuesCsvImport } from '../VenuesCsvImport';

describe('VenuesCsvImport', () => {
  it('renders trigger', () => {
    const { container } = render(<VenuesCsvImport onImportComplete={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
