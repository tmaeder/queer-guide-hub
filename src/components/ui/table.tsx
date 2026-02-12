import * as React from "react"

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, style, ...props }, ref) => (
    <div style={{ position: 'relative', width: '100%', overflow: 'auto' }}>
      <table ref={ref} className={className} style={{ width: '100%', captionSide: 'bottom', fontSize: '0.875rem', borderCollapse: 'collapse', ...style }} {...props} />
    </div>
  )
);
Table.displayName = "Table"

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, style, ...props }, ref) => (
    <thead ref={ref} className={className} style={style} {...props} />
  )
);
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, style, ...props }, ref) => (
    <tbody ref={ref} className={className} style={style} {...props} />
  )
);
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, style, ...props }, ref) => (
    <tfoot ref={ref} className={className} style={{ borderTop: '1px solid var(--border, #e4e4e7)', fontWeight: 500, ...style }} {...props} />
  )
);
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, style, ...props }, ref) => (
    <tr ref={ref} className={className} style={{ borderBottom: '1px solid var(--border, #e4e4e7)', transition: 'background-color 0.15s', ...style }} {...props} />
  )
);
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, style, ...props }, ref) => (
    <th ref={ref} className={className} style={{ height: 48, padding: '0 16px', textAlign: 'left', verticalAlign: 'middle', fontWeight: 500, color: 'var(--muted-foreground, #666)', ...style }} {...props} />
  )
);
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, style, ...props }, ref) => (
    <td ref={ref} className={className} style={{ padding: 16, verticalAlign: 'middle', ...style }} {...props} />
  )
);
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, style, ...props }, ref) => (
    <caption ref={ref} className={className} style={{ marginTop: 16, fontSize: '0.875rem', color: 'var(--muted-foreground, #666)', ...style }} {...props} />
  )
);
TableCaption.displayName = "TableCaption"

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
