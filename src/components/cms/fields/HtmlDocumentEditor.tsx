import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sanitizeEditableDocument } from '@/lib/sanitize';

interface Props {
  value: string;
  onChange?: (value: string) => void;
  label: string;
  editable?: boolean;
}

const POLICY =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https:;";

function previewDocument(value: string): string {
  const clean = sanitizeEditableDocument(value, true);
  const document = new DOMParser().parseFromString(clean, 'text/html');
  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = POLICY;
  document.head.prepend(policy);
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
      const copiedBody = copy.querySelector('body')!;
      copiedBody.removeAttribute('contenteditable');
      copiedBody.removeAttribute('aria-label');
      const next = /<!doctype|<(?:html|head|body)[\s>]/i.test(value)
        ? '<!DOCTYPE html>' + copy.outerHTML
        : copiedBody.innerHTML;
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
