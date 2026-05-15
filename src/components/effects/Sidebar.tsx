import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

interface SidebarLink {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  links: SidebarLink[];
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  defaultExpanded?: boolean;
}

/**
 * Aceternity-style Sidebar — icon-only by default, expands to show labels
 * on hover with a spring-eased width transition. Monochrome chrome.
 */
export function Sidebar({
  links,
  header,
  footer,
  className,
  defaultExpanded = false,
}: SidebarProps) {
  const [open, setOpen] = React.useState(defaultExpanded);

  return (
    <motion.aside
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      animate={{ width: open ? 240 : 64 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      className={cn(
        'h-full bg-background/95 backdrop-blur-md border-r border-border/60 flex flex-col py-4 px-3 gap-2 overflow-hidden',
        className,
      )}
    >
      {header && (
        <div className="px-1 mb-4 flex items-center">{header}</div>
      )}
      <nav className="flex-1 flex flex-col gap-1">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="group flex items-center gap-3 rounded-element px-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">{l.icon}</span>
            <AnimatePresence initial={false}>
              {open && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.12 }}
                  className="font-medium"
                >
                  {l.label}
                </motion.span>
              )}
            </AnimatePresence>
          </a>
        ))}
      </nav>
      {footer && (
        <div className="px-1 mt-2 pt-2 border-t border-border/60">{footer}</div>
      )}
    </motion.aside>
  );
}
