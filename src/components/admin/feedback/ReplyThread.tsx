import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Mail, MailX, AlertTriangle } from 'lucide-react';
import { Github } from '@/components/icons/brand';
import { timeAgo } from '@/utils/timezone';
import type { FeedbackReply } from './types';

interface Props {
  replies: FeedbackReply[];
  contactEmail: string | null | undefined;
  onSend: (body: string, notify: boolean) => void;
  isSending: boolean;
}

export function ReplyThread({ replies, contactEmail, onSend, isSending }: Props) {
  const [body, setBody] = useState('');
  const [notify, setNotify] = useState(true);
  const canEmail = !!contactEmail;

  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed, notify && canEmail);
    setBody('');
  };

  return (
    <div className="mb-6">
      <p className="text-xs font-semibold block mb-1">
        Conversation {replies.length > 0 && `(${replies.length})`}
      </p>

      {replies.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {replies.map((r, i) => {
            const isGithub = r.by_name.startsWith('GH:');
            return (
              <div
                key={`${r.at}-${i}`}
                className="p-2 border-l-[3px] bg-muted rounded"
                style={{ borderColor: isGithub ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' }}
              >
                <div className="flex items-center gap-1 mb-1">
                  <Avatar className="w-[18px] h-[18px]">
                    <AvatarFallback className="text-[0.6rem]">
                      {isGithub ? <Github size={10} /> : r.by_name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[0.7rem] font-semibold">
                    {isGithub ? r.by_name.slice(3) : r.by_name}
                  </span>
                  <span className="text-[0.6rem] text-muted-foreground">{timeAgo(r.at)}</span>
                  {r.emailed && (
                    <span
                      title={
                        r.bounced_at
                          ? `Bounced: ${r.bounce_reason ?? 'unknown'}`
                          : r.opened_at
                            ? `Opened ${timeAgo(r.opened_at)}`
                            : r.delivered_at
                              ? `Delivered ${timeAgo(r.delivered_at)}`
                              : 'Sent, waiting for delivery callback'
                      }
                    >
                      <Mail
                        size={11}
                        style={{
                          color: r.bounced_at
                            ? 'hsl(var(--destructive))'
                            : r.opened_at
                              ? 'hsl(var(--foreground))'
                              : r.delivered_at
                                ? 'hsl(var(--muted-foreground))'
                                : 'hsl(var(--muted-foreground))',
                        }}
                        aria-label={
                          r.bounced_at
                            ? 'bounced'
                            : r.opened_at
                              ? 'opened'
                              : r.delivered_at
                                ? 'delivered'
                                : 'sent'
                        }
                      />
                    </span>
                  )}
                  {r.email_error && (
                    <span title={r.email_error}>
                      <AlertTriangle size={11} style={{ color: 'hsl(var(--destructive))' }} />
                    </span>
                  )}
                  {r.github_url && (
                    <a
                      href={r.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex' }}
                      aria-label="Open on GitHub"
                    >
                      <Github size={11} />
                    </a>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-[0.8rem] leading-snug">{r.body}</p>
              </div>
            );
          })}
        </div>
      )}

      <Textarea
        value={body}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
        placeholder={canEmail ? `Reply to ${contactEmail}…` : 'Add an internal comment…'}
        style={{ minHeight: 80 }}
      />
      <div className="flex items-center mt-2 gap-2">
        {canEmail ? (
          <label className="flex items-center gap-2 text-[0.7rem] cursor-pointer">
            <Switch checked={notify} onCheckedChange={setNotify} />
            <span>Email submitter ({contactEmail})</span>
          </label>
        ) : (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-0.5">
            <MailX size={12} />
            No contact email — comment stays internal
          </span>
        )}
        <div className="flex-1" />
        <Button
          onClick={handleSend}
          disabled={!body.trim() || isSending}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Send style={{ width: 14, height: 14 }} />
          {isSending ? 'Sending…' : canEmail && notify ? 'Reply' : 'Save comment'}
        </Button>
      </div>
    </div>
  );
}
