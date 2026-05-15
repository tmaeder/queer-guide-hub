import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";

export interface DestructiveActionProps {
  label: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  icon?: ReactNode;
  disabled?: boolean;
  size?: "default" | "sm" | "icon";
  triggerClassName?: string;
  triggerLabel?: ReactNode;
}

export function DestructiveAction({
  label,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  icon,
  disabled,
  size = "sm",
  triggerClassName,
  triggerLabel,
}: DestructiveActionProps) {
  const [busy, setBusy] = useState(false);
  const iconNode = icon ?? <Trash2 className="h-4 w-4" aria-hidden />;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={disabled}
          aria-label={triggerLabel ? undefined : label}
          className={cn(
            "border-l-2 border-l-foreground bg-background text-foreground",
            "hover:bg-foreground hover:text-background",
            "rounded-element gap-2",
            triggerClassName,
          )}
        >
          {iconNode}
          {triggerLabel ?? (size === "icon" ? null : label)}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-none">
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-element" disabled={busy}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              try {
                setBusy(true);
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-element"
          >
            {busy ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
