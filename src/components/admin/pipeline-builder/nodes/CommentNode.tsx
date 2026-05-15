import { memo, useState, useRef, useEffect } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { StickyNote, Palette } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface CommentNodeData {
  text?: string;
  color?: string;
}

const COLORS = [
  { name: 'yellow', bg: '#fef9c3', border: '#facc15', text: '#713f12' },
  { name: 'blue', bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
  { name: 'green', bg: '#dcfce7', border: '#22c55e', text: '#14532d' },
  { name: 'pink', bg: '#fce7f3', border: '#ec4899', text: '#831843' },
  { name: 'gray', bg: '#f3f4f6', border: '#9ca3af', text: '#111827' },
];

function CommentNode({ data, selected, id }: NodeProps) {
  const d = data as CommentNodeData;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(d.text || '');
  const [color, setColor] = useState(d.color || 'yellow');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scheme = COLORS.find(c => c.name === color) || COLORS[0];

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  // Persist text/color back to the node data via a custom event the builder listens to
  const commitChange = (updates: Partial<CommentNodeData>) => {
    const evt = new CustomEvent('pipeline-comment-update', {
      detail: { nodeId: id, updates },
      bubbles: true,
    });
    window.dispatchEvent(evt);
  };

  return (
    <div
      className={`rounded-element shadow-sm w-full h-full min-w-[180px] min-h-[80px] transition-all ${
        selected ? 'ring-2 ring-ring' : ''
      }`}
      style={{
        backgroundColor: scheme.bg,
        border: `1px solid ${scheme.border}`,
        color: scheme.text,
      }}
    >
      <NodeResizer
        minWidth={180}
        minHeight={80}
        isVisible={selected}
        lineStyle={{ borderColor: scheme.border }}
        handleStyle={{ background: scheme.border, width: 8, height: 8 }}
      />

      <div className="flex items-center gap-1.5 px-2 py-1 border-b" style={{ borderColor: `${scheme.border}50` }}>
        <StickyNote className="h-3 w-3 opacity-60" />
        <span className="text-2xs font-medium opacity-60">comment</span>
        <div className="ml-auto">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="p-0.5 rounded hover:bg-black/5 transition-colors"
                title="Change color"
                onClick={(e) => e.stopPropagation()}
              >
                <Palette className="h-3 w-3 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-1.5" side="top">
              <div className="flex gap-1">
                {COLORS.map(c => (
                  <button
                    key={c.name}
                    className={`w-5 h-5 rounded border-2 transition-transform hover:scale-110 ${color === c.name ? 'ring-2 ring-ring' : ''}`}
                    style={{ backgroundColor: c.bg, borderColor: c.border }}
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

      <div
        className="p-2"
        role="button"
        tabIndex={0}
        aria-label="Edit comment text"
        onDoubleClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              setEditing(false);
              commitChange({ text });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditing(false);
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                setEditing(false);
                commitChange({ text });
              }
              e.stopPropagation();
            }}
            className="w-full h-full min-h-[60px] bg-transparent text-xs resize-none focus:outline-none"
            style={{ color: scheme.text }}
            placeholder="Type your note..."
          />
        ) : (
          <div className="text-xs whitespace-pre-wrap break-words cursor-text">
            {text || <span className="opacity-40 italic">Double-click to edit</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(CommentNode);
