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
import { hslChannelsToCss, parseHslChannels } from '@/lib/wcagContrast';
import { flattenBrandingDoc, pruneDoc } from './tokenCatalog';
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
          <Button onClick={publish} disabled={changes.length === 0 || controller.publish.isPending}>
            {controller.publish.isPending ? 'Publishing…' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
