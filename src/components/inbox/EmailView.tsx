import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
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

export const EmailView: React.FC<EmailViewProps> = ({ email, onReply, onDelete, onArchive }) => {
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

  const attachments = (email.attachments as any[]) || [];

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <Box sx={{ p: 3, pb: 2 }}>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          {email.subject}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {email.from_name || email.from_address}
            </Typography>
            {email.from_name && (
              <Typography variant="caption" color="text.secondary">
                &lt;{email.from_address}&gt;
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" display="block">
              To: {email.to_address}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {format(new Date(email.email_date), 'PPp')}
          </Typography>
        </Box>
      </Box>

      {/* Actions */}
      <Box sx={{ px: 3, pb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
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
      </Box>

      <Divider />

      {/* Body - HTML is sanitized with DOMPurify before rendering */}
      <Box sx={{ p: 3 }}>
        {sanitizedHtml ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {email.body_text || '(No content)'}
          </Typography>
        )}
      </Box>

      {/* Attachments */}
      {attachments.length > 0 && (
        <>
          <Divider />
          <Box sx={{ p: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Attachments ({attachments.length})
            </Typography>
            <div className="space-y-1">
              {attachments.map((att, idx) => (
                <Box
                  key={idx}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                  }}
                >
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                    {att.filename || 'attachment'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {att.size_bytes ? `${Math.round(att.size_bytes / 1024)}KB` : ''}
                  </Typography>
                </Box>
              ))}
            </div>
          </Box>
        </>
      )}
    </Card>
  );
};
