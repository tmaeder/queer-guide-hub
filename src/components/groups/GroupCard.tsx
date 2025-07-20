import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Lock, Globe, UserPlus, UserMinus, Settings, ExternalLink } from "lucide-react";
import { Group } from "@/hooks/useGroups";

interface GroupCardProps {
  group: Group;
  onJoin?: (groupId: string) => void;
  onLeave?: (groupId: string) => void;
  onManage?: (group: Group) => void;
  isJoining?: boolean;
  isLeaving?: boolean;
}

export const GroupCard = ({ 
  group, 
  onJoin, 
  onLeave, 
  onManage, 
  isJoining, 
  isLeaving 
}: GroupCardProps) => {
  const canManage = group.user_role === 'admin' || group.user_role === 'moderator';

  return (
    <Card className="group hover:shadow-elegant transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage 
              src={group.image_url || undefined}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${group.name}`;
              }}
            />
            <AvatarFallback className="bg-gradient-primary text-primary-foreground">
              {group.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link to={`/groups/${group.id}`} className="flex-1">
                <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors hover:underline">
                  {group.name}
                </CardTitle>
              </Link>
              {group.is_private ? (
                <Lock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Globe className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{group.member_count} members</span>
              {group.user_role && (
                <Badge variant="secondary" className="text-xs">
                  {group.user_role}
                </Badge>
              )}
            </div>
          </div>

          {canManage && onManage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onManage(group)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {group.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {group.description}
          </p>
        )}

        {group.tags && group.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {group.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
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

        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm" className="flex-1">
            <Link to={`/groups/${group.id}`} className="flex items-center">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Group
            </Link>
          </Button>
          
          {!group.is_member ? (
            <Button
              onClick={() => onJoin?.(group.id)}
              disabled={isJoining}
              className="flex-1 bg-gradient-primary hover:opacity-90"
              size="sm"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {isJoining ? "Joining..." : "Join"}
            </Button>
          ) : (
            <Button
              onClick={() => onLeave?.(group.id)}
              disabled={isLeaving}
              variant="outline"
              className="flex-1"
              size="sm"
            >
              <UserMinus className="h-4 w-4 mr-2" />
              {isLeaving ? "Leaving..." : "Leave"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};