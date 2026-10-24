import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TableImportDialog } from '../TableImportDialog';
import { config } from '@/lib/tableImport/__tests__/fixture';
import { readImportFile } from '@/lib/tableImport/files';
import { previewImport, applyImport } from '@/lib/tableImport/service';
vi.mock('@/lib/tableImport/files', () => ({ MAX_IMPORT_ROWS: 20000, readImportFile: vi.fn() }));
vi.mock('@/lib/tableImport/service', () => ({ previewImport: vi.fn(), applyImport: vi.fn() }));
vi.mock('@/utils/csvExport', () => ({ exportToCsv: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readImportFile).mockResolvedValue([
    { name: 'Data', headers: ['ID', 'Name'], rows: [['one', 'New name']] },
  ]);
  vi.mocked(previewImport).mockResolvedValue({
    actorId: 'admin',
    options: { mode: 'update', matchField: 'id', mapping: ['id', 'name'], clearBlanks: false },
    rows: [
      {
        row: 2,
        identity: 'one',
        action: 'update',
        before: { id: 'one', name: 'Old' },
        patch: { name: 'New name' },
        issues: [],
      },
    ],
  });
});
async function upload() {
  fireEvent.click(screen.getByRole('button', { name: 'Import / upload' }));
  fireEvent.change(screen.getByLabelText(/CSV, TSV or Excel file/), {
    target: { files: [new File(['ID,Name\none,New'], 'file.csv')] },
  });
  await screen.findByRole('button', { name: 'Preview changes' });
  fireEvent.change(screen.getByLabelText('Import mode'), { target: { value: 'update' } });
}
describe('table import workflow', () => {
  it('uploads, maps, previews and requires review before applying', async () => {
    const refresh = vi.fn();
    vi.mocked(applyImport).mockImplementation(
      async (_config, _preview, _excluded, _signal, progress) => {
        const results = [
          { row: 2, identity: 'one', status: 'updated' as const, message: 'Saved.' },
        ];
        progress(results);
        return results;
      },
    );
    render(<TableImportDialog config={config} onComplete={refresh} />);
    await upload();
    expect(screen.getByLabelText('Map ID')).toHaveValue('id');
    expect(screen.getByLabelText('Map Name')).toHaveValue('name');
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    const apply = await screen.findByRole('button', { name: 'Apply 1 record change' });
    expect(apply).toBeDisabled();
    expect(applyImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/I reviewed/));
    fireEvent.click(apply);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Saved.')).toBeInTheDocument();
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare a fresh preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    await waitFor(() => expect(screen.getByLabelText('Include row 2')).not.toBeChecked());
    expect(screen.getByLabelText('Include row 2')).toBeDisabled();
  });
  it('keeps parsing failures visible and does not preview or apply', async () => {
    vi.mocked(readImportFile).mockRejectedValue(
      new Error('The file contains an unclosed quoted field.'),
    );
    render(<TableImportDialog config={config} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import / upload' }));
    fireEvent.change(screen.getByLabelText(/CSV, TSV or Excel file/), {
      target: { files: [new File(['broken'], 'file.csv')] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/unclosed/);
    expect(previewImport).not.toHaveBeenCalled();
  });
  it('blocks invalid rows until they are excluded', async () => {
    vi.mocked(previewImport).mockResolvedValue({
      actorId: 'admin',
      options: { mode: 'update', matchField: 'id', mapping: ['id', 'name'], clearBlanks: false },
      rows: [
        {
          row: 2,
          identity: 'one',
          action: 'error',
          before: null,
          patch: {},
          issues: ['No matching record.'],
        },
      ],
    });
    render(<TableImportDialog config={config} onComplete={vi.fn()} />);
    await upload();
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    expect(await screen.findByText('No matching record.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/I reviewed/));
    expect(screen.getByRole('button', { name: 'Apply 0 record changes' })).toBeDisabled();
  });
});
