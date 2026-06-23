import { Link } from 'react-router';
import type { PeopleMatchShared } from '@/hooks/usePeopleDiscovery';

export interface PersonCardData {
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  score?: number;
  shared?: PeopleMatchShared;
}

/** Build a short, factual "why" line from the shared-signal counts. */
function sharedReason(shared?: PeopleMatchShared): string | null {
  if (!shared) return null;
  const parts: string[] = [];
  if (shared.mutual_friends) parts.push(`${shared.mutual_friends} mutual friend${shared.mutual_friends === 1 ? '' : 's'}`);
  if (shared.shared_events) parts.push(`${shared.shared_events} shared event${shared.shared_events === 1 ? '' : 's'}`);
  if (shared.mutual_groups) parts.push(`${shared.mutual_groups} shared group${shared.mutual_groups === 1 ? '' : 's'}`);
  return parts.length ? parts.slice(0, 2).join(' · ') : null;
}

/**
 * Thin person card for the people rails. Monochrome, links to the public
 * profile. Shows an optional compatibility badge + factual "why" line.
 */
export function PersonCard({ person, fullWidth = false }: { person: PersonCardData; fullWidth?: boolean }) {
  const reason = sharedReason(person.shared);
  return (
    <Link
      to={`/user/${person.userId}`}
      className={`flex flex-col gap-2 rounded-element border border-border p-4 transition-colors hover:bg-muted/40 ${
        fullWidth ? 'w-full' : 'w-40 shrink-0'
      }`}
    >
      {person.avatarUrl ? (
        <img
          src={person.avatarUrl}
          alt=""
          className="h-16 w-16 rounded-full object-cover"
        />
      ) : (
        <div className="h-16 w-16 rounded-full bg-muted" aria-hidden />
      )}
      <div className="min-w-0">
        <div className="truncate text-15 font-medium">{person.displayName ?? 'Member'}</div>
        {typeof person.score === 'number' && person.score > 0 ? (
          <div className="mt-1 inline-block rounded-badge bg-muted px-1.5 py-0.5 text-2xs uppercase tracking-wide text-muted-foreground">
            {person.score}% match
          </div>
        ) : null}
        {reason ? (
          <div className="mt-1 truncate text-xs text-muted-foreground">{reason}</div>
        ) : null}
      </div>
    </Link>
  );
}
