import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
