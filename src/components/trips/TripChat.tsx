import { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Skeleton from '@mui/material/Skeleton';
import { Send, Reply, X } from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { useTripMessages, type TripMessage } from '@/hooks/useTripCollaboration';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  tripId: string;
}

export function TripChat({ tripId }: Props) {
  const { user } = useAuth();
  const { data: messages, isLoading, sendMessage } = useTripMessages(tripId);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<TripMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Auto-scroll on new messages
  useEffect(() => {
    const count = messages?.length ?? 0;
    if (count > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = count;
  }, [messages?.length]);

  // Initial scroll to bottom
  useEffect(() => {
    if (!isLoading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isLoading]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage.mutate({ content: text, replyTo: replyTo?.id });
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

  if (isLoading) {
    return (
      <Box className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <Box key={i} className="flex gap-2">
            <Skeleton variant="circular" width={32} height={32} />
            <div className="flex-1">
              <Skeleton width={100} height={16} />
              <Skeleton width="60%" height={20} sx={{ mt: 0.5 }} />
            </div>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box className="flex flex-col h-full" sx={{ minHeight: 400, maxHeight: 600 }}>
      {/* Messages list */}
      <Box
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 p-3"
        sx={{ overscrollBehavior: 'contain' }}
      >
        {(!messages || messages.length === 0) && (
          <Box className="flex flex-col items-center justify-center py-16 text-center">
            <Typography color="text.secondary" sx={{ fontSize: 14 }}>
              Start the conversation! Share ideas for your trip.
            </Typography>
          </Box>
        )}

        {messages?.map((msg) => {
          const isOwn = msg.sender_id === user?.id;
          const replyMsg = findReplyMessage(msg.reply_to);
          return (
            <Box
              key={msg.id}
              className={`flex gap-2 group ${isOwn ? 'flex-row-reverse' : ''}`}
            >
              <Avatar
                src={msg.sender?.avatar_url || undefined}
                alt={msg.sender?.display_name || 'User'}
                sx={{ width: 30, height: 30, mt: 0.5 }}
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
                  className="rounded-lg px-3 py-1.5"
                  sx={{
                    bgcolor: isOwn ? 'primary.main' : 'action.hover',
                    color: isOwn ? 'primary.contrastText' : 'text.primary',
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
                  sx={{ p: 0.25, mt: 0.25 }}
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
        <Box className="flex items-center gap-2 px-3 py-1.5 border-t border-border" sx={{ bgcolor: 'action.hover' }}>
          <Reply size={14} className="text-muted-foreground shrink-0" />
          <Box className="flex-1 min-w-0">
            <Typography variant="caption" fontWeight={600} sx={{ fontSize: 11 }}>
              Replying to {replyTo.sender?.display_name || 'Unknown'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: 11 }}>
              {replyTo.content}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setReplyTo(null)} sx={{ p: 0.25 }}>
            <X size={14} />
          </IconButton>
        </Box>
      )}

      {/* Input */}
      <Box className="flex items-end gap-2 p-3 border-t border-border">
        <TextField
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          multiline
          maxRows={4}
          size="small"
          fullWidth
          sx={{ '& .MuiInputBase-root': { fontSize: 13 } }}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!input.trim() || sendMessage.isPending}
          sx={{ mb: 0.5 }}
        >
          <Send size={18} />
        </IconButton>
      </Box>
    </Box>
  );
}
