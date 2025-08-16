import React, { memo, ReactElement } from 'react';

interface MemoizedProps {
  children: ReactElement;
  deps?: any[];
}

// Higher-order component for memoization with custom dependencies
export const Memoized = memo<MemoizedProps>(({ children }) => {
  return children;
}, (prevProps, nextProps) => {
  // Custom equality check for deps
  if (!prevProps.deps && !nextProps.deps) return true;
  if (!prevProps.deps || !nextProps.deps) return false;
  if (prevProps.deps.length !== nextProps.deps.length) return false;
  
  return prevProps.deps.every((dep, index) => 
    Object.is(dep, nextProps.deps![index])
  );
});

// Memory-efficient list renderer
interface VirtualListProps {
  items: any[];
  renderItem: (item: any, index: number) => ReactElement;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

export const VirtualList = memo<VirtualListProps>(({
  items,
  renderItem,
  itemHeight,
  containerHeight,
  overscan = 5
}) => {
  const [scrollTop, setScrollTop] = React.useState(0);
  
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );
  
  const visibleItems = items.slice(startIndex, endIndex + 1);
  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;
  
  return (
    <div
      style={{ height: containerHeight, overflow: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => 
            renderItem(item, startIndex + index)
          )}
        </div>
      </div>
    </div>
  );
});

VirtualList.displayName = 'VirtualList';