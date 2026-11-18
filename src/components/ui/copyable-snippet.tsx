import { useRef, useState } from 'react';

interface CopyableSnippetProps {
  label: string;
  text: string;
  /** Translated strings. The caller owns them so each page keeps its own keys. */
  copyLabel: string;
  copiedLabel: string;
  failedMessage: string;
}

/**
 * A labelled block of text with a Copy button. When the clipboard is refused
 * (some browsers, embedded views), the text is selected instead and the reader
 * is told so: a silent failure leaves them believing it was copied.
 */
export function CopyableSnippet({
  label,
  text,
  copyLabel,
  copiedLabel,
  failedMessage,
}: CopyableSnippetProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const textRef = useRef<HTMLPreElement>(null);
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      const node = textRef.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setStatus('failed');
    }
  };
  return (
    <div className="rounded-element bg-background p-4 shadow-soft">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          className="rounded-badge px-2 py-1 text-2xs font-bold underline"
          onClick={() => void copy()}
        >
          {status === 'copied' ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre ref={textRef} className="m-0 whitespace-pre-wrap wrap-anywhere font-mono text-13">
        {text}
      </pre>
      {status === 'failed' && (
        <p role="alert" className="mt-2 text-13 text-muted-foreground">
          {failedMessage}
        </p>
      )}
    </div>
  );
}
