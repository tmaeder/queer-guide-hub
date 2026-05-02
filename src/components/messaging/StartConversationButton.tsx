import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { useMessaging } from '@/hooks/useMessaging';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

interface StartConversationButtonProps {
  userId: string;
  userName?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

export const StartConversationButton = ({
  userId,
  userName,
  variant = 'outline',
  size = 'sm',
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
      toast({ title: 'Error', description: 'Failed to start conversation. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Don't show button for own profile
  if (!user || userId === user.id) {
    return null;
  }

  return (
    <Button variant={variant} size={size} onClick={handleStartConversation} disabled={loading}>
      <MessageCircle style={{ width: 16, height: 16, marginRight: 8 }} />
      {loading ? 'Sliding into DMs...' : 'Send DM'}
    </Button>
  );
};
