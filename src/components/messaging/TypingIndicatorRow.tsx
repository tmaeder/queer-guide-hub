import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { TypingIndicator } from '@/hooks/useMessaging';

interface TypingIndicatorRowProps {
  typingUsers: TypingIndicator[];
}

/** "<names> is/are typing" row shown at the foot of the message thread.
 *  Extracted from MessagingInterface; pure presentation. */
export function TypingIndicatorRow({ typingUsers }: TypingIndicatorRowProps) {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((user) => user.display_name).join(', ');
  const verb = typingUsers.length === 1 ? 'is' : 'are';

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-xs">
          {typingUsers[0]?.display_name?.charAt(0) || 'U'}
        </AvatarFallback>
      </Avatar>
      <span>
        {names} {verb} typing
      </span>
      <div className="flex gap-1" aria-hidden="true">
        <div className="w-1 h-1 bg-primary rounded-full" />
        <div className="w-1 h-1 bg-primary rounded-full" />
        <div className="w-1 h-1 bg-primary rounded-full" />
      </div>
    </div>
  );
}
