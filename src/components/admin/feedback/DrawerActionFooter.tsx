import { Ban, Copy, RotateCcw } from 'lucide-react';
import { Github } from '@/components/icons/brand';
import { Button } from '@/components/ui/button';

interface Props {
  isSpam: boolean;
  isForwarded: boolean;
  isForwarding: boolean;
  githubIssueUrl: string | null;
  githubIssueNumber: number | null;
  notifySubmitter: boolean;
  hasContactEmail: boolean;
  onToggleSpam: (isSpam: boolean) => void;
  onToggleNotify: (notify: boolean) => void;
  onCopyPrompt: () => void;
  onForward: () => void;
}

export function DrawerActionFooter({
  isSpam,
  isForwarded,
  isForwarding,
  githubIssueUrl,
  githubIssueNumber,
  notifySubmitter,
  hasContactEmail,
  onToggleSpam,
  onToggleNotify,
  onCopyPrompt,
  onForward,
}: Props) {
  return (
    <div
      className="sticky bottom-0 bg-background border-t border-border -mx-6 px-6 py-3 mt-auto"
      style={{ zIndex: 10 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <input
          id="notify-submitter-toggle"
          type="checkbox"
          checked={notifySubmitter}
          onChange={(e) => onToggleNotify(e.target.checked)}
          style={{ margin: 0 }}
        />
        <label
          htmlFor="notify-submitter-toggle"
          style={{ fontSize: '0.7rem', cursor: 'pointer', flex: 1 }}
          className="text-muted-foreground"
        >
          Email on status change
          {!hasContactEmail && (
            <span style={{ marginLeft: 4 }}>(no email)</span>
          )}
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {isSpam ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onToggleSpam(false)}
            className="gap-1.5"
          >
            <RotateCcw style={{ width: 12, height: 12 }} />
            Restore
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onToggleSpam(true)}
            title="Mark as spam"
            className="gap-1.5"
          >
            <Ban style={{ width: 12, height: 12 }} />
            Spam
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={onCopyPrompt}
          title="Copy prompt only (no handoff entry)"
          className="gap-1.5"
        >
          <Copy style={{ width: 12, height: 12 }} />
          Copy
        </Button>

        {isForwarded ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(githubIssueUrl!, '_blank', 'noopener,noreferrer')
            }
            className="gap-1.5"
          >
            <Github style={{ width: 12, height: 12 }} />
            #{githubIssueNumber}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={onForward}
            disabled={isForwarding}
            title="Open GitHub issue with @claude mention"
            className="gap-1.5"
          >
            <Github style={{ width: 12, height: 12 }} />
            {isForwarding ? 'Forwarding…' : 'GitHub'}
          </Button>
        )}
      </div>
    </div>
  );
}
