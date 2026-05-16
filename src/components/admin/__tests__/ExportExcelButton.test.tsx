/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import { ExportExcelButton } from '../ExportExcelButton';

beforeEach(() => {
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

describe('ExportExcelButton', () => {
  it('renders default label', () => {
    render(<ExportExcelButton onExport={async () => {}} />);
    expect(screen.getByRole('button', { name: /Export Excel/i })).toBeInTheDocument();
  });

  it('renders custom label', () => {
    render(<ExportExcelButton onExport={async () => {}} label="Download CSV" />);
    expect(screen.getByRole('button', { name: /Download CSV/i })).toBeInTheDocument();
  });

  it('runs onExport, shows preparing + complete toasts, button disabled while exporting', async () => {
    let resolve!: () => void;
    const onExport = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    render(<ExportExcelButton onExport={onExport} />);

    const btn = screen.getByRole('button');
    fireEvent.click(btn);

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringMatching(/Preparing export/i),
    ));
    expect(btn).toBeDisabled();
    expect(screen.getByText(/Exporting/i)).toBeInTheDocument();

    resolve();
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringMatching(/Export complete/i),
    ));
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('shows error toast on failure and re-enables the button', async () => {
    const onExport = vi.fn().mockRejectedValueOnce(new Error('boom'));
    render(<ExportExcelButton onExport={onExport} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/Export failed/)),
    );
    expect(btn).not.toBeDisabled();
  });
});
