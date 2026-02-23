import { useEffect, useState } from 'react';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export const usePushNotifications = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;

    const initializePushNotifications = async () => {
      try {
        // Request permission
        const permission = await PushNotifications.requestPermissions();
        
        if (permission.receive === 'granted') {
          await PushNotifications.register();
          setIsRegistered(true);
        } else {
          console.log('Push notification permission denied');
        }

        // Get the FCM token (for Android) or APNs token (for iOS)
        PushNotifications.addListener('registration', async (token: Token) => {
          console.log('Push registration success, token: ' + token.value);
          setToken(token.value);
          
          // Store the token in the database
          await supabase
            .from('user_push_tokens' as any)
            .upsert({
              user_id: user.id,
              token: token.value,
              platform: Capacitor.getPlatform(),
              updated_at: new Date().toISOString()
            });
        });

        // Handle notification received while app is in foreground
        PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
          console.log('Push notification received: ', notification);
          
          toast({
            title: notification.title || 'New notification',
            description: notification.body || 'You have a new message',
          });
        });

        // Handle notification action performed (user tapped on notification)
        PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
          console.log('Push notification action performed', notification);
          
          // Handle deep linking based on notification data
          const data = notification.notification.data;
          if (data?.type === 'message' && data?.conversationId) {
            // Navigate to message
            window.location.href = `/messages?conversation=${data.conversationId}`;
          } else if (data?.type === 'group_message' && data?.groupId) {
            // Navigate to group
            window.location.href = `/groups/${data.groupId}`;
          } else if (data?.type === 'event' && data?.eventId) {
            // Navigate to event
            window.location.href = `/events/${data.eventId}`;
          }
        });

        // Handle registration errors
        PushNotifications.addListener('registrationError', (error: any) => {
          console.error('Error on registration: ' + JSON.stringify(error));
        });

      } catch (error) {
        console.error('Error initializing push notifications:', error);
      }
    };

    initializePushNotifications();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, [user, toast]);

  const unregister = async () => {
    if (!user || !token) return;

    try {
      // Remove token from database
      await supabase
        .from('user_push_tokens' as any)
        .delete()
        .eq('user_id', user.id)
        .eq('token', token);

      // Unregister from push notifications
      await PushNotifications.removeAllDeliveredNotifications();
      setToken(null);
      setIsRegistered(false);
    } catch (error) {
      console.error('Error unregistering from push notifications:', error);
    }
  };

  return {
    token,
    isRegistered,
    unregister
  };
};