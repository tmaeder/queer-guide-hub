/**
 * AdminAreaHint — a thin one-line "what is this area" strip rendered under the
 * breadcrumb in AdminShell, plus a clickable ⌘K affordance for discovering the
 * command palette. A single insertion point gives all admin areas an inline
 * description (from adminAreaDescriptions) without touching each page — the
 * cheap antidote to tribal knowledge for a growing team.
 */
import { useLocation } from 'react-router';
import { getAreaDescription } from '@/config/adminAreaDescriptions';
import { openAdminCommandPalette } from '@/components/admin/command-palette/commandPaletteBus';

export function AdminAreaHint() {
  const { pathname } = useLocation();
  const description = getAreaDescription(pathname);
  if (!description) return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border bg-muted/30 px-4 py-2 sm:px-6">
      <p className="text-2xs text-muted-foreground">{description}</p>
      <button
        type="button"
        onClick={openAdminCommandPalette}
        className="flex-shrink-0 rounded-badge border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Open command palette"
      >
        ⌘K
      </button>
    </div>
  );
}
