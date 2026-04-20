import { describe, it, expect } from 'vitest';
import { isAcceptedFile, extractFileContent, MAX_FILE_SIZE_BYTES } from '../fileExtractors';
import { UploadErrorException } from '../uploadErrors';

// extractFileContent and internal functions need Canvas/PDF/mammoth — tested via integration.
// Test the synchronous guard function here.

function makeFile(name: string, type: string, _size: number = 100): File {
  return new File(['x'], name, { type });
}

describe('isAcceptedFile', () => {
  it('should accept JPEG', () => {
    expect(isAcceptedFile(makeFile('photo.jpg', 'image/jpeg'))).toBe(true);
  });

  it('should accept PNG', () => {
    expect(isAcceptedFile(makeFile('photo.png', 'image/png'))).toBe(true);
  });

  it('should accept WebP', () => {
    expect(isAcceptedFile(makeFile('photo.webp', 'image/webp'))).toBe(true);
  });

  it('should accept HEIC', () => {
    expect(isAcceptedFile(makeFile('photo.heic', 'image/heic'))).toBe(true);
  });

  it('should accept PDF', () => {
    expect(isAcceptedFile(makeFile('doc.pdf', 'application/pdf'))).toBe(true);
  });

  it('should accept DOCX', () => {
    expect(isAcceptedFile(makeFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe(true);
  });

  it('should accept plain text', () => {
    expect(isAcceptedFile(makeFile('notes.txt', 'text/plain'))).toBe(true);
  });

  it('should accept by extension when type is empty', () => {
    expect(isAcceptedFile(makeFile('photo.jpeg', ''))).toBe(true);
    expect(isAcceptedFile(makeFile('doc.pdf', ''))).toBe(true);
  });

  it('should reject unsupported types', () => {
    expect(isAcceptedFile(makeFile('video.mp4', 'video/mp4'))).toBe(false);
    expect(isAcceptedFile(makeFile('archive.zip', 'application/zip'))).toBe(false);
  });

  it('should reject executables and scripts by extension', () => {
    expect(isAcceptedFile(makeFile('fake.exe', 'application/octet-stream'))).toBe(false);
    expect(isAcceptedFile(makeFile('run.sh', ''))).toBe(false);
    expect(isAcceptedFile(makeFile('bundle.zip', ''))).toBe(false);
  });
});

describe('extractFileContent — typed errors', () => {
  function sized(name: string, type: string, size: number): File {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  }

  it('throws UploadErrorException with FILE_TOO_LARGE for oversize files', async () => {
    const big = sized('huge.png', 'image/png', MAX_FILE_SIZE_BYTES + 1);
    await expect(extractFileContent(big)).rejects.toMatchObject({
      uploadError: { code: 'FILE_TOO_LARGE' },
    });
    try {
      await extractFileContent(big);
    } catch (e) {
      expect(e).toBeInstanceOf(UploadErrorException);
    }
  });

  it('throws UploadErrorException with UNSUPPORTED_TYPE for unknown extension', async () => {
    const zip = sized('notes.zip', 'application/zip', 100);
    await expect(extractFileContent(zip)).rejects.toMatchObject({
      uploadError: { code: 'UNSUPPORTED_TYPE' },
    });
  });
});
