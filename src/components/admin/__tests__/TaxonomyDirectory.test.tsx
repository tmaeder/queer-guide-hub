/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TaxonomyDirectory } from '../TaxonomyDirectory';
import { exportAllTaxonomies } from '@/lib/taxonomyExport';

vi.mock('@/lib/taxonomyExport', () => ({
  exportAllTaxonomies: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderDirectory() {
  render(
    <MemoryRouter>
      <TaxonomyDirectory />
    </MemoryRouter>,
  );
}

describe('TaxonomyDirectory exports', () => {
  it.each([
    ['Export all taxonomies (Excel)', 'Excel', undefined],
    ['Export all taxonomies (CSV)', 'CSV', undefined],
    ['Export without tags (Excel)', 'Excel', { includeTags: false }],
    ['Export without tags (CSV)', 'CSV', { includeTags: false }],
  ] as const)('"%s" exports %s with %o', async (name, format, options) => {
    vi.mocked(exportAllTaxonomies).mockClear();
    renderDirectory();
    fireEvent.click(screen.getByRole('button', { name }));
    await waitFor(() => expect(exportAllTaxonomies).toHaveBeenCalledTimes(1));
    const args = vi.mocked(exportAllTaxonomies).mock.calls[0];
    expect(args[0]).toBe(format);
    expect(args[1]).toEqual(options);
  });
});
