import { useState, useEffect } from 'react';
import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const MOD = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS: { category: string; items: { keys: string[]; desc: string }[] }[] = [
  {
    category: 'Pipeline',
    items: [
      { keys: [MOD, 'S'], desc: 'Save pipeline' },
      { keys: [MOD, 'Enter'], desc: 'Run pipeline' },
      { keys: ['Shift', MOD, 'Enter'], desc: 'Dry run' },
      { keys: [MOD, 'N'], desc: 'New pipeline' },
    ],
  },
  {
    category: 'Canvas',
    items: [
      { keys: [MOD, 'Z'], desc: 'Undo' },
      { keys: [MOD, 'Shift', 'Z'], desc: 'Redo' },
      { keys: [MOD, 'D'], desc: 'Duplicate selected node' },
      { keys: [MOD, 'L'], desc: 'Auto-layout' },
      { keys: [MOD, 'F'], desc: 'Find node on canvas' },
      { keys: ['Delete'], desc: 'Remove selected node' },
      { keys: ['Esc'], desc: 'Deselect / close config panel' },
      { keys: [MOD, 'Scroll'], desc: 'Zoom in/out' },
    ],
  },
  {
    category: 'Add',
    items: [
      { keys: [MOD, 'K'], desc: 'Quick-add node' },
      { keys: ['Drag'], desc: 'Drag node from palette' },
    ],
  },
  {
    category: 'Help',
    items: [
      { keys: ['?'], desc: 'Show this cheat sheet' },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded border border-border bg-muted text-xs2 font-mono font-medium">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcuts({ onTrigger }: { onTrigger?: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // '?' key (shift+/)
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
        e.preventDefault();
        setOpen(o => !o);
        onTrigger?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onTrigger]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setOpen(true)}
          >
            <Keyboard className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Keyboard shortcuts (?)</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Press <Kbd>?</Kbd> anywhere to toggle this list.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {SHORTCUTS.map(group => (
            <div key={group.category}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.category}
              </div>
              <div className="space-y-1.5">
                {group.items.map(item => (
                  <div key={item.desc} className="flex items-center justify-between gap-4 text-sm">
                    <span>{item.desc}</span>
                    <div className="flex gap-1">
                      {item.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
