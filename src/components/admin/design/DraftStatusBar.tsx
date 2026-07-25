import { useState } from 'react';
import { History, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PublishDiffDialog } from './PublishDiffDialog';
import { VersionHistorySheet } from './VersionHistorySheet';
import type { DesignSettingsController } from './useDesignSettings';

export function DraftStatusBar({ controller }: { controller: DesignSettingsController }) {
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [killConfirmOpen, setKillConfirmOpen] = useState(false);
  const enabled = controller.row?.overrides_enabled ?? true;

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-6 flex flex-wrap items-center gap-4 border-b bg-background px-4 py-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{controller.overrideCount} overrides</Badge>
        {controller.isDirty && <Badge>unsaved changes</Badge>}
        {!controller.isDirty && controller.hasUnpublished && (
          <Badge variant="outline">draft ahead of published</Badge>
        )}
        {controller.hasErrors && (
          <Badge variant="destructive">
            {Object.keys(controller.validationErrors).length} invalid value
            {Object.keys(controller.validationErrors).length === 1 ? '' : 's'}
          </Badge>
        )}
        {!enabled && <Badge variant="destructive">kill switch on — serving stock site</Badge>}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="mr-2 flex items-center gap-2">
          <Switch
            id="branding-enabled"
            checked={enabled}
            onCheckedChange={(next) => {
              if (!next) setKillConfirmOpen(true);
              else controller.setEnabled.mutate(true);
            }}
          />
          <Label htmlFor="branding-enabled" className="text-13 text-muted-foreground">
            Overrides live
          </Label>
        </div>
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="mr-1 h-4 w-4" /> History
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!controller.isDirty || controller.hasErrors || controller.saveDraft.isPending}
          onClick={() => controller.saveDraft.mutate()}
        >
          {controller.saveDraft.isPending ? 'Saving…' : 'Save draft'}
        </Button>
        <Button
          size="sm"
          disabled={!controller.hasUnpublished || controller.hasErrors}
          onClick={() => setPublishOpen(true)}
        >
          <Upload className="mr-1 h-4 w-4" /> Publish…
        </Button>
      </div>

      <PublishDiffDialog controller={controller} open={publishOpen} onOpenChange={setPublishOpen} />
      <VersionHistorySheet controller={controller} open={historyOpen} onOpenChange={setHistoryOpen} />
      <AlertDialog open={killConfirmOpen} onOpenChange={setKillConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off all branding overrides?</AlertDialogTitle>
            <AlertDialogDescription>
              queer.guide will serve the compiled-in defaults (stock tokens, meta, manifest, email
              branding) within ~60 seconds. The published document is kept and can be re-enabled at
              any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => controller.setEnabled.mutate(false)}>
              Serve stock site
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
