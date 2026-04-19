import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { useTheme } from '@mui/material/styles';
import { Plus, X, Lock, Clock, BarChart3 } from 'lucide-react';
import { formatDistanceToNow, isPast } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTripPolls } from '@/hooks/useTripCollaboration';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  tripId: string;
}

export function TripPolls({ tripId }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: polls, isLoading, createPoll, vote, closePoll } = useTripPolls(tripId);

  const [createOpen, setCreateOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isMultiple, setIsMultiple] = useState(false);
  const [deadline, setDeadline] = useState('');

  const resetForm = () => {
    setQuestion('');
    setOptions(['', '']);
    setIsMultiple(false);
    setDeadline('');
  };

  const handleCreate = () => {
    const validOptions = options.filter((o) => o.trim());
    if (!question.trim() || validOptions.length < 2) return;
    createPoll.mutate(
      { question: question.trim(), options: validOptions, isMultipleChoice: isMultiple, deadline: deadline || undefined },
      {
        onSuccess: () => { toast({ title: t('trips.polls.createdToast', 'Poll created') }); setCreateOpen(false); resetForm(); },
        onError: (err) => toast({ title: t('trips.polls.createFailedToast', 'Failed to create poll'), description: String(err), variant: 'destructive' }),
      },
    );
  };

  const handleVote = (pollId: string, optionId: string) => {
    vote.mutate(
      { pollId, optionId },
      {
        onError: (err) => toast({ title: t('trips.polls.voteFailedToast', 'Failed to vote'), description: String(err), variant: 'destructive' }),
      },
    );
  };

  const addOption = () => {
    if (options.length < 6) setOptions([...options, '']);
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, value: string) => {
    setOptions(options.map((o, i) => (i === idx ? value : o)));
  };

  if (isLoading) return <PageLoadingState count={2} />;

  const brandColor = theme.palette.brand?.main || '#DB2777';

  return (
    <Box>
      <Box className="flex items-center justify-between mb-3">
        <Typography variant="subtitle2" color="text.secondary">
          {polls?.length || 0} {(polls?.length || 0) === 1 ? t('trips.polls.poll', 'poll') : t('trips.polls.polls', 'polls')}
        </Typography>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          {t('trips.polls.create', 'Create Poll')}
        </Button>
      </Box>

      {(!polls || polls.length === 0) && (
        <ScrollReveal>
          <Box className="flex flex-col items-center justify-center py-16 text-center">
            <Box
              sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}
            >
              <BarChart3 size={24} style={{ opacity: 0.5 }} />
            </Box>
            <Typography variant="subtitle2" fontWeight={600}>{t('trips.polls.noPolls', 'No polls yet')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('trips.polls.noPollsHint', 'Create one to help your group make decisions')}
            </Typography>
          </Box>
        </ScrollReveal>
      )}

      <Box className="space-y-3">
        {polls?.map((poll) => {
          const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);
          const isExpired = poll.deadline ? isPast(new Date(poll.deadline)) : false;
          const isClosed = poll.is_closed || isExpired;
          const isAuthor = poll.author_id === user?.id;

          return (
            <Card key={poll.id}>
              <CardContent>
                <Box className="flex items-start justify-between gap-2 mb-2">
                  <Typography variant="subtitle1" fontWeight={600} sx={{ fontSize: 14 }}>
                    {poll.question}
                  </Typography>
                  <Box className="flex items-center gap-1 shrink-0">
                    {isClosed && <Badge variant="outline"><Lock size={10} style={{ marginRight: 4 }} />{t('trips.polls.closed', 'Closed')}</Badge>}
                    {poll.is_multiple_choice && <Badge variant="outline">{t('trips.polls.multiple', 'Multiple')}</Badge>}
                  </Box>
                </Box>

                <Box className="space-y-1.5">
                  {poll.options.map((opt) => {
                    const voteCount = opt.votes?.length || 0;
                    const pct = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
                    const hasVoted = opt.votes?.includes(user?.id || '');

                    return (
                      <Box
                        key={opt.id}
                        onClick={() => {
                          if (!isClosed && user) handleVote(poll.id, opt.id);
                        }}
                        sx={{
                          position: 'relative',
                          bgcolor: 'action.hover',
                          borderRadius: 2,
                          px: 1.5,
                          height: 32,
                          display: 'flex',
                          alignItems: 'center',
                          cursor: isClosed ? 'default' : 'pointer',
                          outline: hasVoted ? `2px solid ${brandColor}` : 'none',
                          outlineOffset: -2,
                          transition: 'background-color 0.15s',
                          '&:hover': !isClosed ? { bgcolor: 'action.selected' } : {},
                          overflow: 'hidden',
                        }}
                      >
                        {/* Filled bar */}
                        <Box
                          sx={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${pct}%`,
                            bgcolor: hasVoted ? brandColor : 'action.selected',
                            opacity: hasVoted ? 0.2 : 0.5,
                            transition: 'width 0.3s',
                          }}
                        />
                        <Box className="relative z-10 flex items-center justify-between w-full">
                          <Typography variant="body2" fontWeight={hasVoted ? 600 : 400} sx={{ fontSize: 13 }}>
                            {opt.text}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                            {voteCount} {totalVotes > 0 && `(${Math.round(pct)}%)`}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>

                <Box className="flex items-center justify-between mt-2">
                  <Box className="flex items-center gap-2">
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                      {totalVotes} {totalVotes === 1 ? t('trips.polls.totalVote', 'total vote') : t('trips.polls.totalVotes', 'total votes')}
                    </Typography>
                    {poll.deadline && !isClosed && (
                      <Box className="flex items-center gap-0.5">
                        <Clock size={10} style={{ color: theme.palette.text.secondary }} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                          {formatDistanceToNow(new Date(poll.deadline), { addSuffix: true })}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  {isAuthor && !poll.is_closed && (
                    <Button variant="ghost" size="sm" onClick={() => closePoll.mutate(poll.id)}>
                      {t('trips.polls.closePoll', 'Close Poll')}
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Create Poll Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.polls.create', 'Create Poll')}</DialogTitle>
          </DialogHeader>

          <Box className="flex flex-col gap-3 mt-2">
            <TextField
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('trips.polls.questionPlaceholder', 'What would you like to ask?')}
              fullWidth
              size="small"
            />

            <Typography variant="caption" fontWeight={600} sx={{ display: 'block' }}>
              {t('trips.polls.options', 'Options')}
            </Typography>
            {options.map((opt, idx) => (
              <Box key={idx} className="flex items-center gap-1">
                <TextField
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  placeholder={t('trips.polls.optionPlaceholder', 'Option {{n}}', { n: idx + 1 })}
                  fullWidth
                  size="small"
                />
                {options.length > 2 && (
                  <IconButton size="small" onClick={() => removeOption(idx)} sx={{ minWidth: 44, minHeight: 44 }}>
                    <X size={14} />
                  </IconButton>
                )}
              </Box>
            ))}
            {options.length < 6 && (
              <Button variant="ghost" size="sm" onClick={addOption}>{t('trips.polls.addOption', '+ Add Option')}</Button>
            )}

            <FormControlLabel
              control={
                <Switch checked={isMultiple} onChange={(e) => setIsMultiple(e.target.checked)} size="small" />
              }
              label={<Typography variant="body2" sx={{ fontSize: 13 }}>{t('trips.polls.allowMultiple', 'Allow multiple choices')}</Typography>}
            />

            <TextField
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              label={t('trips.polls.deadline', 'Deadline (optional)')}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ maxWidth: 260 }}
            />
          </Box>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setCreateOpen(false); resetForm(); }}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!question.trim() || options.filter((o) => o.trim()).length < 2 || createPoll.isPending}
            >
              {t('common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
