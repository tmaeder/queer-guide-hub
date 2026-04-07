import { useState } from 'react';
import Box from '@mui/material/Box';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import { MessageCircle, StickyNote, BarChart3 } from 'lucide-react';
import { TripChat } from './TripChat';
import { TripNotes } from './TripNotes';
import { TripPolls } from './TripPolls';

interface Props {
  tripId: string;
}

type SubTab = 'chat' | 'notes' | 'polls';

export function CollaborationTab({ tripId }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('chat');

  return (
    <Box>
      <Box className="flex justify-center mb-4">
        <ToggleButtonGroup
          value={subTab}
          exclusive
          onChange={(_, val) => {
            if (val) setSubTab(val);
          }}
          size="small"
        >
          <ToggleButton value="chat" sx={{ gap: 0.75, px: 2, textTransform: 'none', fontSize: 13 }}>
            <MessageCircle size={15} />
            Chat
          </ToggleButton>
          <ToggleButton value="notes" sx={{ gap: 0.75, px: 2, textTransform: 'none', fontSize: 13 }}>
            <StickyNote size={15} />
            Notes
          </ToggleButton>
          <ToggleButton value="polls" sx={{ gap: 0.75, px: 2, textTransform: 'none', fontSize: 13 }}>
            <BarChart3 size={15} />
            Polls
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {subTab === 'chat' && <TripChat tripId={tripId} />}
      {subTab === 'notes' && <TripNotes tripId={tripId} />}
      {subTab === 'polls' && <TripPolls tripId={tripId} />}
    </Box>
  );
}
