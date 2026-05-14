import { memo, useState, useRef, useEffect } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { Folder, Palette } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface GroupNodeData {
  label?: string;
  color?: string;
}

const COLORS = [
  { name: 'indigo', bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.4)', accent: '#6366f1' },
  { name: 'emerald', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.4)', accent: '#10b981' },
  { name: 'rose', bg: 'rgba(244, 63, 94, 0.08)', border: 'rgba(244, 63, 94, 0.4)', accent: '#f43f5e' },
  { name: 'amber', bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.4)', accent: '#f59e0b' },
  { name: 'slate', bg: 'rgba(100, 116, 139, 0.08)', border: 'rgba(100, 116, 139, 0.4)', accent: '#64748b' },
];

function GroupNode({ data, selected, id }: NodeProps) {
  const d = data as GroupNodeData;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label || 'Group');
  const [color, setColor] = useState(d.color || 'indigo');
  const inputRef = useRef<HTMLInputElement>(null);

  const scheme = COLORS.find(c => c.name === color) || COLORS[0];

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitChange = (updates: Partial<GroupNodeData>) => {
    const evt = new CustomEvent('pipeline-group-update', {
      detail: { nodeId: id, updates },
      bubbles: true,
    });
    window.dispatchEvent(evt);
  };

  return (
    <div
      className={`rounded-lg w-full h-full min-w-[200px] min-h-[120px] transition-all pointer-events-auto ${
        selected ? 'ring-2' : ''
      }`}
      style={{
        backgroundColor: scheme.bg,
        border: `2px dashed ${scheme.border}`,
        boxShadow: selected ? `0 0 0 2px ${scheme.accent}40` : undefined,
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={120}
        isVisible={selected}
        lineStyle={{ borderColor: scheme.accent }}
        handleStyle={{ background: scheme.accent, width: 8, height: 8 }}
      />

      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-md" style={{ backgroundColor: `${scheme.accent}15` }}>
        <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: scheme.accent }} />
        {editing ? (
          <input
            ref={inputRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              setEditing(false);
              commitChange({ label });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                setEditing(false);
                commitChange({ label });
              }
              e.stopPropagation();
            }}
            className="flex-1 bg-transparent text-sm font-medium focus:outline-none"
            style={{ color: scheme.accent }}
          />
        ) : (
          <span
            className="flex-1 text-sm font-medium cursor-text truncate"
            style={{ color: scheme.accent }}
            role="button"
            tabIndex={0}
            aria-label={`Edit group label: ${label}`}
            onDoubleClick={() => setEditing(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setEditing(true);
              }
            }}
          >
            {label}
          </span>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="p-0.5 rounded hover:bg-black/5 transition-colors"
              title="Change color"
              onClick={(e) => e.stopPropagation()}
            >
              <Palette className="h-3 w-3" style={{ color: scheme.accent }} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-1.5" side="top">
            <div className="flex gap-1">
              {COLORS.map(c => (
                <button
                  key={c.name}
                  className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${color === c.name ? 'ring-2 ring-ring' : ''}`}
                  style={{ backgroundColor: c.accent }}
                  onClick={() => {
                    setColor(c.name);
                    commitChange({ color: c.name });
                  }}
                  title={c.name}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export default memo(GroupNode);
