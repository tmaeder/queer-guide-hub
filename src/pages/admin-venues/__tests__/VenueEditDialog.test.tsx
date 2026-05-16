/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { VenueEditDialog } from '../VenueEditDialog';

describe('VenueEditDialog', () => {
  it('renders closed without crashing', () => {
    const { container } = render(
      <VenueEditDialog
        open={false} onOpenChange={vi.fn()}
        formData={{ name: '', address: '', tags: [], amenities: [] } as never} setFormData={vi.fn()} isEditing={false}
        isEnriching={false} onSubmit={vi.fn()} onEnrich={vi.fn()} onAddressComponents={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });
});
