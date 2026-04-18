import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import Tooltip from '@mui/material/Tooltip';
import { format } from 'date-fns';
import { Send, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useTripChat, useSendTripMessage } from '@/hooks/useTripChat';
import { useTripPresence } from '@/hooks/useTripPresence';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';

interface Props {
  tripId: string;
}

/**
 * Trip chat tab — per-trip group conversation.
 *
 * Reads / writes `trip_messages` (RLS restricts to trip members). Realtime
 * INSERT subscription keeps every member's view in sync. No read receipts
 * or typing indicators yet; they land in a follow-up.
 */
export function TripChatTab({ tripId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: messages, isLoading } = useTripChat(tripId);
  const send = useSendTripMessage(tripId);
  const presentMembers = useTripPresence(tripId);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  const onSend = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(
      { content: text },
      {
        onSuccess: () => setDraft(''),
      },
    );
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
        {t('trips.chat.loading', 'Loading conversation…')}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: { xs: 480, md: 600 } }}>
      {presentMembers.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1,
            py: 0.75,
            mb: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'success.main',
              flexShrink: 0,
            }}
            aria-hidden
          />
          <AvatarGroup
            max={4}
            sx={{
              '& .MuiAvatar-root': { width: 22, height: 22, fontSize: 11, borderWidth: 1 },
            }}
          >
            {presentMembers.map((m) => (
              <Tooltip
                key={m.user_id}
                title={m.display_name ?? t('trips.chat.anonymous', 'Someone')}
              >
                <Avatar src={m.avatar_url ?? undefined} alt={m.display_name ?? ''}>
                  {(m.display_name ?? '?').slice(0, 1).toUpperCase()}
                </Avatar>
              </Tooltip>
            ))}
          </AvatarGroup>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
            {t('trips.chat.viewing', {
              defaultValue: '{{count}} viewing now',
              count: presentMembers.length,
            })}
          </Typography>
        </Box>
      )}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          pr: 1,
          mb: 2,
        }}
      >
        {(!messages || messages.length === 0) && (
          <EmptyState
            icon={MessageCircle}
            title={t('trips.chat.emptyTitle', 'Start the trip chat')}
            description={t(
              'trips.chat.emptyDescription',
              'Everyone on the trip sees this conversation. Share links, pin questions, coordinate check-ins.',
            )}
          />
        )}

        {(messages ?? []).map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <Box
              key={m.id}
              sx={{
                display: 'flex',
                gap: 1.5,
                alignItems: 'flex-start',
                flexDirection: mine ? 'row-reverse' : 'row',
              }}
            >
              <Avatar
                src={m.sender?.avatar_url ?? undefined}
                alt={m.sender?.display_name ?? ''}
                sx={{ width: 32, height: 32, flexShrink: 0 }}
              >
                {(m.sender?.display_name ?? '?').slice(0, 1).toUpperCase()}
              </Avatar>
              <Box
                sx={{
                  maxWidth: '78%',
                  p: 1.25,
                  bgcolor: mine ? 'primary.main' : 'action.hover',
                  color: mine ? 'primary.contrastText' : 'text.primary',
                }}
              >
                {!mine && (
                  <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', mb: 0.25 }}>
                    {m.sender?.display_name ?? t('trips.chat.anonymous', 'Someone')}
                  </Typography>
                )}
                <Typography sx={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                  {m.content}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.6875rem',
                    opacity: 0.7,
                    mt: 0.5,
                  }}
                >
                  {format(new Date(m.created_at), 'MMM d, HH:mm')}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
        <TextField
          multiline
          maxRows={4}
          fullWidth
          placeholder={t('trips.chat.placeholder', 'Message the trip…')}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
          onKeyDown={onKeyDown}
          disabled={send.isPending}
          size="small"
        />
        <Button
          variant="brand"
          onClick={onSend}
          disabled={!draft.trim() || send.isPending}
          aria-label={t('trips.chat.send', 'Send')}
        >
          <Send size={14} />
        </Button>
      </Box>
    </Box>
  );
}
