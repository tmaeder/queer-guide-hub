import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Ban } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useBlockedUsers } from '@/hooks/useBlockedUsers';

/** The one place to see and undo blocks; blocking itself happens on a profile. */
export function BlockedUsersSettings() {
  const { list, unblock } = useBlockedUsers();
  const people = list.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle icon={Ban}>Blocked members</CardTitle>
        <p className="text-sm text-muted-foreground">
          Members you blocked. Block someone from their profile.
        </p>
      </CardHeader>
      <CardContent>
        {list.isLoading ? (
          <TrackLoader label="Loading blocked members" />
        ) : people.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one blocked.</p>
        ) : (
          <ul className="flex flex-col">
            {people.map((p) => {
              const name = p.display_name || (p.username ? `@${p.username}` : 'Member');
              return (
                <li
                  key={p.user_id}
                  className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
                >
                  <Avatar style={{ height: 32, width: 32 }}>
                    <AvatarImage src={p.avatar_url ?? undefined} alt="" />
                    <AvatarFallback>{name.replace('@', '').charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unblock.isPending}
                    onClick={() => unblock.mutate(p.user_id)}
                    aria-label={`Unblock ${name}`}
                  >
                    Unblock
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
