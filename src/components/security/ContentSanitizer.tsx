import React from 'react';
import DOMPurify from 'dompurify';

interface ContentSanitizerProps {
  content: string;
  className?: string;
  allowedTags?: string[];
}

export function ContentSanitizer({ 
  content, 
  className = '', 
  allowedTags = ['p', 'br', 'strong', 'em', 'u', 'a'] 
}: ContentSanitizerProps) {
  const sanitizeContent = (html: string) => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input'],
      FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur']
    });
  };

  return (
    <div 
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizeContent(content) }}
    />
  );
}