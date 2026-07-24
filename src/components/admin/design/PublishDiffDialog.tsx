import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { contrastVerdict, hslChannelsToCss, parseHslChannels } from '@/lib/wcagContrast';
import { CONTRAST_PAIRS, flattenBrandingDoc, pruneDoc, resolveColor } from './tokenCatalog';
import type { DesignSettingsController } from './useDesignSettings';

function ValueCell({ path, value }: { path: string; value: string | undefined }) {
  const isColor = path.startsWith('tokens.') && value !== undefined && parseHslChannels(value) !== null;
  return (
    <span className="inline-flex items-center gap-2">
      {isColor && (
        <span
          className="inline-block h-4 w-4 rounded-badge border align-middle"
          style={{ backgroundColor: hslChannelsToCss(value!) }}
          aria-hidden
        />
      )}
      <span className="font-mono text-13">{value ?? <span className="text-muted-foreground">default</span>}</span>
    </span>
  );
}

export function PublishDiffDialog({
  controller,
  open,
  onOpenChange,
}: {
  controller: DesignSettingsController;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [note, setNote] = useState('');
  const [ackContrast, setAckContrast] = useState(false);

  // Hard accessibility gate: pairs below 3:1 (fail even the large-text bar)
  // in the DRAFT block publish unless explicitly acknowledged.
  const contrastHardFails = useMemo(
    () =>
      CONTRAST_PAIRS.flatMap((pair) =>
        (['light', 'dark'] as const).flatMap((mode) => {
          const v = contrastVerdict(
            resolveColor(controller.draft, pair.fg, mode),
            resolveColor(controller.draft, pair.bg, mode),
          );
          return v && !v.aaLarge ? [{ label: pair.label, mode, ratio: v.ratio }] : [];
        }),
      ),
    [controller.draft],
  );

  const changes = useMemo(() => {
    const published = flattenBrandingDoc(pruneDoc(controller.row?.published ?? {}));
    const draft = flattenBrandingDoc(pruneDoc(controller.draft));
    const paths = [...new Set([...Object.keys(published), ...Object.keys(draft)])].sort();
    return paths
      .filter((p) => published[p] !== draft[p])
      .map((p) => ({ path: p, from: published[p], to: draft[p] }));
  }, [controller.row, controller.draft]);

  const publish = async () => {
    await controller.publish.mutateAsync(note);
    setNote('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publish branding changes</DialogTitle>
          <DialogDescription>
            {changes.length === 0
              ? 'Draft matches the published version — nothing to publish.'
              : `${changes.length} value${changes.length === 1 ? '' : 's'} will change on queer.guide within ~60 seconds.`}
          </DialogDescription>
        </DialogHeader>
        {changes.length > 0 && (
          <div className="max-h-80 overflow-y-auto rounded-element border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Draft</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.map((c) => (
                  <TableRow key={c.path}>
                    <TableCell className="font-mono text-13">{c.path}</TableCell>
                    <TableCell>
                      <ValueCell path={c.path} value={c.from} />
                    </TableCell>
                    <TableCell>
                      <ValueCell path={c.path} value={c.to} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {contrastHardFails.length > 0 && (
          <div className="space-y-2 rounded-element border border-destructive p-4">
            <p className="text-13 font-medium text-destructive">
              {contrastHardFails.length} contrast pair{contrastHardFails.length === 1 ? '' : 's'}{' '}
              below 3:1 — fails WCAG even for large text:
            </p>
            <ul className="text-13 text-muted-foreground">
              {contrastHardFails.map((f) => (
                <li key={`${f.label}-${f.mode}`}>
                  {f.label} · {f.mode}: {f.ratio}:1
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ack-contrast"
                checked={ackContrast}
                onCheckedChange={(v) => setAckContrast(v === true)}
              />
              <Label htmlFor="ack-contrast" className="text-13">
                Publish anyway — I understand this harms readability
              </Label>
            </div>
          </div>
        )}
        <Input
          placeholder="Version note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={publish}
            disabled={
              changes.length === 0 ||
              controller.publish.isPending ||
              (contrastHardFails.length > 0 && !ackContrast)
            }
          >
            {controller.publish.isPending ? 'Publishing…' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
