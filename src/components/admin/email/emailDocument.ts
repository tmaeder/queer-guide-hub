import type { JSONContent } from '@tiptap/core';
import { sanitizeEmailDocument, sanitizeEmailReview, sanitizeLegacyEmail } from '@/lib/sanitize';

export interface EmailVariable {
  name: string;
  description?: string;
}
const MARKER = 'queer-guide-email-blocks:v1:';
const TOKEN = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** A review must not execute template code, navigate or load tracking pixels. */
export function reviewDocument(html: string): string {
  const body = sanitizeEmailReview(html);
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"></head><body>${body}</body></html>`;
}

export function tokensIn(value: string): string[] {
  return [...new Set(Array.from(value.matchAll(TOKEN), (match) => match[1]))];
}

export function missingTokens(original: string, next: string): string[] {
  const present = new Set(tokensIn(next));
  return tokensIn(original).filter((name) => !present.has(name));
}

/** HTML-to-text capitalizes headings; template variable names are case-sensitive. */
export function preservePlainTextVariables(text: string, html: string): string {
  const names = tokensIn(html);
  return text.replace(TOKEN, (token, name: string) => {
    const original =
      names.find((candidate) => candidate === name) ??
      names.find((candidate) => candidate.toUpperCase() === name);
    return original ? `{{${original}}}` : token;
  });
}

export function readBlockDocument(html: string): JSONContent | null {
  const encoded = html.match(/<!--queer-guide-email-blocks:v1:([A-Za-z0-9+/=]+)-->/)?.[1];
  if (!encoded || encoded.length > 2_000_000) return null;
  try {
    const json = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))),
    );
    return json?.type === 'doc' && Array.isArray(json.content) ? json : null;
  } catch {
    return null;
  }
}

/** Keep structured content beside the deliverable HTML without changing the send API. */
export function storeBlockDocument(html: string, json: JSONContent): string {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `<!--${MARKER}${btoa(binary)}-->\n${emailBody(html)}`;
}

/** The sender already wraps the body in the shared brand shell. */
export function emailBody(html: string): string {
  const clean = sanitizeEmailDocument(html);
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  return (
    Array.from(doc.head.querySelectorAll('style'), (style) => style.outerHTML).join('') +
    doc.body.innerHTML
  );
}

export function prepareLegacyHtml(html: string): string {
  const clean = sanitizeLegacyEmail(html);
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const value = node.textContent ?? '';
    const matches = Array.from(value.matchAll(TOKEN));
    if (!matches.length) continue;
    const fragment = doc.createDocumentFragment();
    let offset = 0;
    for (const match of matches) {
      fragment.append(value.slice(offset, match.index));
      const token = doc.createElement('span');
      token.dataset.emailVariable = match[1];
      token.textContent = `{{${match[1]}}}`;
      fragment.append(token);
      offset = match.index! + match[0].length;
    }
    fragment.append(value.slice(offset));
    node.replaceWith(fragment);
  }
  return doc.body.innerHTML;
}

export function renderSample(value: string, data: Record<string, string>, html = false): string {
  return value.replace(TOKEN, (token, name: string) => {
    if (!data[name]) return token;
    return html
      ? data[name].replace(
          /[&<>"']/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
        )
      : data[name];
  });
}

export function normalizeVariables(value: unknown): EmailVariable[] {
  return Array.isArray(value)
    ? value.filter((v): v is EmailVariable => !!v && typeof v.name === 'string')
    : [];
}
