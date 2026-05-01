import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Box from '@mui/material/Box';
import { EnhancedImageUpload } from '@/components/security/EnhancedImageUpload';

interface MediaUploaderProps {
  onUploaded: () => void;
  onCancel: () => void;
}

export function MediaUploader({ onUploaded, onCancel }: MediaUploaderProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload New Media</CardTitle>
      </CardHeader>
      <CardContent>
        <EnhancedImageUpload
          onUpload={(_url) => {
            onUploaded();
          }}
          bucket="cms-media"
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
