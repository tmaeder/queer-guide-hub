import DOMPurify from 'dompurify';
import * as React from 'react';

let sanitizerHooksInitialized = false;
function ensureSanitizerHooks() {
  if (sanitizerHooksInitialized) return;

  DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.nodeName && node.nodeName.toLowerCase() === 'a') {
      const href = node.getAttribute('href') || '';
      if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href)) {
        node.removeAttribute('href');
      }
      const target = node.getAttribute('target');
      if (target === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer nofollow ugc');
      } else if (target) {
        node.removeAttribute('target');
      }
    }
  });

  sanitizerHooksInitialized = true;
}

interface ContentSanitizerProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  allowedTags?: string[];
  allowedAttrs?: string[];
  stripAll?: boolean;
}

export function ContentSanitizer({
  content,
  className,
  style,
  allowedTags = ['p', 'br', 'strong', 'em', 'u'],
  allowedAttrs = ['class', 'id', 'title'],
  stripAll = false,
}: ContentSanitizerProps) {
  ensureSanitizerHooks();

  const sanitizeContent = (html: string) => {
    if (stripAll) {
      return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }

    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: allowedAttrs,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'iframe', 'style'],
      FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur', 'style'],
      ALLOWED_URI_REGEXP: /^(?:https:|\/|#)/i,
      SANITIZE_DOM: true,
      SANITIZE_NAMED_PROPS: true,
      KEEP_CONTENT: false,
    });
  };

  const sanitizedContent = sanitizeContent(content);

  if (sanitizedContent === content && !content.includes('<')) {
    return <div className={className} style={style}>{content}</div>;
  }

  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}
