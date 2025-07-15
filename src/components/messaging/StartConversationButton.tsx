import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { useMessaging } from "@/hooks/useMessaging";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface StartConversationButtonProps {
  userId: string;
  userName?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export const StartConversationButton = ({ 
  userId, 
  userName,
  variant = "outline",
  size = "sm",
  className = ""
}: StartConversationButtonProps) => {
  const { user } = useAuth();
  const { startConversation } = useMessaging();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleStartConversation = async () => {
    if (!user || userId === user.id) return;

    setLoading(true);
    try {
      const conversationId = await startConversation(userId);
      
      if (conversationId) {
        toast({
          title: "Success",
          description: `Started conversation with ${userName || 'user'}`
        });
        
        // Navigate to messages page with the conversation selected
        navigate(`/messages?conversation=${conversationId}`);
      }
    } catch (error) {
      console.error('Error starting conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  // Don't show button for own profile
  if (!user || userId === user.id) {
    return null;
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleStartConversation}
      disabled={loading}
      className={className}
    >
      <MessageCircle className="h-4 w-4 mr-2" />
      {loading ? "Starting..." : "Message"}
    </Button>
  );
};