import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { Search } from "lucide-react"

import { Dialog, DialogContent } from "@/components/ui/dialog"

/* ── Inline styles replacing Tailwind classes ────────────────────────── */

const cmdkStyles = {
  command: {
    display: 'flex',
    height: '100%',
    width: '100%',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  list: {
    maxHeight: 300,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  empty: {
    paddingTop: 24,
    paddingBottom: 24,
    textAlign: 'center' as const,
    fontSize: '0.875rem',
  },
  group: {
    overflow: 'hidden',
    padding: 4,
  },
  item: {
    position: 'relative' as const,
    display: 'flex',
    cursor: 'default',
    userSelect: 'none' as const,
    alignItems: 'center',
    padding: '6px 8px',
    fontSize: '0.875rem',
    outline: 'none',
    borderRadius: 4,
  },
  separator: {
    marginLeft: -4,
    marginRight: -4,
    height: 1,
    backgroundColor: 'hsl(var(--border))',
  },
  shortcut: {
    marginLeft: 'auto',
    fontSize: '0.75rem',
    letterSpacing: '0.1em',
    color: 'hsl(var(--muted-foreground))',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid hsl(var(--border))',
    padding: '0 12px',
  },
  inputIcon: {
    marginRight: 8,
    height: 16,
    width: 16,
    flexShrink: 0,
    opacity: 0.5,
  },
  input: {
    display: 'flex',
    height: 44,
    width: '100%',
    background: 'transparent',
    padding: '12px 0',
    fontSize: '0.875rem',
    outline: 'none',
    border: 'none',
  },
} as const;

/* ── Global CSS for cmdk data-attribute states ───────────────────────── */
const CmdkGlobalStyles = () => (
  <style>{`
    [cmdk-item][data-selected='true'] {
      background-color: hsl(var(--accent));
      color: hsl(var(--accent-foreground));
    }
    [cmdk-item][data-disabled='true'] {
      opacity: 0.5;
      pointer-events: none;
    }
    [cmdk-group-heading] {
      padding: 6px 8px;
      font-size: 0.75rem;
      font-weight: 500;
      color: hsl(var(--muted-foreground));
    }
  `}</style>
);

function mergeStyles(
  base: React.CSSProperties,
  extra?: React.CSSProperties
): React.CSSProperties {
  return extra ? { ...base, ...extra } : base;
}

/* ── Components ──────────────────────────────────────────────────────── */

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, style, ...props }, ref) => (
  <>
    <CmdkGlobalStyles />
    <CommandPrimitive
      ref={ref}
      className={className}
      style={mergeStyles(cmdkStyles.command, style)}
      {...props}
    />
  </>
))
Command.displayName = CommandPrimitive.displayName

interface CommandDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent style={{ overflow: 'hidden', padding: 0 }}>
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  )
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, style, ...props }, ref) => (
  <div style={cmdkStyles.inputWrapper} cmdk-input-wrapper="">
    <Search style={cmdkStyles.inputIcon} />
    <CommandPrimitive.Input
      ref={ref}
      className={className}
      style={mergeStyles(cmdkStyles.input, style)}
      {...props}
    />
  </div>
))

CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, style, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={className}
    style={mergeStyles(cmdkStyles.list, style)}
    {...props}
  />
))

CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ style, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    style={mergeStyles(cmdkStyles.empty, style)}
    {...props}
  />
))

CommandEmpty.displayName = CommandPrimitive.Empty.displayName

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, style, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={className}
    style={mergeStyles(cmdkStyles.group, style)}
    {...props}
  />
))

CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, style, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={className}
    style={mergeStyles(cmdkStyles.separator, style)}
    {...props}
  />
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, style, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={className}
    style={mergeStyles(cmdkStyles.item, style)}
    {...props}
  />
))

CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandShortcut = ({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={className}
      style={mergeStyles(cmdkStyles.shortcut, style)}
      {...props}
    />
  )
}
CommandShortcut.displayName = "CommandShortcut"

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
