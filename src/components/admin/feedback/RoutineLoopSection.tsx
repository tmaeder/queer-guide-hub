import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import { Bot, Sparkles, AlertTriangle, ExternalLink, RefreshCcw, ShieldAlert, Archive, RotateCcw } from 'lucide-react';
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
    <Box data-testid="routine-loop" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Bot size={14} />
        <Typography variant="overline" sx={{ letterSpacing: 0.5 }}>
          Claude routine
        </Typography>
        <Chip
          size="small"
          label={PHASE_LABELS[phase]}
          sx={{
            bgcolor: `color-mix(in srgb, ${PHASE_COLORS[phase]} 18%, transparent)`,
            color: PHASE_COLORS[phase],
            border: `1px solid ${PHASE_COLORS[phase]}`,
            height: 22,
          }}
        />
        {story.archived_at && (
          <Chip size="small" icon={<Archive size={12} />} label="Archived" />
        )}
      </Box>

      {/* Approve & dispatch */}
      {showApproveCard && (
        <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle2">Approve for Claude routine</Typography>
          <Typography variant="caption" color="text.secondary">
            A human review is required before any code-changing routine runs.
            Approving creates a queued run with the prompt below; the active runner ({runner}) executes it.
          </Typography>
          <Tooltip title="Show / edit the generated prompt">
            <Button size="small" variant="text" onClick={handleEdit}>
              {editing ? 'Editing prompt' : 'Show / edit prompt'}
            </Button>
          </Tooltip>
          {editing && (
            <TextField
              fullWidth
              multiline
              minRows={6}
              maxRows={20}
              size="small"
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              sx={{ fontFamily: 'monospace' }}
            />
          )}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="small"
              onClick={handleApprove}
              disabled={approving}
              data-testid="approve-for-claude"
            >
              {approving ? 'Approving…' : 'Approve for Claude routine'}
            </Button>
            <TextField
              size="small"
              placeholder="Needs more context (reason)"
              value={followupReason}
              onChange={(e) => setFollowupReason(e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
            />
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<ShieldAlert size={14} />}
              onClick={handleNeedsFollowup}
              disabled={!followupReason.trim() || markFollowup.isPending}
            >
              Needs more context
            </Button>
          </Box>
        </Paper>
      )}

      {/* Dispatch — story is approved, no live run */}
      {showDispatchCard && (
        <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle2">
            <Sparkles size={12} style={{ verticalAlign: 'middle' }} /> Dispatch routine
          </Typography>
          {story.needs_followup_reason && (
            <Typography variant="caption" color="warning.main">
              Needs more context: {story.needs_followup_reason}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select
              size="small"
              value={runner}
              onChange={(e) => setRunner(e.target.value as RoutineRunner)}
              sx={{ minWidth: 160 }}
            >
              {RUNNERS.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </Select>
            <Button
              variant="contained"
              size="small"
              onClick={handleDispatch}
              disabled={dispatching}
              data-testid="dispatch-routine"
            >
              {dispatching ? 'Dispatching…' : 'Dispatch'}
            </Button>
            <Button size="small" onClick={handleEdit}>
              {editing ? 'Editing prompt' : 'Edit prompt'}
            </Button>
          </Box>
          {editing && (
            <TextField
              fullWidth
              multiline
              minRows={6}
              maxRows={20}
              size="small"
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              sx={{ fontFamily: 'monospace' }}
            />
          )}
        </Paper>
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
        <Paper
          variant="outlined"
          sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, borderColor: 'success.main' }}
          data-testid="verify-card"
        >
          <Typography variant="subtitle2">Ready for verification</Typography>
          <Typography variant="caption" color="text.secondary">
            Original: {story.title}
          </Typography>
          <Typography variant="caption">Fix: {latestRun.fix_summary ?? '—'}</Typography>
          <Typography variant="caption" color="success.main">
            Retest ({latestRetest.kind}): passed
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="small"
              onClick={handleResolve}
              disabled={verifying}
              data-testid="verify-resolved"
            >
              Resolve
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<RotateCcw size={14} />}
              onClick={handleReopen}
              disabled={verifying}
            >
              Reopen
            </Button>
          </Box>
        </Paper>
      )}

      {/* Archive */}
      {showArchiveCard && (
        <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle2">Archive</Typography>
          <Typography variant="caption" color="text.secondary">
            Resolved stories can be archived for auditability. Archived stories
            stay searchable but are hidden from the default kanban.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Reason (optional)"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
            />
            <Button
              variant="outlined"
              size="small"
              startIcon={<Archive size={14} />}
              onClick={handleArchive}
              disabled={archiving}
              data-testid="archive-story"
            >
              Archive
            </Button>
          </Box>
        </Paper>
      )}
    </Box>
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
    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }} data-testid="routine-run-card">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2">Run · {run.runner}</Typography>
        <Chip size="small" label={run.status} sx={{ height: 20, fontSize: '0.7rem' }} />
        {run.external_ref && (
          <Chip
            size="small"
            label={run.external_ref}
            sx={{ height: 20, fontSize: '0.7rem', fontFamily: 'monospace' }}
          />
        )}
        {run.pr_url && (
          <Button
            size="small"
            variant="text"
            href={run.pr_url}
            target="_blank"
            rel="noreferrer"
            startIcon={<ExternalLink size={12} />}
            sx={{ minWidth: 0 }}
          >
            PR
          </Button>
        )}
      </Box>

      {inFlight && <LinearProgress sx={{ height: 3 }} />}

      {run.fix_summary && (
        <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap' }}>
          {run.fix_summary}
        </Typography>
      )}
      {run.confidence && (
        <Chip
          size="small"
          label={`Confidence: ${run.confidence}`}
          color={run.confidence === 'high' ? 'success' : run.confidence === 'low' ? 'warning' : 'default'}
          sx={{ alignSelf: 'flex-start', height: 20 }}
        />
      )}
      {run.risks && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'flex', gap: 0.5 }}>
          <AlertTriangle size={12} /> {run.risks}
        </Typography>
      )}
      {run.files_changed && run.files_changed.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {run.files_changed.map((f) => (
            <Typography key={f} variant="caption" sx={{ fontFamily: 'monospace' }}>
              {f}
            </Typography>
          ))}
        </Box>
      )}
      {failed && run.error && (
        <Typography variant="caption" color="error.main">
          {run.error}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {inFlight && (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            onClick={onCancel}
            disabled={cancelling}
          >
            Cancel
          </Button>
        )}
        {run.status === 'fix_proposed' &&
          RETEST_KINDS.map((k) => (
            <Button
              key={k}
              size="small"
              variant="outlined"
              startIcon={<RefreshCcw size={12} />}
              onClick={() => onStartRetest(k)}
              disabled={retesting}
              data-testid={`retest-${k}`}
            >
              {k}
            </Button>
          ))}
      </Box>

      {retests.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }} data-testid="retests-list">
          {retests.map((r) => (
            <Box
              key={r.id}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.7rem' }}
            >
              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                {r.kind}
              </Typography>
              <Chip
                size="small"
                label={r.status}
                color={
                  r.status === 'passed'
                    ? 'success'
                    : r.status === 'failed' || r.status === 'error'
                      ? 'error'
                      : 'default'
                }
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
              {typeof r.result?.log_excerpt === 'string' && (
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {(r.result.log_excerpt as string).slice(0, 140)}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}
