import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import { Plus, X, Lock, Clock } from 'lucide-react';
import { formatDistanceToNow, isPast } from 'date-fns';
import { useTripPolls, type PollOption } from '@/hooks/useTripCollaboration';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  tripId: string;
}

export function TripPolls({ tripId }: Props) {
  const { user } = useAuth();
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
    createPoll.mutate({
      question: question.trim(),
      options: validOptions,
      isMultipleChoice: isMultiple,
      deadline: deadline || undefined,
    });
    setCreateOpen(false);
    resetForm();
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

  if (isLoading) {
    return (
      <Box className="space-y-3 p-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={160} />
        ))}
      </Box>
    );
  }

  return (
    <Box>
      <Box className="flex items-center justify-between mb-3">
        <Typography variant="subtitle2" color="text.secondary">
          {polls?.length || 0} {(polls?.length || 0) === 1 ? 'poll' : 'polls'}
        </Typography>
        <Button size="small" startIcon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
          Create Poll
        </Button>
      </Box>

      {(!polls || polls.length === 0) && (
        <Box className="text-center py-12">
          <Typography color="text.secondary" sx={{ fontSize: 14 }}>
            No polls yet. Create one to help your group make decisions.
          </Typography>
        </Box>
      )}

      <Box className="space-y-3">
        {polls?.map((poll) => {
          const totalVotes = poll.options.reduce(
            (sum, opt) => sum + (opt.votes?.length || 0),
            0,
          );
          const isExpired = poll.deadline ? isPast(new Date(poll.deadline)) : false;
          const isClosed = poll.is_closed || isExpired;
          const isAuthor = poll.author_id === user?.id;

          return (
            <Card key={poll.id} variant="outlined">
              <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
                <Box className="flex items-start justify-between gap-2 mb-2">
                  <Typography variant="body1" fontWeight={600} sx={{ fontSize: 14 }}>
                    {poll.question}
                  </Typography>
                  <Box className="flex items-center gap-1 shrink-0">
                    {isClosed && (
                      <Chip
                        icon={<Lock size={10} />}
                        label="Closed"
                        size="small"
                        color="default"
                        variant="outlined"
                        sx={{ height: 20, fontSize: 10 }}
                      />
                    )}
                    {poll.is_multiple_choice && (
                      <Chip
                        label="Multiple"
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: 10 }}
                      />
                    )}
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
                          if (!isClosed && user) {
                            vote.mutate({ pollId: poll.id, optionId: opt.id });
                          }
                        }}
                        className={`rounded-lg px-3 py-1.5 cursor-pointer transition-colors ${
                          isClosed ? 'cursor-default' : 'hover:bg-primary/5'
                        } ${hasVoted ? 'ring-1 ring-primary/40' : ''}`}
                        sx={{ position: 'relative', bgcolor: 'action.hover' }}
                      >
                        <Box className="relative z-10 flex items-center justify-between">
                          <Typography
                            variant="body2"
                            fontWeight={hasVoted ? 600 : 400}
                            sx={{ fontSize: 13 }}
                          >
                            {opt.text}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                            {voteCount} {voteCount === 1 ? 'vote' : 'votes'}{' '}
                            {totalVotes > 0 && `(${Math.round(pct)}%)`}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          sx={{
                            mt: 0.5,
                            height: 4,
                            borderRadius: 2,
                            bgcolor: 'transparent',
                            '& .MuiLinearProgress-bar': {
                              borderRadius: 2,
                              bgcolor: hasVoted ? 'primary.main' : 'action.selected',
                            },
                          }}
                        />
                      </Box>
                    );
                  })}
                </Box>

                <Box className="flex items-center justify-between mt-2">
                  <Box className="flex items-center gap-2">
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                      {totalVotes} total {totalVotes === 1 ? 'vote' : 'votes'}
                    </Typography>
                    {poll.deadline && !isClosed && (
                      <Box className="flex items-center gap-0.5 text-muted-foreground">
                        <Clock size={10} />
                        <Typography variant="caption" sx={{ fontSize: 10 }}>
                          {formatDistanceToNow(new Date(poll.deadline), { addSuffix: true })}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  {isAuthor && !poll.is_closed && (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => closePoll.mutate(poll.id)}
                      sx={{ fontSize: 11, py: 0, minHeight: 0 }}
                    >
                      Close Poll
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Create Poll Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetForm();
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 16, pb: 1 }}>Create Poll</DialogTitle>
        <DialogContent>
          <TextField
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What would you like to ask?"
            fullWidth
            size="small"
            sx={{ mb: 2, mt: 1 }}
          />

          <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
            Options
          </Typography>
          {options.map((opt, idx) => (
            <Box key={idx} className="flex items-center gap-1 mb-1.5">
              <TextField
                value={opt}
                onChange={(e) => updateOption(idx, e.target.value)}
                placeholder={`Option ${idx + 1}`}
                fullWidth
                size="small"
              />
              {options.length > 2 && (
                <IconButton size="small" onClick={() => removeOption(idx)}>
                  <X size={14} />
                </IconButton>
              )}
            </Box>
          ))}
          {options.length < 6 && (
            <Button size="small" onClick={addOption} sx={{ mb: 2, fontSize: 12 }}>
              + Add Option
            </Button>
          )}

          <Box className="flex flex-col gap-2 mt-1">
            <FormControlLabel
              control={
                <Switch
                  checked={isMultiple}
                  onChange={(e) => setIsMultiple(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2" sx={{ fontSize: 13 }}>
                  Allow multiple choices
                </Typography>
              }
            />
            <TextField
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              label="Deadline (optional)"
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ maxWidth: 260 }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setCreateOpen(false);
              resetForm();
            }}
            size="small"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={
              !question.trim() ||
              options.filter((o) => o.trim()).length < 2 ||
              createPoll.isPending
            }
            size="small"
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
