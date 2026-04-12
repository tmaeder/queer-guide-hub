import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Send, Loader2 } from 'lucide-react';
import { useMailbox } from '@/hooks/useMailbox';
import { useMailboxAddress } from '@/hooks/useMailboxAddress';

interface ComposeEmailProps {
  replyTo?: { id: string; from_address: string; subject: string };
  onSent?: () => void;
  onCancel?: () => void;
}

export const ComposeEmail: React.FC<ComposeEmailProps> = ({ replyTo, onSent, onCancel }) => {
  const { sendEmail, sending } = useMailbox();
  const { fullEmail } = useMailboxAddress();

  const [to, setTo] = useState(replyTo?.from_address || '');
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, '')}` : '',
  );
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    setError(null);
    if (!to.trim()) {
      setError('Recipient is required');
      return;
    }
    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }

    try {
      await sendEmail(to.trim(), subject.trim(), body, replyTo?.id);
      onSent?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    }
  };

  return (
    <Card className="p-4">
      <Typography variant="h6" fontWeight={700} gutterBottom>
        {replyTo ? 'Reply' : 'New Email'}
      </Typography>

      {fullEmail && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          From: {fullEmail}
        </Typography>
      )}

      <div className="space-y-3">
        <div>
          <Typography variant="caption" fontWeight={600}>
            To
          </Typography>
          <Input
            type="email"
            placeholder="recipient@example.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={sending}
          />
        </div>

        <div>
          <Typography variant="caption" fontWeight={600}>
            Subject
          </Typography>
          <Input
            placeholder="Email subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={sending}
          />
        </div>

        <div>
          <Typography variant="caption" fontWeight={600}>
            Message
          </Typography>
          <textarea
            className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Write your message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
          />
        </div>

        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={sending}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSend} disabled={sending || !to.trim()}>
            {sending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Send
          </Button>
        </Box>
      </div>
    </Card>
  );
};
