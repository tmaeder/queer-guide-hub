import { useRef, useEffect, useMemo } from 'react';

interface TagWikiContentProps {
  html: string;
  onHeadingsExtracted?: (headings: { id: string; text: string; level: number }[]) => void;
}

/**
 * Renders tag long_description as rich HTML with heading anchors for TOC linking.
 * Content is sanitized on the server (Tiptap output); we inject `id` attributes
 * on h2/h3 elements so the TOC sidebar can scroll-to them.
 */
export function TagWikiContent({ html, onHeadingsExtracted }: TagWikiContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  const processed = useMemo(() => {
    let idx = 0;
    return html.replace(/<(h[23])[^>]*>(.*?)<\/\1>/gi, (_match, tag, inner) => {
      const id = `section-${idx++}`;
      return `<${tag} id="${id}">${inner}</${tag}>`;
    });
  }, [html]);

  useEffect(() => {
    if (!ref.current || !onHeadingsExtracted) return;
    const els = ref.current.querySelectorAll('h2, h3');
    const headings = Array.from(els).map((el) => ({
      id: el.id,
      text: el.textContent?.trim() ?? '',
      level: el.tagName === 'H2' ? 2 : 3,
    }));
    onHeadingsExtracted(headings);
  }, [processed, onHeadingsExtracted]);

  return (
    <div
      ref={ref}
      className="tag-wiki-content text-muted-foreground flex flex-col gap-4 [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:text-foreground [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 [&_a]:underline [&_a]:text-foreground [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground"
      style={{ lineHeight: 1.7, maxWidth: 680, fontSize: '0.9rem' }}
      dangerouslySetInnerHTML={{ __html: processed }}
    />
  );
}
