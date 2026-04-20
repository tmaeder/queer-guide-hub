import { describe, it, expect } from 'vitest';
import {
  toUploadError,
  makeUploadError,
  validateFile,
  UploadErrorException,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
} from '../uploadErrors';

function makeFile(name: string, size: number, type = 'image/png'): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size, configurable: true });
  return f;
}

const accept = (f: File) => f.type.startsWith('image/');

describe('validateFile', () => {
  it('accepts a file under the limit', () => {
    expect(validateFile(makeFile('ok.png', 5 * 1024 * 1024), accept)).toBeNull();
  });

  it('accepts a file exactly at the limit', () => {
    expect(validateFile(makeFile('boundary.png', MAX_UPLOAD_BYTES), accept)).toBeNull();
  });

  it('rejects a file one byte over the limit', () => {
    const err = validateFile(makeFile('over.png', MAX_UPLOAD_BYTES + 1), accept);
    expect(err?.code).toBe('FILE_TOO_LARGE');
    expect(err?.i18nKey).toBe('submission.errors.fileTooLarge');
    expect(err?.i18nValues?.maxMb).toBe(MAX_UPLOAD_MB);
    expect(err?.retryable).toBe(false);
  });

  it('checks size before type', () => {
    const err = validateFile(
      makeFile('huge.zip', MAX_UPLOAD_BYTES + 1024, 'application/zip'),
      accept,
    );
    expect(err?.code).toBe('FILE_TOO_LARGE');
  });

  it('flags unsupported type when size is ok', () => {
    const err = validateFile(makeFile('doc.zip', 1024, 'application/zip'), accept);
    expect(err?.code).toBe('UNSUPPORTED_TYPE');
    expect(err?.retryable).toBe(false);
  });
});

describe('toUploadError', () => {
  it('unwraps UploadErrorException transparently', () => {
    const original = makeUploadError('UNREADABLE_FILE', 'bad image');
    expect(toUploadError(new UploadErrorException(original)).code).toBe('UNREADABLE_FILE');
  });

  it('maps status 429 to RATE_LIMITED', () => {
    expect(toUploadError({ status: 429, message: 'too many' }).code).toBe('RATE_LIMITED');
  });

  it('maps "Rate limit" message to RATE_LIMITED', () => {
    expect(toUploadError(new Error('Rate limit exceeded')).code).toBe('RATE_LIMITED');
  });

  it('maps status 413 / "too large" to FILE_TOO_LARGE', () => {
    expect(toUploadError({ status: 413, message: 'payload too large' }).code).toBe(
      'FILE_TOO_LARGE',
    );
  });

  it('maps fetch TypeError to NETWORK_ERROR', () => {
    expect(toUploadError(new TypeError('Failed to fetch')).code).toBe('NETWORK_ERROR');
  });

  it('maps 5xx status to SERVER_ERROR', () => {
    expect(toUploadError({ status: 500, message: 'boom' }).code).toBe('SERVER_ERROR');
    expect(toUploadError({ status: 503, message: 'nope' }).code).toBe('SERVER_ERROR');
  });

  it('defaults to UNREADABLE_FILE in extract phase', () => {
    expect(toUploadError(new Error('canvas broke'), { phase: 'extract' }).code).toBe(
      'UNREADABLE_FILE',
    );
  });

  it('defaults to UPLOAD_FAILED in upload phase', () => {
    expect(toUploadError({ message: 'storage error' }, { phase: 'upload' }).code).toBe(
      'UPLOAD_FAILED',
    );
  });

  it('defaults to SERVER_ERROR in analyze phase when no other signal', () => {
    expect(toUploadError({ message: 'something' }, { phase: 'analyze' }).code).toBe('SERVER_ERROR');
  });

  it('keeps technical detail separate from i18n key', () => {
    const e = toUploadError(new Error('stack trace goes here'), { phase: 'analyze' });
    expect(e.technical).toBe('stack trace goes here');
    expect(e.i18nKey.startsWith('submission.errors.')).toBe(true);
  });
});

describe('makeUploadError semantics', () => {
  it('flags manual fallback categories correctly', () => {
    expect(makeUploadError('EXTRACTION_EMPTY', 'no items').allowManualFallback).toBe(true);
    expect(makeUploadError('UNREADABLE_FILE', 'bad').allowManualFallback).toBe(true);
    expect(makeUploadError('FILE_TOO_LARGE', 'big').allowManualFallback).toBe(false);
  });

  it('marks unsupported/too-large as non-retryable', () => {
    expect(makeUploadError('FILE_TOO_LARGE', 'big').retryable).toBe(false);
    expect(makeUploadError('UNSUPPORTED_TYPE', 'zip').retryable).toBe(false);
    expect(makeUploadError('NETWORK_ERROR', 'offline').retryable).toBe(true);
  });
});
