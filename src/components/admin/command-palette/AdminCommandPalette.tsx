import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from '@/components/ui/command';
import { adminNavSections } from '@/config/adminNavigation';
import { useAdminCommandActions } from './useAdminCommandActions';

const RECENT_KEY = 'admin.cmdk.recent';
const RECENT_MAX = 6;

interface RecentEntry {
  route: string;
  label: string;
  ts: number;
}

function loadRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pushRecent(entry: RecentEntry) {
  const cur = loadRecent().filter((e) => e.route !== entry.route);
  cur.unshift(entry);
  localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, RECENT_MAX)));
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminCommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { actions: contextActions } = useAdminCommandActions();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<RecentEntry[]>(() => loadRecent());

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setQuery('');
      setRecent(loadRecent());
    }
  }, [open]);

  const navItems = useMemo(() => {
    const items: { id: string; label: string; route: string; section: string }[] = [];
    for (const section of adminNavSections) {
      for (const item of section.items) {
        items.push({ id: item.id, label: item.label, route: item.route, section: section.label });
      }
    }
    return items;
  }, []);

  const go = useCallback(
    (route: string, label: string) => {
      pushRecent({ route, label, ts: Date.now() });
      onOpenChange(false);
      navigate(route);
    },
    [navigate, onOpenChange],
  );

  const runAction = useCallback(
    (fn: () => void) => {
      onOpenChange(false);
      fn();
    },
    [onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Jump to page, run action, search…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        {contextActions.length > 0 && (
          <>
            <CommandGroup heading="Actions">
              {contextActions.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.label} ${a.keywords ?? ''}`}
                  onSelect={() => runAction(a.perform)}
                >
                  <span>{a.label}</span>
                  {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {recent.length > 0 && query.length === 0 && (
          <>
            <CommandGroup heading="Recent">
              {recent.map((r) => (
                <CommandItem
                  key={r.route}
                  value={`recent ${r.label}`}
                  onSelect={() => go(r.route, r.label)}
                >
                  <span>{r.label}</span>
                  <CommandShortcut>{r.route}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Navigate">
          {navItems.map((n) => (
            <CommandItem
              key={n.id}
              value={`${n.label} ${n.section} ${n.route}`}
              onSelect={() => go(n.route, n.label)}
            >
              <span>{n.label}</span>
              <CommandShortcut>{n.section}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Provider component that owns open state + Cmd-K hotkey. */
export function AdminCommandPaletteHost() {
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  // eslint-disable-next-line react-hooks/refs -- intentional ref-during-render: latest-value mirror or one-shot render-time latch documented in nearby comments / surrounding code.
  openRef.current = open;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <AdminCommandPalette open={open} onOpenChange={setOpen} />;
}
