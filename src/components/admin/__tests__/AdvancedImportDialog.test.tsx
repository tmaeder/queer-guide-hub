/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AdvancedImportDialog } from '../AdvancedImportDialog';

describe('AdvancedImportDialog', () => {
  it('renders trigger button', () => {
    render(
      <AdvancedImportDialog importType="venues" onImport={vi.fn()}>
        <button>Open Import</button>
      </AdvancedImportDialog>,
    );
    expect(screen.getByText('Open Import')).toBeInTheDocument();
  });
});
