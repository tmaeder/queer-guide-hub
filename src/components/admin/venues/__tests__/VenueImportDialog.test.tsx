/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { VenueImportDialog } from '../VenueImportDialog';

describe('VenueImportDialog', () => {
  it('renders closed without crashing', () => {
    const { container } = render(
      <VenueImportDialog open={false} onOpenChange={vi.fn()} provider="foursquare" onImport={vi.fn()} isImporting={false} />,
    );
    expect(container).toBeTruthy();
  });
});
