import React from 'react';
import DOMPurify from 'dompurify';

// Initialize DOMPurify hooks once per module to harden link handling
let sanitizerHooksInitialized = false;
function ensureSanitizerHooks() {
  if (sanitizerHooksInitialized) return;

  DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
    // Harden <a> tags
    if (node.nodeName && node.nodeName.toLowerCase() === 'a') {
      const href = node.getAttribute('href') || '';

      // Strip dangerous protocols
      if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href)) {
        node.removeAttribute('href');
      }

      const target = node.getAttribute('target');
      if (target === '_blank') {
        // Enforce safe rel attributes for new windows
        node.setAttribute('rel', 'noopener noreferrer nofollow ugc');
      } else if (target) {
        // Disallow other target values
        node.removeAttribute('target');
      }
    }
  });

  sanitizerHooksInitialized = true;
}

interface ContentSanitizerProps {
  content: string;
  className?: string;
  allowedTags?: string[];
  allowedAttrs?: string[];
}

export function ContentSanitizer({ 
  content, 
  className = '', 
  allowedTags = ['p', 'br', 'strong', 'em', 'u', 'a'],
  allowedAttrs = ['href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height'] 
}: ContentSanitizerProps) {
  ensureSanitizerHooks();

  const sanitizeContent = (html: string) => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: allowedAttrs,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'iframe'],
      FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'],
      // Allow only HTTPS URLs plus safe schemes and relative links
      ALLOWED_URI_REGEXP: /^(?:(?:https|mailto|tel):|\/|#)/i,
    });
  };

  return (
    <div 
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizeContent(content) }}
    />
  );
}
