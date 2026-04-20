/**
 * fileExtractors — Client-side content extraction for flyer scan.
 * Determines whether a file should use the image or text pipeline
 * and extracts content accordingly.
 */

import { UploadErrorException, makeUploadError, MAX_UPLOAD_BYTES } from './uploadErrors';

export interface ExtractedContent {
  mode: 'image' | 'text';
  text?: string;
  imageBlob?: Blob;
  fileName: string;
}

const unreadable = (reason: string) =>
  new UploadErrorException(makeUploadError('UNREADABLE_FILE', reason));
const unsupported = (reason: string) =>
  new UploadErrorException(makeUploadError('UNSUPPORTED_TYPE', reason));
const tooLarge = (reason: string) =>
  new UploadErrorException(makeUploadError('FILE_TOO_LARGE', reason));

const MAX_PDF_PAGES = 10;
const MIN_TEXT_LENGTH = 50;
const MAX_IMAGE_DIM = 1024;
const JPEG_QUALITY = 0.85;

// ── Image resize ──────────────────────────────────────────────────────

function resizeImage(file: File | Blob, maxDim: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(unreadable('Canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(unreadable('Canvas resize failed'))),
        'image/jpeg',
        JPEG_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(unreadable('Failed to load image'));
    };
    img.src = url;
  });
}

// ── PDF extraction (lazy-loaded) ──────────────────────────────────────

async function extractPdf(file: File): Promise<ExtractedContent> {
  const pdfjsLib = await import('pdfjs-dist');

  // Configure worker — use bundled worker via CDN for reliability
  const version = pdfjsLib.version;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);

  // Try text extraction first
  const textParts: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: { str?: string }) => (item.str || ''))
      .join(' ')
      .trim();
    if (pageText) textParts.push(pageText);
  }

  const fullText = textParts.join('\n\n');

  if (fullText.length >= MIN_TEXT_LENGTH) {
    return { mode: 'text', text: fullText, fileName: file.name };
  }

  // Scanned PDF — render first page to image
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(MAX_IMAGE_DIM / viewport.width, MAX_IMAGE_DIM / viewport.height, 1);
  const scaledViewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scaledViewport.width);
  canvas.height = Math.round(scaledViewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw unreadable('Canvas 2D context unavailable');

  await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(unreadable('PDF page render failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });

  return { mode: 'image', imageBlob: blob, fileName: file.name };
}

// ── DOCX extraction (lazy-loaded) ─────────────────────────────────────

async function extractDocx(file: File): Promise<ExtractedContent> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value.trim();

  if (text.length < MIN_TEXT_LENGTH) {
    throw unreadable('Could not extract enough text from this document');
  }

  return { mode: 'text', text, fileName: file.name };
}

// ── Plain text extraction ─────────────────────────────────────────────

function extractText(file: File): Promise<ExtractedContent> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = (reader.result as string).trim();
      if (text.length < MIN_TEXT_LENGTH) {
        reject(unreadable('File contains too little text'));
        return;
      }
      resolve({ mode: 'text', text, fileName: file.name });
    };
    reader.onerror = () => reject(unreadable('Failed to read text file'));
    reader.readAsText(file);
  });
}

// ── Public API ────────────────────────────────────────────────────────

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

export async function extractFileContent(file: File): Promise<ExtractedContent> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw tooLarge(`file ${file.name} is ${file.size} bytes`);
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  // Image files
  if (
    file.type.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)
  ) {
    const blob = await resizeImage(file, MAX_IMAGE_DIM);
    return { mode: 'image', imageBlob: blob, fileName: file.name };
  }

  // PDF
  if (file.type === 'application/pdf' || ext === 'pdf') {
    return extractPdf(file);
  }

  // DOCX
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx' ||
    ext === 'doc'
  ) {
    return extractDocx(file);
  }

  // Plain text
  if (file.type === 'text/plain' || ext === 'txt') {
    return extractText(file);
  }

  throw unsupported(`Unsupported file format: .${ext}`);
}
