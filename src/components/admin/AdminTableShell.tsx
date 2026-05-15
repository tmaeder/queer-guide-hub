import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

export interface AdminTableColumn {
  key: string;
  label: ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
}

export interface AdminTableShellProps<T> {
  columns: AdminTableColumn[];
  rows: T[];
  getRowId: (row: T) => string;
  renderRow: (row: T) => ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: ReactNode;
  footer?: ReactNode;
  className?: string;
  rowsPerSkeleton?: number;
}

export function AdminTableShell<T>({
  columns,
  rows,
  getRowId,
  renderRow,
  loading,
  error,
  empty,
  footer,
  className,
  rowsPerSkeleton = 8,
}: AdminTableShellProps<T>) {
  const colCount = columns.length;
  return (
    <div className={cn("flex flex-col border border-border bg-background", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead
                key={c.key}
                style={{
                  width: c.width,
                  textAlign: c.align ?? "left",
                  textTransform: "uppercase",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.04em",
                }}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: rowsPerSkeleton }).map((_, i) => (
              <TableRow key={`sk-${i}`}>
                {columns.map((c) => (
                  <TableCell key={c.key}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : error ? (
            <TableRow>
              <TableCell colSpan={colCount}>
                <span className="text-sm text-destructive">{error}</span>
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount}>
                <span className="text-sm text-muted-foreground">
                  {empty ?? "No results."}
                </span>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={getRowId(row)} className="hover:bg-muted/30">
                {renderRow(row)}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {footer && (
        <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}
