import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Reply, Trash2, Archive, Download } from 'lucide-react';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';
import type { MailboxEmail } from '@/hooks/useMailbox';

interface EmailViewProps {
  email: MailboxEmail;
  onReply?: (email: MailboxEmail) => void;
  onDelete?: (id: string) => void;
  onArchive?: (id: string) => void;
}

export const EmailView = ({ email, onReply, onDelete, onArchive }) => {
  const sanitizedHtml = email.body_html
    ? DOMPurify.sanitize(email.body_html, {
        ALLOWED_TAGS: [
          'p',
          'br',
          'strong',
          'b',
          'em',
          'i',
          'u',
          'a',
          'ul',
          'ol',
          'li',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'blockquote',
          'pre',
          'code',
          'img',
          'table',
          'thead',
          'tbody',
          'tr',
          'th',
          'td',
          'div',
          'span',
          'hr',
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'class', 'target', 'rel'],
      })
    : null;

  const attachments = (email.attachments as Array<{ name: string; url: string; size?: number }>) || [];

  return (
    <Card className="overflow-hidden">
      <div className="p-6 pb-4">
        <h6 className="text-base font-bold mb-2">{email.subject}</h6>
        <div className="flex justify-between items-start flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold">
              {email.from_name || email.from_address}
            </p>
            {email.from_name && (
              <span className="text-xs text-muted-foreground">
                &lt;{email.from_address}&gt;
              </span>
            )}
            <span className="text-xs text-muted-foreground block">
              To: {email.to_address}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {format(new Date(email.email_date), 'PPp')}
          </span>
        </div>
      </div>

      <div className="px-6 pb-4 flex gap-2 flex-wrap">
        {onReply && (
          <Button variant="outline" size="sm" onClick={() => onReply(email)}>
            <Reply className="h-4 w-4 mr-1" /> Reply
          </Button>
        )}
        {onArchive && (
          <Button variant="outline" size="sm" onClick={() => onArchive(email.id)}>
            <Archive className="h-4 w-4 mr-1" /> Archive
          </Button>
        )}
        {onDelete && (
          <Button variant="outline" size="sm" onClick={() => onDelete(email.id)}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        )}
      </div>

      <hr className="border-border" />

      <div className="p-6">
        {sanitizedHtml ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap">
            {email.body_text || '(No content)'}
          </p>
        )}
      </div>

      {attachments.length > 0 && (
        <>
          <hr className="border-border" />
          <div className="p-6">
            <p className="text-sm font-medium mb-2">Attachments ({attachments.length})</p>
            <div className="space-y-1">
              {attachments.map((att, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-muted">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm truncate flex-1">
                    {att.filename || 'attachment'}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {att.size_bytes ? `${Math.round(att.size_bytes / 1024)}KB` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
};
