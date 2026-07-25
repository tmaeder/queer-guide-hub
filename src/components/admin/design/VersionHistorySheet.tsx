import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { countOverrides } from './tokenCatalog';
import { useBrandingVersions, type DesignSettingsController } from './useDesignSettings';

export function VersionHistorySheet({
  controller,
  open,
  onOpenChange,
}: {
  controller: DesignSettingsController;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const versions = useBrandingVersions(open);
  const current = controller.row?.published_version ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>
            Reverting re-publishes an old document as a new version — nothing is destroyed.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4 overflow-y-auto">
          {versions.isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
          {versions.data?.length === 0 && (
            <p className="text-13 text-muted-foreground">No versions published yet.</p>
          )}
          {versions.data?.map((v) => (
            <div
              key={v.version}
              className="flex items-center justify-between gap-4 rounded-element border p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">v{v.version}</span>
                  {v.version === current && <Badge className="text-2xs">live</Badge>}
                  <span className="text-2xs text-muted-foreground">
                    {countOverrides(v.doc)} overrides
                  </span>
                </div>
                <p className="text-13 text-muted-foreground">
                  {new Date(v.published_at).toLocaleString()}
                  {v.note ? ` · ${v.note}` : ''}
                </p>
              </div>
              {v.version !== current && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={controller.revert.isPending}
                  onClick={() => controller.revert.mutate(v.version)}
                >
                  Revert
                </Button>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
