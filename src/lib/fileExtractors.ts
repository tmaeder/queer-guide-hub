/**
 * fileExtractors — lightweight, dependency-free surface for flyer scan:
 * the accept-check + size/copy constants used eagerly by the upload UI.
 *
 * The heavy extraction pipeline (which lazy-imports `pdfjs-dist` + `mammoth`)
 * lives in `./extractFileContent`. Keeping them in separate modules stops the
 * pdf/docx chunks from leaking onto the critical path of every page — only
 * the flyer-scan flow imports the heavy module.
 */

import { MAX_UPLOAD_BYTES } from './uploadErrors';

export interface ExtractedContent {
  mode: 'image' | 'text';
  text?: string;
  imageBlob?: Blob;
  fileName: string;
}

export const MAX_FILE_SIZE_BYTES = MAX_UPLOAD_BYTES;
export const SUPPORTED_FILES_COPY =
  'Supported files are images, PDFs, DOC, DOCX, and TXT.';

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const ACCEPTED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  '.pdf',
  '.docx',
  '.doc',
  '.txt',
];

export function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return true;
  if (file.type === 'application/pdf') return true;
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return true;
  if (file.type === 'text/plain') return true;

  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
  return ACCEPTED_EXTENSIONS.includes(ext);
}
