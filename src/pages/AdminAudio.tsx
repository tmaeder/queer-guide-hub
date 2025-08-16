import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AudioUpload } from '@/components/admin/AudioUpload';
import { AudioManager } from '@/components/admin/AudioManager';

export default function AdminAudio() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadComplete = () => {
    // Refresh the audio manager when upload completes
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Audio Management</h1>
        <p className="text-muted-foreground">
          Upload and manage audio with modern codec processing (Opus → AAC → MP3)
        </p>
      </div>

      <Tabs defaultValue="library" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="library">Audio Library</TabsTrigger>
          <TabsTrigger value="upload">Upload Audio</TabsTrigger>
        </TabsList>
        
        <TabsContent value="library" className="mt-6">
          <AudioManager key={refreshKey} />
        </TabsContent>
        
        <TabsContent value="upload" className="mt-6">
          <AudioUpload onUploadComplete={handleUploadComplete} />
        </TabsContent>
      </Tabs>
    </div>
  );
}