import { TransitIcon } from './TransitIcon';
import type { TransitIconName } from './transitIconPaths';
/**
 * Bind a transit icon to a component with a lucide-compatible signature
 * ({size?, className?}), so config that stores an icon COMPONENT — the nav
 * tables in src/config/navigation.ts — can hold a transit icon without every
 * render site learning a second calling convention.
 *
 * The alternative was storing a name string in config and branching at each of
 * the ~8 render sites; that spreads the icon system's identity across the app
 * instead of keeping it here.
 */
export function transitIcon(name: TransitIconName) {
  const Bound = ({ size, className }: { size?: number; className?: string }) => (
    <TransitIcon name={name} size={size} className={className} />
  );
  Bound.displayName = `TransitIcon(${name})`;
  return Bound;
}
