import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Lock, Globe, UserPlus, UserMinus, Settings } from "lucide-react";
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
            <AvatarImage src={group.image_url || undefined} />
            <AvatarFallback className="bg-gradient-primary text-primary-foreground">
              {group.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors">
                {group.name}
              </CardTitle>
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

        <div className="flex gap-2">
          {!group.is_member ? (
            <Button
              onClick={() => onJoin?.(group.id)}
              disabled={isJoining}
              className="flex-1 bg-gradient-primary hover:opacity-90"
              size="sm"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {isJoining ? "Joining..." : "Join Group"}
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
              {isLeaving ? "Leaving..." : "Leave Group"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};