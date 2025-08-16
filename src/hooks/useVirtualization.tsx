import { useMemo } from 'react';

interface UseVirtualizationProps {
  items: any[];
  containerHeight: number;
  itemHeight: number;
  scrollTop: number;
  overscan?: number;
}

export function useVirtualization({
  items,
  containerHeight,
  itemHeight,
  scrollTop,
  overscan = 5,
}: UseVirtualizationProps) {
  const virtualItems = useMemo(() => {
    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    const visibleItems = [];
    for (let i = startIndex; i <= endIndex; i++) {
      visibleItems.push({
        index: i,
        item: items[i],
        offsetTop: i * itemHeight,
      });
    }

    return {
      totalHeight,
      visibleItems,
      startIndex,
      endIndex,
    };
  }, [items, containerHeight, itemHeight, scrollTop, overscan]);

  return virtualItems;
}