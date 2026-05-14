import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { shortcutHelp } from '@/hooks/useFeedbackShortcuts';

export function ShortcutHelpDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2" style={{ gridTemplateColumns: '80px 1fr' }}>
          {shortcutHelp.map((s) => (
            <div key={s.key} style={{ display: 'contents' }}>
              <span className="font-mono text-[0.7rem] bg-muted/40 px-1.5 py-0.5 rounded text-center">
                {s.key}
              </span>
              <span className="self-center text-xs">{s.label}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
