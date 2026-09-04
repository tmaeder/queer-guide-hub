import type { CSSProperties } from 'react';
import { X } from 'lucide-react';

interface RemovableFilterXProps {
  onRemove: () => void;
  label: string;
  className?: string;
  style?: CSSProperties;
}

/** Keyboard-accessible remove-badge `X`. `role="button"` needs a matching
 *  tabIndex + Enter/Space handler or it's mouse-only despite the ARIA role. */
export function RemovableFilterX({ onRemove, label, className, style }: RemovableFilterXProps) {
  return (
    <X
      style={style}
      className={className}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onRemove}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRemove();
        }
      }}
    />
  );
}
