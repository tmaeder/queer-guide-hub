import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VideoUpload } from '@/components/admin/VideoUpload';
import { VideoManager } from '@/components/admin/VideoManager';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function AdminVideos() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadComplete = () => {
    // Refresh the video manager when upload completes
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Video Management
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Upload and manage videos with modern codec processing (AV1/VP9/H.264)
        </Typography>
      </Box>

      <Tabs defaultValue="library" style={{ width: '100%' }}>
        <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: '1fr 1fr' }}>
          <TabsTrigger value="library">Video Library</TabsTrigger>
          <TabsTrigger value="upload">Upload Videos</TabsTrigger>
        </TabsList>

        <TabsContent value="library" style={{ marginTop: 24 }}>
          <VideoManager key={refreshKey} />
        </TabsContent>

        <TabsContent value="upload" style={{ marginTop: 24 }}>
          <VideoUpload onUploadComplete={handleUploadComplete} />
        </TabsContent>
      </Tabs>
    </Container>
  );
}
