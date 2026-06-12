import { Users, UsersRound, MessageSquare } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useSocialSummary } from '@/hooks/useSocialSummary';

interface SocialSummaryRowProps {
  userId: string;
  isOwnProfile: boolean;
  onPostsClick?: () => void;
}

/** Friends / groups / posts counts on the profile Overview. Counts link to their surfaces. */
export function SocialSummaryRow({ userId, isOwnProfile, onPostsClick }: SocialSummaryRowProps) {
  const { data } = useSocialSummary(userId);

  const items = [
    {
      icon: Users,
      label: data?.friends === 1 ? 'friend' : 'friends',
      count: data?.friends ?? 0,
      to: isOwnProfile ? '/friends' : undefined,
    },
    {
      icon: UsersRound,
      label: data?.groups === 1 ? 'group' : 'groups',
      count: data?.groups ?? 0,
      to: isOwnProfile ? '/my-groups' : undefined,
    },
    {
      icon: MessageSquare,
      label: data?.posts === 1 ? 'post' : 'posts',
      count: data?.posts ?? 0,
      onClick: onPostsClick,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2" aria-label="Community summary">
      {items.map(({ icon: Icon, label, count, to, onClick }) => {
        const inner = (
          <>
            <Icon size={16} className="text-muted-foreground" aria-hidden />
            <span className="text-base font-semibold tabular-nums">{count}</span>
            <span className="text-13 text-muted-foreground">{label}</span>
          </>
        );
        const cls =
          'flex flex-col items-center gap-1 rounded-element border border-border bg-card p-4';
        if (to) {
          return (
            <LocalizedLink key={label} to={to} className={`${cls} hover:bg-muted/30 transition-colors`}>
              {inner}
            </LocalizedLink>
          );
        }
        if (onClick) {
          return (
            <button key={label} type="button" onClick={onClick} className={`${cls} hover:bg-muted/30 transition-colors`}>
              {inner}
            </button>
          );
        }
        return (
          <div key={label} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
