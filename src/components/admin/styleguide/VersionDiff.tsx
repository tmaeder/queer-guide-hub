import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { lineDiff, collapseContext, diffStats } from '@/lib/lineDiff';

/**
 * What changed between a published version and the active one.
 *
 * The semver contract says MAJOR means "a rule now says the opposite of what it
 * said" — and until this existed an editor had no way to see a reversal before
 * choosing that number. They got a list of versions and a preview of the
 * current text, with nothing comparative, so the one judgement the scheme asks
 * them to make was the one the screen would not help with.
 *
 * Compares the `full` profile: it is the only one carrying rationales and
 * worked examples, so it is where a reversal is legible.
 */
export function VersionDiff({
  fromPrompt,
  toPrompt,
  fromLabel,
  toLabel,
}: {
  fromPrompt: string;
  toPrompt: string;
  fromLabel: string;
  toLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const diff = useMemo(() => lineDiff(fromPrompt, toPrompt), [fromPrompt, toPrompt]);
  const shown = useMemo(
    () => (diff ? (expanded ? diff : collapseContext(diff, 2)) : null),
    [diff, expanded],
  );

  if (!diff) {
    return (
      <p className="text-13 text-muted-foreground">
        These versions are too large to compare in the browser. Fetch both from{' '}
        <code>/api/v1/styleguide/prompt?v=…</code> and diff them locally.
      </p>
    );
  }

  const { added, removed } = diffStats(diff);
  if (added === 0 && removed === 0) {
    return (
      <p className="text-13 text-muted-foreground">
        v{fromLabel} and v{toLabel} compile to identical text.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-13 text-muted-foreground">
          v{fromLabel} &rarr; v{toLabel}
        </span>
        <Badge variant="outline">+{added}</Badge>
        <Badge variant="outline">&minus;{removed}</Badge>
        <Button variant="ghost" size="sm" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Collapse unchanged' : 'Show all lines'}
        </Button>
      </div>
      <pre className="max-h-96 overflow-auto rounded-element bg-muted p-4 text-13">
        <code>
          {shown!.map((line, i) => (
            <div
              key={i}
              className={
                line.op === 'add'
                  ? 'bg-background font-bold'
                  : line.op === 'remove'
                    ? 'text-muted-foreground line-through'
                    : 'text-muted-foreground'
              }
            >
              {/* A glyph, not colour alone: the design system requires a second
                  cue for any state, and this list is read by people deciding
                  whether a safety rule was reversed. */}
              <span aria-hidden="true">
                {line.op === 'add' ? '+ ' : line.op === 'remove' ? '- ' : '  '}
              </span>
              <span className="sr-only">
                {line.op === 'add' ? 'added: ' : line.op === 'remove' ? 'removed: ' : ''}
              </span>
              {line.text}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
