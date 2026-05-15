import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, Lock, Clock, BarChart3 } from 'lucide-react';
import { formatDistanceToNow, isPast } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">
          {polls?.length || 0} {(polls?.length || 0) === 1 ? t('trips.polls.poll', 'poll') : t('trips.polls.polls', 'polls')}
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          {t('trips.polls.create', 'Create Poll')}
        </Button>
      </div>

      {(!polls || polls.length === 0) && (
        <ScrollReveal>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <BarChart3 size={24} style={{ opacity: 0.5 }} />
            </div>
            <p className="text-sm font-semibold">{t('trips.polls.noPolls', 'No polls yet')}</p>
            <p className="text-sm text-muted-foreground">
              {t('trips.polls.noPollsHint', 'Create one to help your group make decisions')}
            </p>
          </div>
        </ScrollReveal>
      )}

      <div className="space-y-3">
        {polls?.map((poll) => {
          const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);
          const isExpired = poll.deadline ? isPast(new Date(poll.deadline)) : false;
          const isClosed = poll.is_closed || isExpired;
          const isAuthor = poll.author_id === user?.id;

          return (
            <Card key={poll.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold">{poll.question}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {isClosed && <Badge variant="outline"><Lock size={10} style={{ marginRight: 4 }} />{t('trips.polls.closed', 'Closed')}</Badge>}
                    {poll.is_multiple_choice && <Badge variant="outline">{t('trips.polls.multiple', 'Multiple')}</Badge>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {poll.options.map((opt) => {
                    const voteCount = opt.votes?.length || 0;
                    const pct = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
                    const hasVoted = opt.votes?.includes(user?.id || '');

                    return (
                      <div
                        key={opt.id}
                        onClick={() => {
                          if (!isClosed && user) handleVote(poll.id, opt.id);
                        }}
                        className={`relative bg-muted rounded-element px-3 h-8 flex items-center overflow-hidden transition-colors ${isClosed ? 'cursor-default' : 'cursor-pointer hover:bg-accent'}`}
                        style={hasVoted ? { outline: '2px solid hsl(var(--foreground))', outlineOffset: -2 } : undefined}
                      >
                        <div
                          className="absolute left-0 top-0 bottom-0 transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: hasVoted ? 'hsl(var(--foreground))' : 'hsl(var(--accent))',
                            opacity: hasVoted ? 0.2 : 0.5,
                          }}
                        />
                        <div className="relative z-10 flex items-center justify-between w-full">
                          <span className={`text-[13px] ${hasVoted ? 'font-semibold' : ''}`}>{opt.text}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {voteCount} {totalVotes > 0 && `(${Math.round(pct)}%)`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {totalVotes} {totalVotes === 1 ? t('trips.polls.totalVote', 'total vote') : t('trips.polls.totalVotes', 'total votes')}
                    </span>
                    {poll.deadline && !isClosed && (
                      <div className="flex items-center gap-0.5">
                        <Clock size={10} className="text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(poll.deadline), { addSuffix: true })}
                        </span>
                      </div>
                    )}
                  </div>
                  {isAuthor && !poll.is_closed && (
                    <Button variant="ghost" size="sm" onClick={() => closePoll.mutate(poll.id)}>
                      {t('trips.polls.closePoll', 'Close Poll')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.polls.create', 'Create Poll')}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 mt-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('trips.polls.questionPlaceholder', 'What would you like to ask?')}
            />

            <p className="text-xs font-semibold block">{t('trips.polls.options', 'Options')}</p>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Input
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  placeholder={t('trips.polls.optionPlaceholder', 'Option {{n}}', { n: idx + 1 })}
                />
                {options.length > 2 && (
                  <Button variant="ghost" size="sm" onClick={() => removeOption(idx)} className="min-w-[44px] min-h-[44px]">
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <Button variant="ghost" size="sm" onClick={addOption}>{t('trips.polls.addOption', '+ Add Option')}</Button>
            )}

            <div className="flex items-center gap-2">
              <Switch id="poll-multi" checked={isMultiple} onCheckedChange={setIsMultiple} />
              <Label htmlFor="poll-multi" className="text-[13px]">
                {t('trips.polls.allowMultiple', 'Allow multiple choices')}
              </Label>
            </div>

            <div className="flex flex-col gap-2 max-w-[260px]">
              <Label htmlFor="poll-deadline">{t('trips.polls.deadline', 'Deadline (optional)')}</Label>
              <Input
                id="poll-deadline"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

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
    </div>
  );
}
