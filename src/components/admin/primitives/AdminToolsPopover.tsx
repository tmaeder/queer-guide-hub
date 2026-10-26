import type { ReactNode } from 'react';
import { MoreHorizontal } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Supporting tools stay available without competing with the primary action. */
export function AdminToolsPopover({
  label = 'Tools',
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-10 gap-2">
          <MoreHorizontal size={16} aria-hidden="true" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-4">
        <div className="flex flex-col items-stretch gap-2 [&>button]:justify-start">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
