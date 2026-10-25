import { iconFor } from '@/components/icons';
import type { TransitIconName } from './transitIconPaths';
/**
 * Bind a transit icon to a component with a lucide-compatible signature
 * ({size?, className?}), so config that stores an icon COMPONENT — the nav
 * tables in src/config/navigation.ts — can hold a transit icon without every
 * render site learning a second calling convention. Same component the rest of
 * the site's icons are, so sizing from `className` and the size bump apply.
 */
export function transitIcon(name: TransitIconName) {
  return iconFor(name, `TransitIcon(${name})`);
}
