import { MessageCircle, StickyNote, BarChart3 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TripChat } from './TripChat';
import { TripNotes } from './TripNotes';
import { TripPolls } from './TripPolls';

interface Props {
  tripId: string;
}

export function CollaborationTab({ tripId }: Props) {
  return (
    <Tabs defaultValue="chat">
      <TabsList>
        <TabsTrigger value="chat">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MessageCircle size={14} /> Chat
          </span>
        </TabsTrigger>
        <TabsTrigger value="notes">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StickyNote size={14} /> Notes
          </span>
        </TabsTrigger>
        <TabsTrigger value="polls">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={14} /> Polls
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
