import { useState, useEffect } from 'react';
import {
  Rocket, Boxes, History, Command as CommandIcon,
  Save, Play, ArrowRight, CheckCircle2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'pipeline-builder-tour-seen-v1';
const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const MOD = isMac ? '⌘' : 'Ctrl';

const STEPS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
}> = [
  {
    icon: Rocket,
    title: 'Welcome to the Pipeline Builder',
    description: (
      <>
        <p className="mb-3">This is a visual DAG editor for your data pipelines. Build flows by dragging node types from the left palette onto the canvas, then connect them to define the data path.</p>
        <p>A quick tour of the most powerful features takes about 30 seconds. Click <strong>Next</strong> to continue or <strong>Skip</strong> to jump straight in.</p>
      </>
    ),
  },
  {
    icon: CommandIcon,
    title: 'Keyboard-first workflow',
    description: (
      <div className="space-y-2">
        <p>Everything you do is reachable from the keyboard:</p>
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2"><kbd className="h-5 px-1.5 bg-muted rounded border border-border font-mono text-xs2">{MOD}K</kbd> Quick-add a node</li>
          <li className="flex items-center gap-2"><kbd className="h-5 px-1.5 bg-muted rounded border border-border font-mono text-xs2">{MOD}F</kbd> Find node on canvas</li>
          <li className="flex items-center gap-2"><kbd className="h-5 px-1.5 bg-muted rounded border border-border font-mono text-xs2">{MOD}S</kbd> Save</li>
          <li className="flex items-center gap-2"><kbd className="h-5 px-1.5 bg-muted rounded border border-border font-mono text-xs2">{MOD}Enter</kbd> Run</li>
          <li className="flex items-center gap-2"><kbd className="h-5 px-1.5 bg-muted rounded border border-border font-mono text-xs2">{MOD}Z</kbd> / <kbd className="h-5 px-1.5 bg-muted rounded border border-border font-mono text-xs2">{MOD}L</kbd> Undo / Auto-layout</li>
          <li className="flex items-center gap-2"><kbd className="h-5 px-1.5 bg-muted rounded border border-border font-mono text-xs2">?</kbd> Full cheat sheet</li>
        </ul>
      </div>
    ),
  },
  {
    icon: Save,
    title: 'Never lose work',
    description: (
      <div className="space-y-2">
        <p>Changes auto-save to a local draft every 2 seconds. If you close the tab accidentally, you'll be prompted to restore it.</p>
        <p>An <strong>unsaved</strong> badge shows when your canvas differs from the saved version. The <strong>diff icon</strong> opens a full comparison view.</p>
      </div>
    ),
  },
  {
    icon: Play,
    title: 'Safe runs',
    description: (
      <div className="space-y-2">
        <p>Use <strong>Dry Run</strong> to test your pipeline without writing to production tables. The dry-run mode skips commits.</p>
        <p>Pipelines with a <code className="bg-muted px-1 rounded text-xs2">commit</code> node show a confirmation prompt before running for real.</p>
      </div>
    ),
  },
  {
    icon: Boxes,
    title: 'Templates save time',
    description: (
      <div className="space-y-2">
        <p>Shift-click to select multiple nodes, then click <strong>Save as template</strong> in the multi-select toolbar. Your template becomes reusable across all future pipelines.</p>
        <p>Browse the full library from the Templates button in the toolbar.</p>
      </div>
    ),
  },
  {
    icon: History,
    title: 'Time travel',
    description: (
      <div className="space-y-2">
        <p>Every save creates a snapshot you can revert to. Click the <strong>history icon</strong> to browse versions and jump back to any prior state.</p>
        <p>The <strong>Run History sidebar</strong> (right side) lets you click any past run to overlay its node-by-node status on the canvas.</p>
      </div>
    ),
  },
  {
    icon: CheckCircle2,
    title: "You're ready",
    description: (
      <>
        <p className="mb-3">That's the core loop. Open the <kbd className="h-5 px-1.5 bg-muted rounded border border-border font-mono text-xs2">?</kbd> cheat sheet anytime to see the full list of shortcuts.</p>
        <p className="text-muted-foreground text-sm">This tour won't show again. You can relaunch it from the keyboard shortcuts dialog footer.</p>
      </>
    ),
  },
];

export default function OnboardingTour({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setStep(0);
      return;
    }
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setOpen(true);
      }
    } catch { /* ignore */ }
  }, [forceOpen]);

  const markSeen = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  };

  const handleClose = () => {
    markSeen();
    setOpen(false);
    onClose?.();
  };

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            {current.title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="pt-2 text-sm text-foreground">{current.description}</div>
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-2">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`transition-all rounded-full ${
                i === step ? 'w-5 h-1.5 bg-primary' : 'w-1.5 h-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/60'
              }`}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row sm:justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep(step + 1)}>
                Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleClose}>
                Get started
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
