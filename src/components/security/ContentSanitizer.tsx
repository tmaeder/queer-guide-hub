import * as React from 'react';
import { sanitizeToText, sanitizeUserContent } from '@/lib/sanitize';

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
  const sanitizedContent = stripAll
    ? sanitizeToText(content)
    : sanitizeUserContent(content, allowedTags, allowedAttrs);

  if (sanitizedContent === content && !content.includes('<')) {
    return (
      <div className={className} style={style}>
        {content}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}
