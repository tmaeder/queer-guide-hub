import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sanitizeEditableDocument } from '@/lib/sanitize';
import { toR2ImageUrl } from '@/utils/imageHost';

interface Props {
  value: string;
  onChange?: (value: string) => void;
  label: string;
  editable?: boolean;
}

const POLICY =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https:;";

// The iframe inherits the site's img-src (R2 only), so the preview shows each
// image's R2 copy. The original address is kept on the element and restored
// on save, so the stored (and sent) email is unchanged.
const ORIGINAL_SRC = 'data-qg-original-src';

function previewDocument(value: string): string {
  const clean = sanitizeEditableDocument(value, true);
  const document = new DOMParser().parseFromString(clean, 'text/html');
  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = POLICY;
  document.head.prepend(policy);
  for (const img of document.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src')!;
    const r2 = toR2ImageUrl(src);
    if (r2 !== src) {
      img.setAttribute(ORIGINAL_SRC, src);
      img.setAttribute('src', r2);
    }
  }
  return '<!DOCTYPE html>' + document.documentElement.outerHTML;
}

/** Rendered email editing preserves tables, inline styling, variables, and the document head. */
export function HtmlDocumentEditor({ value, onChange, label, editable = true }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const change = useRef(onChange);
  useLayoutEffect(() => {
    change.current = onChange;
  }, [onChange]);
  const [source, setSource] = useState(() => previewDocument(value));
  useEffect(() => {
    if (value !== lastEmitted.current) setSource(previewDocument(value));
  }, [value]);

  const connect = () => {
    const document = frame.current?.contentDocument;
    if (!document) return;
    const body = document.body;
    body.contentEditable = editable ? 'true' : 'false';
    body.setAttribute('aria-label', label);
    body.addEventListener('click', (event) => {
      if ((event.target as Element).closest('a')) event.preventDefault();
    });
    body.addEventListener('input', () => {
      const copy = document.documentElement.cloneNode(true) as HTMLElement;
      copy.querySelector('meta[http-equiv="Content-Security-Policy"]')?.remove();
      // Restore originals by renaming the attribute in the serialized markup, so
      // editor DOM text is never written back into a live `src`.
      for (const img of copy.querySelectorAll(`img[${ORIGINAL_SRC}]`)) img.removeAttribute('src');
      const copiedBody = copy.querySelector('body')!;
      copiedBody.removeAttribute('contenteditable');
      copiedBody.removeAttribute('aria-label');
      const next = (
        /<!doctype|<(?:html|head|body)[\s>]/i.test(value)
          ? '<!DOCTYPE html>' + copy.outerHTML
          : copiedBody.innerHTML
      ).replaceAll(` ${ORIGINAL_SRC}="`, ' src="');
      const sanitized = sanitizeEditableDocument(
        next,
        /<!doctype|<(?:html|head|body)[\s>]/i.test(value),
      );
      lastEmitted.current = sanitized;
      change.current?.(sanitized);
    });
  };

  return (
    <div className="min-w-0 rounded-element bg-card">
      {editable && (
        <p className="mb-2 text-13 text-muted-foreground">
          Edit the text directly in the email preview. Template variables stay in place.
        </p>
      )}
      <iframe
        ref={frame}
        title={label}
        srcDoc={source}
        sandbox="allow-same-origin"
        onLoad={connect}
        className="h-96 w-full rounded-element bg-card"
      />
    </div>
  );
}
