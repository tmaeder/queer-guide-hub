import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AudioUpload } from '@/components/admin/AudioUpload';
import { AudioManager } from '@/components/admin/AudioManager';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function AdminAudio() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadComplete = () => {
    // Refresh the audio manager when upload completes
    setRefreshKey(prev => prev + 1);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Audio Management</Typography>
        <Typography variant="body2" color="text.secondary">
          Upload and manage audio with modern codec processing (Opus → AAC → MP3)
        </Typography>
      </Box>

      <Tabs defaultValue="library" style={{ width: '100%' }}>
        <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: '1fr 1fr' }}>
          <TabsTrigger value="library">Audio Library</TabsTrigger>
          <TabsTrigger value="upload">Upload Audio</TabsTrigger>
        </TabsList>

        <TabsContent value="library" style={{ marginTop: 24 }}>
          <AudioManager key={refreshKey} />
        </TabsContent>

        <TabsContent value="upload" style={{ marginTop: 24 }}>
          <AudioUpload onUploadComplete={handleUploadComplete} />
        </TabsContent>
      </Tabs>
    </Container>
  );
}
