import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  useSubmitSafetySignal,
  useVenueSafetyPrompts,
  type SafetyQuestion,
} from '@/hooks/useVenueSafetySignals';

interface Props {
  venueId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VenueSafetySignalPrompt({ venueId, open, onOpenChange }: Props) {
  const { data: prompts, isLoading } = useVenueSafetyPrompts(open ? venueId : undefined);
  const submit = useSubmitSafetySignal(venueId);
  const { toast } = useToast();
  const [answered, setAnswered] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) setAnswered(new Set());
  }, [open]);

  const queue: SafetyQuestion[] = (prompts ?? []).filter((q) => !answered.has(q.question_id));

  const handle = async (q: SafetyQuestion, answer: boolean | null) => {
    if (answer === null) {
      setAnswered((prev) => new Set(prev).add(q.question_id));
      return;
    }
    try {
      await submit.mutateAsync({ questionId: q.question_id, answer });
      setAnswered((prev) => new Set(prev).add(q.question_id));
      toast({ title: 'Thanks', description: 'Signal recorded.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'submit_failed';
      toast({
        title: 'Could not record signal',
        description: humanReason(msg),
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (open && !isLoading && queue.length === 0) {
      onOpenChange(false);
    }
  }, [open, isLoading, queue.length, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Were you here?</DialogTitle>
          <DialogDescription>
            Two quick questions. Your answers stay anonymous and help other visitors.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        )}

        {!isLoading && queue.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">
            No new questions right now. Thanks for contributing.
          </p>
        )}

        {!isLoading && queue.length > 0 && (
          <div className="flex flex-col gap-5">
            {queue.map((q) => (
              <div key={q.question_id} className="flex flex-col gap-3">
                <p className="text-sm font-medium">{q.prompt}</p>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    disabled={submit.isPending}
                    onClick={() => handle(q, true)}
                  >
                    Yes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={submit.isPending}
                    onClick={() => handle(q, false)}
                  >
                    No
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={submit.isPending}
                    onClick={() => handle(q, null)}
                  >
                    Skip
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function humanReason(reason: string): string {
  switch (reason) {
    case 'account_too_new':
      return 'Account must be at least 7 days old.';
    case 'rate_limited_question':
      return 'You already answered this recently.';
    case 'rate_limited_daily':
      return "You've hit today's signal limit.";
    case 'not_authenticated':
      return 'Sign in to contribute.';
    default:
      return 'Try again later.';
  }
}
