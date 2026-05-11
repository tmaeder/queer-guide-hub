import React, { useState } from 'react';
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

export const ComposeEmail = ({ replyTo, onSent, onCancel }) => {
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
      <h6 className="text-base font-bold mb-2">{replyTo ? 'Reply' : 'New Email'}</h6>

      {fullEmail && (
        <span className="text-xs text-muted-foreground mb-4 block">
          From: {fullEmail}
        </span>
      )}

      <div className="space-y-3">
        <div>
          <span className="text-xs font-semibold">To</span>
          <Input
            type="email"
            placeholder="recipient@example.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={sending}
          />
        </div>

        <div>
          <span className="text-xs font-semibold">Subject</span>
          <Input
            placeholder="Email subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={sending}
          />
        </div>

        <div>
          <span className="text-xs font-semibold">Message</span>
          <textarea
            className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Write your message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
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
        </div>
      </div>
    </Card>
  );
};
