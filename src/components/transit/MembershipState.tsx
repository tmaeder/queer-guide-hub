import { cn } from '@/lib/utils';

/** The four states the spec names, in the order it names them. */
export type Membership = 'open' | 'vetted' | 'private' | 'forming';

const COPY: Record<Membership, { label: string; note: string }> = {
  open: { label: 'Open', note: 'Anyone can join. No approval step.' },
  vetted: { label: 'Vetted', note: 'A member vouches for you, then a moderator confirms.' },
  private: { label: 'Private', note: 'Invitation only. The member list is not public.' },
  forming: { label: 'Forming', note: 'Not running yet — register interest and you will be told when it starts.' },
};

/**
 * Module 14 — "Open, vetted, private, or forming, with the join path for each
 * state."
 *
 * The join PATH is the required half, not the badge. A state without its path
 * tells a reader they cannot enter without telling them how they could — so
 * the copy for each state names the actual mechanism, and `action` renders the
 * affordance beside it.
 *
 * `private` deliberately says the member list is not public: on this product
 * that is a safety property, not a feature detail.
 */
export function MembershipState({
  state,
  action,
  className,
}: {
  state: Membership;
  action?: React.ReactNode;
  className?: string;
}) {
  const c = COPY[state];
  return (
    <div className={cn('border-[3px] border-foreground p-4', className)}>
      <div className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
        Membership
      </div>
      <div className="mt-1 font-display text-title leading-tight">{c.label}</div>
      <p className="mt-1 text-13 leading-relaxed">{c.note}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
