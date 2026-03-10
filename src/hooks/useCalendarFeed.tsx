import { useState } from 'react';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import { invokeFunction } from '@/integrations/cloudflare-workers';
import { api } from '@/integrations/api/client';

export const useCalendarFeed = () => {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Token generation moved server-side for security; using calendar-token edge function

  const getCalendarFeedUrl = async (): Promise<string | null> => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to get your calendar feed.",
        variant: "destructive",
      });
      return null;
    }

    try {
      setLoading(true);
      const { data, error } = await invokeFunction('calendar-token', {
        body: {},
        headers: {
          Authorization: `Bearer ${(await api.auth.getSession()).data.session?.access_token}`,
        },
      });
      if (error || !data?.url) throw error || new Error('Failed to get calendar URL');
      return data.url as string;
    } catch (error) {
      console.error('Error generating calendar feed URL:', error);
      toast({
        title: "Error",
        description: "Failed to generate calendar feed URL.",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const copyCalendarFeedUrl = async () => {
    const url = await getCalendarFeedUrl();
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        toast({
          title: "Calendar URL copied!",
          description: "You can now paste this URL into your calendar application to subscribe to your favorite events.",
        });
      } catch (error) {
        console.error('Error copying to clipboard:', error);
        toast({
          title: "Copy failed",
          description: "Please manually copy the URL from the dialog.",
          variant: "destructive",
        });
      }
    }
  };

  const downloadCalendarFile = async () => {
    const url = await getCalendarFeedUrl();
    if (url) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch calendar');
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = 'favorites-calendar.ics';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);

        toast({
          title: "Calendar downloaded!",
          description: "Your favorite events calendar has been downloaded as an .ics file.",
        });
      } catch (error) {
        console.error('Error downloading calendar:', error);
        toast({
          title: "Download failed",
          description: "Failed to download the calendar file.",
          variant: "destructive",
        });
      }
    }
  };

  return {
    loading,
    getCalendarFeedUrl,
    copyCalendarFeedUrl,
    downloadCalendarFile,
  };
};