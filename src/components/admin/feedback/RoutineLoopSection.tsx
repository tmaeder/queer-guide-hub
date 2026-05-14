import { useMemo, useState } from 'react';
import { Bot, Sparkles, AlertTriangle, ExternalLink, RefreshCcw, ShieldAlert, Archive, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCombinedStoryPrompt } from './claudePrompts';
import type { ApiErrorSubmission } from './claudePrompts';
import type {
  FeedbackRetestRun,
  FeedbackRoutineRun,
  FeedbackStory,
  FeedbackSubmission,
  RetestKind,
  RoutineRunner,
} from './types';
import { getStoryPhase, PHASE_COLORS, PHASE_LABELS } from './storyPhase';
import {
  useApproveStoryForClaude,
  useArchiveStory,
  useCancelRoutineRun,
  useDispatchClaudeRoutine,
  useMarkStoryNeedsFollowup,
  useRoutineRetests,
  useStartRetest,
  useStoryRoutineRuns,
  useVerifyStory,
} from '@/hooks/useStoryRoutine';

const RETEST_KINDS: RetestKind[] = ['typecheck', 'lint', 'unit', 'e2e', 'targeted'];
const RUNNERS: RoutineRunner[] = ['mock', 'local', 'github_actions', 'webhook', 'api'];

interface Props {
  story: FeedbackStory;
  feedbackMembers: FeedbackSubmission[];
  errorMembers: ApiErrorSubmission[];
  memberCount: number;
}

export function RoutineLoopSection({ story, feedbackMembers, errorMembers, memberCount }: Props) {
  const runs = useStoryRoutineRuns(story.id);
  const latestRun: FeedbackRoutineRun | null = runs.data?.[0] ?? null;
  const retests = useRoutineRetests(latestRun?.id ?? null);
  const latestRetest: FeedbackRetestRun | null =
    latestRun?.status === 'fix_proposed' ? retests.data?.[0] ?? null : null;

  const phase = getStoryPhase(story, latestRun, latestRetest, memberCount);

  const approve = useApproveStoryForClaude();
  const markFollowup = useMarkStoryNeedsFollowup();
  const dispatch = useDispatchClaudeRoutine();
  const cancel = useCancelRoutineRun();
  const startRetest = useStartRetest();
  const verify = useVerifyStory();
  const archive = useArchiveStory();

  const [editing, setEditing] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [runner, setRunner] = useState<RoutineRunner>('mock');
  const [followupReason, setFollowupReason] = useState('');
  const [archiveReason, setArchiveReason] = useState('');

  const generatedPrompt = useMemo(
    () => formatCombinedStoryPrompt(story, feedbackMembers, errorMembers),
    [story, feedbackMembers, errorMembers],
  );

  const dispatching = dispatch.isPending;
  const approving = approve.isPending;
  const cancelling = cancel.isPending;
  const retesting = startRetest.isPending;
  const verifying = verify.isPending;
  const archiving = archive.isPending;

  const handleEdit = () => {
    setPromptDraft(generatedPrompt);
    setEditing(true);
  };

  const handleApprove = () =>
    approve.mutate({ storyId: story.id });

  const handleNeedsFollowup = () => {
    if (!followupReason.trim()) return;
    markFollowup.mutate({ storyId: story.id, reason: followupReason.trim() });
    setFollowupReason('');
  };

  const handleDispatch = () =>
    dispatch.mutate({
      storyId: story.id,
      runner,
      // Server builds + redacts the prompt by default; only send override
      // when the admin actively edited it.
      promptOverride: editing ? promptDraft : undefined,
    });

  const handleCancel = () => {
    if (!latestRun) return;
    cancel.mutate({ runId: latestRun.id, storyId: story.id, reason: 'admin cancelled' });
  };

  const handleRetest = (kind: RetestKind) => {
    if (!latestRun) return;
    startRetest.mutate({ runId: latestRun.id, storyId: story.id, kind, runner: 'mock' });
  };

  const handleResolve = () => verify.mutate({ storyId: story.id, outcome: 'resolved' });
  const handleReopen = () => verify.mutate({ storyId: story.id, outcome: 'reopen' });
  const handleArchive = () => archive.mutate({ storyId: story.id, reason: archiveReason.trim() || undefined });

  const showApproveCard =
    !story.archived_at && !story.approved_for_claude_at && !latestRun;
  const showDispatchCard =
    !story.archived_at && !!story.approved_for_claude_at && (!latestRun || latestRun.status === 'cancelled' || latestRun.status === 'failed');
  const showRunCard = !!latestRun && latestRun.status !== 'cancelled';
  const showVerifyCard =
    latestRetest?.status === 'passed' && story.status !== 'resolved' && !story.archived_at;
  const showArchiveCard = story.status === 'resolved' && !story.archived_at;

  return (
    <TooltipProvider>
    <div data-testid="routine-loop" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Bot size={14} />
        <span className="text-xs uppercase tracking-wider">Claude routine</span>
        <Badge
          variant="outline"
          style={{
            backgroundColor: `color-mix(in srgb, ${PHASE_COLORS[phase]} 18%, transparent)`,
            color: PHASE_COLORS[phase],
            borderColor: PHASE_COLORS[phase],
            height: 22,
          }}
        >
          {PHASE_LABELS[phase]}
        </Badge>
        {story.archived_at && (
          <Badge variant="secondary" className="inline-flex items-center gap-1">
            <Archive size={12} /> Archived
          </Badge>
        )}
      </div>

      {/* Approve & dispatch */}
      {showApproveCard && (
        <div className="border border-border rounded p-3 flex flex-col gap-2">
          <p className="text-sm font-semibold">Approve for Claude routine</p>
          <p className="text-xs text-muted-foreground">
            A human review is required before any code-changing routine runs.
            Approving creates a queued run with the prompt below; the active runner ({runner}) executes it.
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={handleEdit} className="self-start">
                {editing ? 'Editing prompt' : 'Show / edit prompt'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show / edit the generated prompt</TooltipContent>
          </Tooltip>
          {editing && (
            <Textarea
              rows={6}
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              className="font-mono"
            />
          )}
          <div className="flex gap-2 items-center flex-wrap">
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={approving}
              data-testid="approve-for-claude"
            >
              {approving ? 'Approving…' : 'Approve for Claude routine'}
            </Button>
            <Input
              placeholder="Needs more context (reason)"
              value={followupReason}
              onChange={(e) => setFollowupReason(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleNeedsFollowup}
              disabled={!followupReason.trim() || markFollowup.isPending}
              className="text-yellow-600 border-yellow-600"
            >
              <ShieldAlert size={14} className="mr-1" />
              Needs more context
            </Button>
          </div>
        </div>
      )}

      {/* Dispatch */}
      {showDispatchCard && (
        <div className="border border-border rounded p-3 flex flex-col gap-2">
          <p className="text-sm font-semibold inline-flex items-center gap-1">
            <Sparkles size={12} /> Dispatch routine
          </p>
          {story.needs_followup_reason && (
            <p className="text-xs text-yellow-600">
              Needs more context: {story.needs_followup_reason}
            </p>
          )}
          <div className="flex gap-2 items-center flex-wrap">
            <Select value={runner} onValueChange={(v) => setRunner(v as RoutineRunner)}>
              <SelectTrigger className="min-w-[160px] w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RUNNERS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleDispatch}
              disabled={dispatching}
              data-testid="dispatch-routine"
            >
              {dispatching ? 'Dispatching…' : 'Dispatch'}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleEdit}>
              {editing ? 'Editing prompt' : 'Edit prompt'}
            </Button>
          </div>
          {editing && (
            <Textarea
              rows={6}
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              className="font-mono"
            />
          )}
        </div>
      )}

      {/* Active run */}
      {showRunCard && latestRun && (
        <RoutineRunCard
          run={latestRun}
          retests={retests.data ?? []}
          onCancel={handleCancel}
          onStartRetest={handleRetest}
          cancelling={cancelling}
          retesting={retesting}
        />
      )}

      {/* Verify */}
      {showVerifyCard && latestRun && latestRetest && (
        <div
          className="border border-green-600 rounded p-3 flex flex-col gap-2"
          data-testid="verify-card"
        >
          <p className="text-sm font-semibold">Ready for verification</p>
          <p className="text-xs text-muted-foreground">Original: {story.title}</p>
          <p className="text-xs">Fix: {latestRun.fix_summary ?? '—'}</p>
          <p className="text-xs text-green-600">
            Retest ({latestRetest.kind}): passed
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={handleResolve}
              disabled={verifying}
              data-testid="verify-resolved"
            >
              Resolve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReopen}
              disabled={verifying}
              className="text-yellow-600 border-yellow-600"
            >
              <RotateCcw size={14} className="mr-1" />
              Reopen
            </Button>
          </div>
        </div>
      )}

      {/* Archive */}
      {showArchiveCard && (
        <div className="border border-border rounded p-3 flex flex-col gap-2">
          <p className="text-sm font-semibold">Archive</p>
          <p className="text-xs text-muted-foreground">
            Resolved stories can be archived for auditability. Archived stories
            stay searchable but are hidden from the default kanban.
          </p>
          <div className="flex gap-2 items-center flex-wrap">
            <Input
              placeholder="Reason (optional)"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleArchive}
              disabled={archiving}
              data-testid="archive-story"
            >
              <Archive size={14} className="mr-1" />
              Archive
            </Button>
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

interface RunCardProps {
  run: FeedbackRoutineRun;
  retests: FeedbackRetestRun[];
  onCancel: () => void;
  onStartRetest: (kind: RetestKind) => void;
  cancelling: boolean;
  retesting: boolean;
}

function RoutineRunCard({ run, retests, onCancel, onStartRetest, cancelling, retesting }: RunCardProps) {
  const inFlight = run.status === 'queued' || run.status === 'dispatched' || run.status === 'in_progress';
  const failed = run.status === 'failed';
  return (
    <div className="border border-border rounded p-3 flex flex-col gap-2" data-testid="routine-run-card">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold">Run · {run.runner}</span>
        <Badge variant="secondary" style={{ height: 20, fontSize: '0.7rem' }}>{run.status}</Badge>
        {run.external_ref && (
          <Badge variant="secondary" style={{ height: 20, fontSize: '0.7rem', fontFamily: 'monospace' }}>
            {run.external_ref}
          </Badge>
        )}
        {run.pr_url && (
          <a
            href={run.pr_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink size={12} /> PR
          </a>
        )}
      </div>

      {inFlight && (
        <div className="h-[3px] bg-muted overflow-hidden">
          <div className="h-full w-1/3 bg-primary animate-pulse" />
        </div>
      )}

      {run.fix_summary && (
        <p className="text-xs whitespace-pre-wrap">{run.fix_summary}</p>
      )}
      {run.confidence && (
        <Badge
          variant={run.confidence === 'high' ? 'default' : run.confidence === 'low' ? 'destructive' : 'secondary'}
          className="self-start"
          style={{ height: 20 }}
        >
          {`Confidence: ${run.confidence}`}
        </Badge>
      )}
      {run.risks && (
        <p className="text-xs text-yellow-600 flex gap-1 items-center">
          <AlertTriangle size={12} /> {run.risks}
        </p>
      )}
      {run.files_changed && run.files_changed.length > 0 && (
        <div className="flex flex-col gap-px">
          {run.files_changed.map((f) => (
            <span key={f} className="text-xs font-mono">{f}</span>
          ))}
        </div>
      )}
      {failed && run.error && (
        <p className="text-xs text-destructive">{run.error}</p>
      )}

      <div className="flex gap-2 items-center flex-wrap">
        {inFlight && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            disabled={cancelling}
            className="text-yellow-600 border-yellow-600"
          >
            Cancel
          </Button>
        )}
        {run.status === 'fix_proposed' &&
          RETEST_KINDS.map((k) => (
            <Button
              key={k}
              size="sm"
              variant="outline"
              onClick={() => onStartRetest(k)}
              disabled={retesting}
              data-testid={`retest-${k}`}
            >
              <RefreshCcw size={12} className="mr-1" />
              {k}
            </Button>
          ))}
      </div>

      {retests.length > 0 && (
        <div className="flex flex-col gap-1 mt-1" data-testid="retests-list">
          {retests.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-xs">{r.kind}</span>
              <Badge
                variant={
                  r.status === 'passed'
                    ? 'default'
                    : r.status === 'failed' || r.status === 'error'
                      ? 'destructive'
                      : 'secondary'
                }
                style={{ height: 18, fontSize: '0.65rem' }}
              >
                {r.status}
              </Badge>
              {typeof r.result?.log_excerpt === 'string' && (
                <span className="text-xs text-muted-foreground flex-1">
                  {(r.result.log_excerpt as string).slice(0, 140)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
