import { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import { Send, Reply, X, MessageCircle } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useToast } from '@/hooks/use-toast';
import { useTripMessages, type TripMessage } from '@/hooks/useTripCollaboration';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  tripId: string;
}

export function TripChat({ tripId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: messages, isLoading, sendMessage } = useTripMessages(tripId);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<TripMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const count = messages?.length ?? 0;
    if (count > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = count;
  }, [messages?.length]);

  useEffect(() => {
    if (!isLoading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isLoading]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage.mutate(
      { content: text, replyTo: replyTo?.id },
      {
        onError: (err) => toast({ title: 'Failed to send message', description: String(err), variant: 'destructive' }),
      },
    );
    setInput('');
    setReplyTo(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
    return format(date, 'MMM d, HH:mm');
  };

  const findReplyMessage = (id: string | null) =>
    id ? messages?.find((m) => m.id === id) : null;

  if (isLoading) return <PageLoadingState count={3} variant="list" />;

  return (
    <Box className="flex flex-col h-full" sx={{ minHeight: 400, maxHeight: 600 }}>
      {/* Messages list */}
      <Box
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 p-3"
        sx={{ overscrollBehavior: 'contain' }}
      >
        {(!messages || messages.length === 0) && (
          <ScrollReveal>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, textAlign: 'center', flex: 1 }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                }}
              >
                <MessageCircle size={24} style={{ opacity: 0.5 }} />
              </Box>
              <Typography variant="subtitle2" fontWeight={600}>
                Start the conversation
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Share ideas for your trip
              </Typography>
            </Box>
          </ScrollReveal>
        )}

        {messages?.map((msg) => {
          const isOwn = msg.sender_id === user?.id;
          const replyMsg = findReplyMessage(msg.reply_to);
          return (
            <Box key={msg.id} className={`flex gap-2 group ${isOwn ? 'flex-row-reverse' : ''}`}>
              <Avatar
                src={msg.sender?.avatar_url || undefined}
                alt={msg.sender?.display_name || 'User'}
                sx={{ width: 24, height: 24, mt: 0.5 }}
              >
                {(msg.sender?.display_name || 'U')[0].toUpperCase()}
              </Avatar>

              <Box className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                <Box className="flex items-center gap-1.5 mb-0.5">
                  <Typography variant="caption" fontWeight={600} sx={{ fontSize: 11 }}>
                    {isOwn ? 'You' : msg.sender?.display_name || 'Unknown'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                    {formatTimestamp(msg.created_at)}
                  </Typography>
                </Box>

                {replyMsg && (
                  <Box
                    className="border-l-2 border-primary/40 pl-2 mb-1 rounded-sm"
                    sx={{ bgcolor: 'action.hover', py: 0.5, px: 1 }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block' }}>
                      {replyMsg.sender?.display_name || 'Unknown'}
                    </Typography>
                    <Typography variant="caption" noWrap sx={{ fontSize: 11, maxWidth: 200, display: 'block' }}>
                      {replyMsg.content}
                    </Typography>
                  </Box>
                )}

                <Box
                  sx={{
                    bgcolor: isOwn ? 'primary.main' : 'action.hover',
                    color: isOwn ? 'primary.contrastText' : 'text.primary',
                    borderRadius: 2,
                    p: 1.5,
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.content}
                  </Typography>
                </Box>

                <IconButton
                  size="small"
                  onClick={() => setReplyTo(msg)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  sx={{ p: 0.25, mt: 0.25, minWidth: 44, minHeight: 44 }}
                >
                  <Reply size={12} />
                </IconButton>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Reply preview */}
      {replyTo && (
        <Box className="flex items-center gap-2 px-3 py-1.5" sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
          <Reply size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
          <Box className="flex-1 min-w-0">
            <Typography variant="caption" fontWeight={600} sx={{ fontSize: 11 }}>
              Replying to {replyTo.sender?.display_name || 'Unknown'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: 11 }}>
              {replyTo.content}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setReplyTo(null)} sx={{ p: 0.25, minWidth: 44, minHeight: 44 }}>
            <X size={14} />
          </IconButton>
        </Box>
      )}

      {/* Input */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', mt: 2, p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <TextField
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          multiline
          maxRows={4}
          size="small"
          sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: 13 } }}
        />
        <IconButton color="primary" onClick={handleSend} disabled={!input.trim() || sendMessage.isPending}>
          <Send size={18} />
        </IconButton>
      </Box>
    </Box>
  );
}
