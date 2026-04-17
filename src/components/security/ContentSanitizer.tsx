import DOMPurify from 'dompurify';
import Box from '@mui/material/Box';

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
  sx?: Record<string, unknown>;
  allowedTags?: string[];
  allowedAttrs?: string[];
  stripAll?: boolean; // Enhanced security option to strip all HTML
}

export function ContentSanitizer({
  content,
  sx,
  allowedTags = ['p', 'br', 'strong', 'em', 'u'],
  allowedAttrs = ['class', 'id', 'title'],
  stripAll = false
}: ContentSanitizerProps) {
  ensureSanitizerHooks();

  const sanitizeContent = (html: string) => {
    // Enhanced security: option to strip all HTML
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
      // Stricter URL validation - HTTPS only for external links
      ALLOWED_URI_REGEXP: /^(?:https:|\/|#)/i,
      // Remove unknown protocols and javascript: URLs
      SANITIZE_DOM: true,
      SANITIZE_NAMED_PROPS: true,
      KEEP_CONTENT: false, // Don't keep content of forbidden elements
    });
  };

  // Security improvement: avoid dangerouslySetInnerHTML when possible
  const sanitizedContent = sanitizeContent(content);

  // If content is just text (no HTML), render as text
  if (sanitizedContent === content && !content.includes('<')) {
    return <Box sx={sx}>{content}</Box>;
  }

  return (
    <Box
      sx={sx}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}
