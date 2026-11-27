import { useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { MessageCircle } from '@/components/icons';
import { useMessaging } from '@/hooks/useMessaging';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

interface StartConversationButtonProps {
  userId: string;
  userName?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  /** Icon-only round button (dense cards). The name becomes its accessible label. */
  iconOnly?: boolean;
  /** Visible text; defaults to "Send DM". */
  label?: string;
}

export const StartConversationButton = ({
  userId,
  userName,
  variant = 'outline',
  size = 'sm',
  iconOnly = false,
  label = 'Send DM',
}: StartConversationButtonProps) => {
  const { user } = useAuth();
  const { startConversation } = useMessaging();
  const { toast } = useToast();
  const navigate = useLocalizedNavigate();
  const [loading, setLoading] = useState(false);

  const handleStartConversation = async () => {
    if (!user || userId === user.id) return;

    setLoading(true);
    try {
      const conversationId = await startConversation(userId);

      if (conversationId) {
        toast({
          title: 'Success',
          description: `Started conversation with ${userName || 'user'}`,
        });

        // Navigate to messages page with the conversation selected
        navigate(`/messages?conversation=${conversationId}`);
      }
    } catch (_error) {
      toast({
        title: 'Error',
        description: 'Failed to start conversation. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Don't show button for own profile
  if (!user || userId === user.id) {
    return null;
  }

  if (iconOnly) {
    return (
      <Button
        variant={variant}
        size="icon"
        className="rounded-full"
        onClick={handleStartConversation}
        disabled={loading}
        aria-label={`Message ${userName || 'member'}`}
        title={`Message ${userName || 'member'}`}
      >
        <MessageCircle size={18} aria-hidden />
      </Button>
    );
  }

  return (
    <Button variant={variant} size={size} onClick={handleStartConversation} disabled={loading}>
      <MessageCircle size={16} className="mr-2" />
      {loading ? 'Sliding into DMs...' : label}
    </Button>
  );
};
