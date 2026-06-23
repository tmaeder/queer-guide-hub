import { Link } from 'react-router';
import type { PeopleMatchShared } from '@/hooks/usePeopleDiscovery';
import { SignalChips } from './SignalChips';

export interface PersonCardData {
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  score?: number;
  shared?: PeopleMatchShared;
}

/**
 * Thin person card for the people rails. Monochrome, links to the public
 * profile. Shows an optional compatibility badge + the "why you matched"
 * signal chips.
 */
export function PersonCard({ person, fullWidth = false }: { person: PersonCardData; fullWidth?: boolean }) {
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
        <SignalChips shared={person.shared} className="mt-1.5" max={2} />
      </div>
    </Link>
  );
}
