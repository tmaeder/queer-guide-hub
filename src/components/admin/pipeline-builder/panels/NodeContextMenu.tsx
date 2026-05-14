import { useEffect, useRef } from 'react';
import { Copy, Trash2, Settings, ClipboardCopy, ClipboardPaste } from 'lucide-react';

interface NodeContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  onClose: () => void;
  onDuplicate: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onConfigure: (nodeId: string) => void;
  onCopyConfig: (nodeId: string) => void;
  onPasteConfig: (nodeId: string) => void;
  canPaste: boolean;
}

interface MenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  separator?: never;
}

type MenuEntry = MenuItem | { separator: true };

export default function NodeContextMenu({
  x,
  y,
  nodeId,
  onClose,
  onDuplicate,
  onDelete,
  onConfigure,
  onCopyConfig,
  onPasteConfig,
  canPaste,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  const mod = isMac ? '⌘' : 'Ctrl';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Delay to avoid catching the same click that opened the menu
    const t = setTimeout(() => window.addEventListener('mousedown', handler), 10);
    window.addEventListener('keydown', escHandler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escHandler);
    };
  }, [onClose]);

  const entries: MenuEntry[] = [
    { label: 'Configure', icon: Settings, onClick: () => { onConfigure(nodeId); onClose(); } },
    { separator: true },
    { label: 'Duplicate', icon: Copy, onClick: () => { onDuplicate(nodeId); onClose(); }, shortcut: `${mod}D` },
    { label: 'Copy config', icon: ClipboardCopy, onClick: () => { onCopyConfig(nodeId); onClose(); } },
    { label: 'Paste config', icon: ClipboardPaste, onClick: () => { onPasteConfig(nodeId); onClose(); }, disabled: !canPaste },
    { separator: true },
    { label: 'Delete', icon: Trash2, onClick: () => { onDelete(nodeId); onClose(); }, shortcut: 'Del', destructive: true },
  ];

  // Clamp position so menu doesn't overflow viewport (approx)
  const width = 200;
  const height = 220;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.min(x, vw - width - 8);
  const top = Math.min(y, vh - height - 8);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 bg-popover text-popover-foreground border border-border rounded-md shadow-lg py-1 text-sm"
      style={{ left, top, minWidth: width }}
    >
      {entries.map((entry, i) => {
        if ('separator' in entry) {
          return <div key={i} className="h-px bg-border my-1" />;
        }
        const Icon = entry.icon;
        return (
          <button
            key={i}
            role="menuitem"
            onClick={entry.onClick}
            disabled={entry.disabled}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              entry.destructive
                ? 'text-destructive hover:bg-destructive/10'
                : 'hover:bg-accent'
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{entry.label}</span>
            {entry.shortcut && (
              <kbd className="text-2xs text-muted-foreground font-mono">{entry.shortcut}</kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}
