import { ArrowLeft, Command as CommandIcon, Upload, Boxes, Workflow } from 'lucide-react';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';

interface CanvasEmptyStateProps {
  onOpenCommandPalette: () => void;
  onOpenTemplateLibrary: () => void;
  onImport: () => void;
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const MOD = isMac ? '⌘' : 'Ctrl';

export default function CanvasEmptyState({
  onOpenCommandPalette,
  onOpenTemplateLibrary,
  onImport,
}: CanvasEmptyStateProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <AdminEmpty
        noun="nodes"
        icon={Workflow}
        description="Drag nodes from the palette, connect them to define your data flow, then save and run."
        className="max-w-md pointer-events-auto py-8"
        action={
          <>
            <div className="grid grid-cols-1 gap-2 text-left">
              <button
                onClick={onOpenCommandPalette}
                className="flex items-center gap-4 p-4 rounded-element border border-border bg-background hover:bg-accent transition-colors"
              >
                <CommandIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Quick-add a node</div>
                  <div className="text-xs2 text-muted-foreground">
                    Search and insert any node type
                  </div>
                </div>
                <kbd className="text-2xs font-mono bg-muted px-1.5 py-0.5 rounded-badge">
                  {MOD}K
                </kbd>
              </button>

              <button
                onClick={onOpenTemplateLibrary}
                className="flex items-center gap-4 p-4 rounded-element border border-border bg-background hover:bg-accent transition-colors"
              >
                <Boxes className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Apply a template</div>
                  <div className="text-xs2 text-muted-foreground">
                    Start from a reusable DAG fragment
                  </div>
                </div>
              </button>

              <button
                onClick={onImport}
                className="flex items-center gap-4 p-4 rounded-element border border-border bg-background hover:bg-accent transition-colors"
              >
                <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Import from JSON</div>
                  <div className="text-xs2 text-muted-foreground">Upload an exported pipeline</div>
                </div>
              </button>
            </div>
            <div className="flex items-center gap-2 mt-6 text-xs2 text-muted-foreground">
              <ArrowLeft className="h-3 w-3" />
              <span>Or drag a node from the palette</span>
            </div>
          </>
        }
      />
    </div>
  );
}
