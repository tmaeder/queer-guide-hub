import * as React from 'react';

import { cn } from '@/lib/utils';

const TableVariantContext = React.createContext<'default' | 'admin'>('default');

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { variant?: 'default' | 'admin' }
>(({ className, style, variant = 'default', ...props }, ref) => (
  <TableVariantContext.Provider value={variant}>
    <div style={{ width: '100%' }} className="relative overflow-auto">
      <table
        ref={ref}
        className={cn(variant === 'admin' ? 'text-13' : 'text-sm', className)}
        style={{
          width: '100%',
          captionSide: 'bottom',
          borderCollapse: variant === 'admin' ? 'collapse' : 'separate',
          borderSpacing: variant === 'admin' ? '0' : '0 4px',
          ...style,
        }}
        {...props}
      />
    </div>
  </TableVariantContext.Provider>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, style, ...props }, ref) => (
  <thead ref={ref} className={className} style={style} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, style, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    style={style}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, style, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={className}
    // Inline style beats every class and the @layer base reset, so the footer
    // rule had to be removed here rather than in a className.
    style={{ fontWeight: 500, ...style }}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, style, ...props }, ref) => {
    const admin = React.useContext(TableVariantContext) === 'admin';
    return (
      <tr
        ref={ref}
        className={cn(
          // Rows are striped plates, not ruled lines.
          admin
            ? 'transition-colors duration-fast odd:bg-muted/30 hover:bg-muted/60 data-[state=selected]:bg-muted'
            : 'odd:[&>td]:bg-surface-container/60 odd:[&>th]:bg-surface-container/60 [&>:first-child]:rounded-l-element [&>:last-child]:rounded-r-element transition-colors duration-fast',
          className,
        )}
        style={style}
        {...props}
      />
    );
  },
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, style, ...props }, ref) => {
  const admin = React.useContext(TableVariantContext) === 'admin';
  return (
    <th
      ref={ref}
      className={cn(admin && 'text-13 font-sans', className)}
      style={{
        height: 48,
        padding: '0 16px',
        textAlign: 'left',
        verticalAlign: 'middle',
        fontWeight: admin ? 600 : 500,
        color: 'hsl(var(--muted-foreground))',
        ...style,
      }}
      {...props}
    />
  );
});
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, style, ...props }, ref) => {
  const admin = React.useContext(TableVariantContext) === 'admin';
  return (
    <td
      ref={ref}
      className={className}
      style={{ padding: admin ? '12px 16px' : 16, verticalAlign: 'middle', ...style }}
      {...props}
    />
  );
});
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, style, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('text-sm', className)}
    style={{ marginTop: 16, color: 'hsl(var(--muted-foreground))', ...style }}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
