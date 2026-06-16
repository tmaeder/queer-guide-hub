import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Reply, Send, X } from 'lucide-react';
import { useMailbox, type MailboxEmail } from '@/hooks/useMailbox';
import { EmailView } from '@/components/inbox/EmailView';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

/**
 * Self-contained email reader + inline reply, shared by the unified inbox rail
 * (MessagingInterface) and the standalone mailbox page (UnifiedInbox). Loads a
 * single email by id directly so it does not depend on the caller's folder
 * selection, and replies via useMailbox.sendEmail.
 */
export function MailDetail({ emailId }: { emailId: string }) {
  const { t } = useTranslation();
  const { sendEmail, sending, markRead, moveToFolder, fetchEmailById } = useMailbox();

  const [email, setEmail] = useState<MailboxEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with an external fetch keyed by emailId; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setLoading(true);
    setReplyOpen(false);
    setReplyBody('');
    void fetchEmailById(emailId).then((row) => {
      if (!active) return;
      setEmail(row);
      setLoading(false);
      if (row && !row.is_read) void markRead(row.id);
    });
    return () => {
      active = false;
    };
  }, [emailId, fetchEmailById, markRead]);

  const handleSendReply = async () => {
    if (!email) return;
    await sendEmail({
      to: email.from_address,
      subject: `Re: ${email.subject.replace(/^Re:\s*/i, '')}`,
      body_text: replyBody,
      in_reply_to_email_id: email.id,
    });
    setReplyBody('');
    setReplyOpen(false);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-muted-foreground">
          {t('inbox.mail.notFound', { defaultValue: 'Email not found.' })}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        <EmailView
          email={email}
          onReply={() => setReplyOpen(true)}
          onArchive={(id) => void moveToFolder(id, 'archive')}
          onDelete={(id) => void moveToFolder(id, 'trash')}
        />

        {replyOpen && (
          <div className="flex flex-col gap-4 rounded-container border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-15 font-semibold">
                <Reply className="mr-2 inline-block h-4 w-4 align-middle" aria-hidden />
                {t('inbox.mail.replyTo', { defaultValue: 'Reply to' })} {email.from_address}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-0 p-2"
                onClick={() => setReplyOpen(false)}
                aria-label={t('common.close', { defaultValue: 'Close' })}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <textarea
              className="min-h-[160px] w-full rounded-element border border-input bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={t('inbox.mail.replyPlaceholder', { defaultValue: 'Write your reply…' })}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              disabled={sending}
            />
            <div className="flex justify-end">
              <Button onClick={handleSendReply} disabled={sending || !replyBody.trim()}>
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="mr-2 h-4 w-4" aria-hidden />
                )}
                {t('inbox.mail.send', { defaultValue: 'Send' })}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
