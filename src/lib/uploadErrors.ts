/**
 * uploadErrors — Normalizes flyer upload / scan / analyze failures into a
 * small set of user-facing categories. All UI copy flows through i18n keys;
 * the raw `technical` message is kept only for logs.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

export type UploadErrorCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'UNREADABLE_FILE'
  | 'EXTRACTION_EMPTY'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'UPLOAD_FAILED';

export type UploadErrorPhase = 'validate' | 'extract' | 'upload' | 'analyze';

export interface UploadError {
  code: UploadErrorCode;
  i18nKey: string;
  i18nValues?: Record<string, string | number>;
  technical: string;
  allowManualFallback: boolean;
  retryable: boolean;
}

const I18N_KEYS: Record<UploadErrorCode, string> = {
  FILE_TOO_LARGE: 'submission.errors.fileTooLarge',
  UNSUPPORTED_TYPE: 'submission.errors.unsupportedType',
  UNREADABLE_FILE: 'submission.errors.unreadableFile',
  EXTRACTION_EMPTY: 'submission.errors.extractionEmpty',
  RATE_LIMITED: 'submission.errors.rateLimited',
  NETWORK_ERROR: 'submission.errors.networkError',
  SERVER_ERROR: 'submission.errors.serverError',
  UPLOAD_FAILED: 'submission.errors.uploadFailed',
};

// Categories where retrying the same file won't help.
const NON_RETRYABLE: UploadErrorCode[] = ['FILE_TOO_LARGE', 'UNSUPPORTED_TYPE'];

// Categories where the scan failed but the user can still fill the form.
const MANUAL_FALLBACK: UploadErrorCode[] = [
  'EXTRACTION_EMPTY',
  'UNREADABLE_FILE',
  'SERVER_ERROR',
  'RATE_LIMITED',
];

export function makeUploadError(
  code: UploadErrorCode,
  technical: string,
  values?: Record<string, string | number>,
): UploadError {
  return {
    code,
    i18nKey: I18N_KEYS[code],
    i18nValues: code === 'FILE_TOO_LARGE' ? { maxMb: MAX_UPLOAD_MB, ...values } : values,
    technical,
    allowManualFallback: MANUAL_FALLBACK.includes(code),
    retryable: !NON_RETRYABLE.includes(code),
  };
}

export class UploadErrorException extends Error {
  readonly uploadError: UploadError;
  constructor(error: UploadError) {
    super(error.technical);
    this.name = 'UploadErrorException';
    this.uploadError = error;
  }
}

interface Classifiable {
  message?: string;
  status?: number;
  statusCode?: number;
  name?: string;
  code?: string;
}

function asObj(x: unknown): Classifiable {
  return (x && typeof x === 'object' ? (x as Classifiable) : {}) as Classifiable;
}

function messageOf(x: unknown): string {
  if (x instanceof Error) return x.message;
  if (typeof x === 'string') return x;
  const o = asObj(x);
  return o.message || '';
}

/**
 * Normalize any thrown error from the upload / scan pipeline into a UploadError.
 * Pass `phase` so catch-all cases map to the most meaningful default.
 */
export function toUploadError(input: unknown, ctx?: { phase?: UploadErrorPhase }): UploadError {
  if (input instanceof UploadErrorException) return input.uploadError;

  const phase = ctx?.phase;
  const raw = asObj(input);
  const msg = messageOf(input);
  const status = raw.status ?? raw.statusCode;
  const lower = msg.toLowerCase();

  if (status === 429 || /rate limit|too many requests|scan limit/i.test(msg)) {
    return makeUploadError('RATE_LIMITED', msg || 'rate limited');
  }

  if (status === 413 || /too large|file size|payload too large/i.test(msg)) {
    return makeUploadError('FILE_TOO_LARGE', msg || 'file too large');
  }

  if (/unsupported|not accepted|invalid file type/i.test(msg)) {
    return makeUploadError('UNSUPPORTED_TYPE', msg || 'unsupported type');
  }

  const isFetchTypeError = raw.name === 'TypeError' && /fetch|network|failed to fetch/i.test(lower);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline || isFetchTypeError || /network|offline|timeout|timed out/i.test(lower)) {
    return makeUploadError('NETWORK_ERROR', msg || 'network error');
  }

  if (typeof status === 'number' && status >= 500) {
    return makeUploadError('SERVER_ERROR', msg || `server error ${status}`);
  }

  if (phase === 'extract') {
    return makeUploadError('UNREADABLE_FILE', msg || 'unreadable file');
  }

  if (phase === 'upload') {
    return makeUploadError('UPLOAD_FAILED', msg || 'upload failed');
  }

  if (phase === 'analyze') {
    return makeUploadError('SERVER_ERROR', msg || 'analyze failed');
  }

  return makeUploadError('UPLOAD_FAILED', msg || 'upload failed');
}

/** Client-side validation before extraction begins. */
export function validateFile(file: File, accepted: (f: File) => boolean): UploadError | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return makeUploadError('FILE_TOO_LARGE', `file ${file.name} is ${file.size} bytes`);
  }
  if (!accepted(file)) {
    return makeUploadError('UNSUPPORTED_TYPE', `file ${file.name} has unsupported type ${file.type}`);
  }
  return null;
}

/** Log the technical detail without exposing it to the UI. */
export function logUploadError(err: UploadError, context: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console
  console.error('[flyer-scan]', err.technical, { code: err.code, ...context });
}
