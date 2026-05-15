import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { type ReactNode } from "react";

export type AdminFilterOption = { label: string; value: string };

export type AdminFilterDef = {
  kind: "select";
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: AdminFilterOption[];
  width?: string;
};

export interface AdminFilterBarProps {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: AdminFilterDef[];
  bulk?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  sticky?: boolean;
}

export function AdminFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters = [],
  bulk,
  trailing,
  className,
  sticky = true,
}: AdminFilterBarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b bg-background px-4 h-12",
        sticky && "sticky top-0 z-10",
        className,
      )}
    >
      {onSearchChange && (
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8 rounded-element h-8"
          />
        </div>
      )}
      {filters.map((f) => (
        <Select key={f.key} value={f.value} onValueChange={f.onChange}>
          <SelectTrigger
            className="rounded-element h-8"
            style={{ width: f.width ?? "160px" }}
            aria-label={f.label}
          >
            <SelectValue placeholder={f.label} />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {trailing}
      {bulk && <div className="ml-auto flex items-center gap-2">{bulk}</div>}
    </div>
  );
}
