import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A labelled block of text with a Copy button. When the clipboard is refused
 * (some browsers, embedded views), the text is selected instead and the reader
 * is told so: a silent failure leaves them believing it was copied.
 */
export function CopyableSnippet({ label, text }: { label: string; text: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const textRef = useRef<HTMLPreElement>(null);
  // Name = button text + this snippet's label ("Copy LGBTQ+ rights by country"),
  // so six "Copy" buttons are distinguishable and the name still starts with
  // the visible text (WCAG 2.5.3).
  const actionId = useId();
  const labelId = useId();
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
        <span
          id={labelId}
          className="text-2xs font-bold uppercase tracking-label text-muted-foreground"
        >
          {label}
        </span>
        <button
          type="button"
          className="rounded-badge px-2 py-1 text-2xs font-bold underline"
          aria-labelledby={`${actionId} ${labelId}`}
          onClick={() => void copy()}
        >
          <span id={actionId}>
            {status === 'copied'
              ? t('press.linkToUs.copied', 'Copied')
              : t('press.linkToUs.copy', 'Copy')}
          </span>
        </button>
      </div>
      <pre
        ref={textRef}
        className="m-0 overflow-x-auto whitespace-pre-wrap break-all font-mono text-13"
      >
        {text}
      </pre>
      {status === 'failed' && (
        <p role="alert" className="mt-2 text-13 text-muted-foreground">
          {t(
            'press.linkToUs.copyFailed',
            'Could not copy automatically. The text is selected; copy it with your keyboard.',
          )}
        </p>
      )}
    </div>
  );
}
