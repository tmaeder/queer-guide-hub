import { MessageCircle, StickyNote, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TripChat } from './TripChat';
import { TripNotes } from './TripNotes';
import { TripPolls } from './TripPolls';

interface Props {
  tripId: string;
}

const tabStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

export function CollaborationTab({ tripId }: Props) {
  const { t } = useTranslation();

  return (
    <Tabs defaultValue="chat">
      <TabsList>
        <TabsTrigger value="chat">
          <span style={tabStyle}>
            <MessageCircle size={14} /> {t('trips.collaborate.chat')}
          </span>
        </TabsTrigger>
        <TabsTrigger value="notes">
          <span style={tabStyle}>
            <StickyNote size={14} /> {t('trips.collaborate.notes')}
          </span>
        </TabsTrigger>
        <TabsTrigger value="polls">
          <span style={tabStyle}>
            <BarChart3 size={14} /> {t('trips.collaborate.polls')}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="chat">
        <TripChat tripId={tripId} />
      </TabsContent>
      <TabsContent value="notes">
        <TripNotes tripId={tripId} />
      </TabsContent>
      <TabsContent value="polls">
        <TripPolls tripId={tripId} />
      </TabsContent>
    </Tabs>
  );
}
