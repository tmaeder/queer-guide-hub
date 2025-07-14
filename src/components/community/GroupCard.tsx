import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Lock, Globe } from 'lucide-react';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/hooks/useAuth';

type CommunityGroup = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_private: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  rules: string | null;
  tags: string[] | null;
};

type GroupCardProps = {
  group: CommunityGroup;
  showJoinButton?: boolean;
};

export function GroupCard({ group, showJoinButton = true }: GroupCardProps) {
  const { joinGroup, leaveGroup, checkMembership } = useGroups();
  const { user } = useAuth();
  const [membership, setMembership] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && group.id) {
      checkMembership(group.id).then(setMembership);
    }
  }, [user, group.id, checkMembership]);

  const handleJoinLeave = async () => {
    setLoading(true);
    if (membership) {
      await leaveGroup(group.id);
    } else {
      await joinGroup(group.id);
    }
    // Refresh membership status
    const newMembership = await checkMembership(group.id);
    setMembership(newMembership);
    setLoading(false);
  };

  const isOwner = user?.id === group.created_by;

  return (
    <Card className="h-full">
      <CardHeader className="space-y-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={group.image_url || undefined} />
            <AvatarFallback>{group.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Link 
                to={`/groups/${group.id}`}
                className="text-lg font-semibold truncate hover:text-primary transition-colors"
              >
                {group.name}
              </Link>
              {group.is_private ? (
                <Lock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Globe className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{group.member_count} members</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {group.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {group.description}
          </p>
        )}
        
        {group.tags && group.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {group.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {group.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{group.tags.length - 3} more
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      {showJoinButton && user && !isOwner && (
        <CardFooter>
          <Button 
            onClick={handleJoinLeave}
            disabled={loading}
            variant={membership ? "outline" : "default"}
            className="w-full"
          >
            {loading ? "Loading..." : membership ? "Leave Group" : "Join Group"}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}