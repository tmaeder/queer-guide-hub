import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VideoUpload } from '@/components/admin/VideoUpload';
import { VideoManager } from '@/components/admin/VideoManager';

export default function AdminVideos() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadComplete = () => {
    // Refresh the video manager when upload completes
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Video Management</h1>
        <p className="text-muted-foreground">
          Upload and manage videos with modern codec processing (AV1/VP9/H.264)
        </p>
      </div>

      <Tabs defaultValue="library" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="library">Video Library</TabsTrigger>
          <TabsTrigger value="upload">Upload Videos</TabsTrigger>
        </TabsList>
        
        <TabsContent value="library" className="mt-6">
          <VideoManager key={refreshKey} />
        </TabsContent>
        
        <TabsContent value="upload" className="mt-6">
          <VideoUpload onUploadComplete={handleUploadComplete} />
        </TabsContent>
      </Tabs>
    </div>
  );
}