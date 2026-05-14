import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlyerScanUpload } from '../FlyerScanUpload';

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn(), toasts: [] }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const copy: Record<string, string> = {
        'submission.errors.title': 'Scan failed',
        'submission.errors.unsupportedType':
          "We can't read this file type. Please upload an image, PDF, DOC, DOCX, or TXT file.",
        'submission.errors.fileTooLarge':
          'This file is too large. Maximum allowed size is {{maxMb}} MB.',
        'submission.errors.unsupportedTypeNamed':
          "{{names}} wasn't uploaded. Supported files are images, PDFs, DOC, DOCX, and TXT.",
        'submission.errors.fileTooLargeNamed':
          "{{names}} wasn't uploaded. Maximum file size is {{maxMb}} MB.",
        'submission.errors.retry': 'Retry',
        'submission.errors.uploadFailed': 'Upload failed.',
      };
      let out = copy[key] ?? key;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          out = out.replace(`{{${k}}}`, String(v));
        }
      }
      return out;
    },
  }),
}));

function makeFile(name: string, type: string, size = 100): File {
  const file = new File(['x'], name, { type });
  if (size !== 100) {
    Object.defineProperty(file, 'size', { value: size });
  }
  return file;
}

function renderIdle(onFilesSelected = vi.fn()) {
  render(
    <FlyerScanUpload
      scanState="idle"
      error={null}
      currentFileIndex={0}
      totalFiles={0}
      onFilesSelected={onFilesSelected}
      onReset={vi.fn()}
    />,
  );
  return { onFilesSelected };
}

function getFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error('file input not found');
  return input as HTMLInputElement;
}

function makeFileList(files: File[]): FileList {
  const list = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    [Symbol.iterator]: function* () {
      for (const f of files) yield f;
    },
  } as unknown as FileList;
  files.forEach((f, i) => {
    (list as unknown as Record<number, File>)[i] = f;
  });
  return list;
}

function fireChange(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: makeFileList(files), configurable: true });
  fireEvent.change(input);
}

describe('FlyerScanUpload — rejection feedback', () => {
  beforeEach(() => {
    toastMock.mockClear();
  });

  it('rejects a single unsupported file with inline + toast feedback', () => {
    const { onFilesSelected } = renderIdle();
    fireChange(getFileInput(), [makeFile('fake.exe', 'application/octet-stream')]);

    expect(onFilesSelected).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('fake.exe');
    expect(alert.textContent).toContain("wasn't uploaded");
    expect(alert.textContent).toContain('Supported files are images, PDFs, DOC, DOCX, and TXT.');
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
  });

  it('passes accepted files through when selection is mixed', () => {
    const { onFilesSelected } = renderIdle();
    const pdf = makeFile('flyer.pdf', 'application/pdf');
    const exe = makeFile('fake.exe', 'application/octet-stream');
    fireChange(getFileInput(), [pdf, exe]);

    expect(onFilesSelected).toHaveBeenCalledTimes(1);
    expect(onFilesSelected.mock.calls[0][0]).toEqual([pdf]);
    expect(screen.getByRole('alert').textContent).toContain('fake.exe');
  });

  it('shows no error and forwards files when all are supported', () => {
    const { onFilesSelected } = renderIdle();
    fireChange(getFileInput(), [makeFile('photo.jpg', 'image/jpeg')]);

    expect(onFilesSelected).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('rejects oversized files with size-specific copy', () => {
    const { onFilesSelected } = renderIdle();
    const big = makeFile('big.pdf', 'application/pdf', 25 * 1024 * 1024);
    fireChange(getFileInput(), [big]);

    expect(onFilesSelected).not.toHaveBeenCalled();
    const text = screen.getByRole('alert').textContent ?? '';
    expect(text).toContain('big.pdf');
    expect(text).toContain('Maximum file size is 20 MB');
  });

  it('applies the same validation via drag-and-drop', () => {
    const { onFilesSelected } = renderIdle();
    const exe = makeFile('virus.exe', 'application/octet-stream');

    const dropTarget = getFileInput().closest('div')?.parentElement as HTMLElement;
    expect(dropTarget).toBeTruthy();
    fireEvent.drop(dropTarget, {
      dataTransfer: { files: [exe], items: [], types: [] },
    });

    expect(onFilesSelected).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('virus.exe');
    expect(toastMock).toHaveBeenCalled();
  });
});
