import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Mail, MailX, AlertTriangle, Github } from 'lucide-react';
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
    <Box sx={{ mb: 3 }}>
      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.75 }}>
        Conversation {replies.length > 0 && `(${replies.length})`}
      </Typography>

      {replies.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
          {replies.map((r, i) => {
            const isGithub = r.by_name.startsWith('GH:');
            return (
              <Box
                key={`${r.at}-${i}`}
                sx={{
                  p: 1,
                  borderLeft: 3,
                  borderColor: isGithub ? '#6366f1' : '#b60d3d',
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                  <Avatar sx={{ width: 18, height: 18, fontSize: '0.6rem' }}>
                    {isGithub ? <Github size={10} /> : r.by_name.slice(0, 1).toUpperCase()}
                  </Avatar>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
                    {isGithub ? r.by_name.slice(3) : r.by_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                    {timeAgo(r.at)}
                  </Typography>
                  {r.emailed && (
                    <Mail size={11} style={{ color: '#22c55e' }} aria-label="emailed" />
                  )}
                  {r.email_error && (
                    <span title={r.email_error}>
                      <AlertTriangle size={11} style={{ color: '#ef4444' }} />
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
                </Box>
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', lineHeight: 1.4 }}
                >
                  {r.body}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}

      <Textarea
        value={body}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
        placeholder={canEmail ? `Reply to ${contactEmail}…` : 'Add an internal comment…'}
        style={{ minHeight: 80 }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, gap: 1 }}>
        {canEmail ? (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />
            }
            label={`Email submitter (${contactEmail})`}
            sx={{ '& .MuiTypography-root': { fontSize: '0.7rem' } }}
          />
        ) : (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            <MailX size={12} />
            No contact email — comment stays internal
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={handleSend}
          disabled={!body.trim() || isSending}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Send style={{ width: 14, height: 14 }} />
          {isSending ? 'Sending…' : canEmail && notify ? 'Reply' : 'Save comment'}
        </Button>
      </Box>
    </Box>
  );
}
