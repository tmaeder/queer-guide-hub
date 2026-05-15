import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

const TRANSITION = { type: 'spring' as const, mass: 0.5, damping: 16, stiffness: 200, restDelta: 0.001, restSpeed: 0.001 };

const MenuContext = React.createContext<{
  active: string | null;
  setActive: (s: string | null) => void;
}>({ active: null, setActive: () => {} });

interface MenuProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Aceternity-style NavbarMenu container — hover-driven dropdowns with a
 * shared `active` slot so adjacent items can smoothly cross-fade and the
 * panel reuses the same layoutId. Monochrome.
 */
export function Menu({ children, className }: MenuProps) {
  const [active, setActive] = React.useState<string | null>(null);
  return (
    <MenuContext.Provider value={{ active, setActive }}>
      <nav
        onMouseLeave={() => setActive(null)}
        className={cn('relative flex items-center gap-1', className)}
      >
        {children}
      </nav>
    </MenuContext.Provider>
  );
}

interface MenuItemProps {
  item: string;
  children?: React.ReactNode;
  href?: string;
}

export function MenuItem({ item, children }: MenuItemProps) {
  const { active, setActive } = React.useContext(MenuContext);
  const isActive = active === item;
  return (
    <div onMouseEnter={() => setActive(item)} className="relative px-3 py-2">
      <motion.span
        transition={{ duration: 0.18 }}
        className={cn(
          'cursor-pointer text-sm font-medium tracking-tight transition-colors',
          isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {item}
      </motion.span>
      <AnimatePresence>
        {isActive && children && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={TRANSITION}
            className="absolute top-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 z-50"
          >
            <motion.div
              layoutId="navbar-menu-panel"
              transition={TRANSITION}
              className="bg-background/95 backdrop-blur-md rounded-2xl overflow-hidden border border-border/60 shadow-[var(--shadow-aceternity)]"
            >
              <motion.div layout className="w-max h-full p-4">
                {children}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface HoveredLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  description?: string;
  onClick?: () => void;
}

export function HoveredLink({ href, children, className, description, onClick }: HoveredLinkProps) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        'block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
        className,
      )}
    >
      <div className="font-medium text-foreground">{children}</div>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </a>
  );
}
