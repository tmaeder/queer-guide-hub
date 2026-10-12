import { useState } from 'react';
import { useCentralizedTags } from '@/hooks/useCentralizedTags';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FieldRenderer } from '@/components/cms/fields/FieldRenderer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { TagsCsvImport } from '@/components/admin/TagsCsvImport';
import BulkCreateAITags from '@/components/admin/BulkCreateAITags';
import BatchGeoLinkDialog from '@/components/admin/BatchGeoLinkDialog';
import { TagCategorizer } from '@/components/admin/TagCategorizer';

export default function TagCollectionTools() {
  const { allTags: tags, updateTag } = useCentralizedTags();
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditTags, setBulkEditTags] = useState<Record<string, string>>({});
  const handleBulkEditDescriptions = () => {
    const withoutDesc = tags.filter((t) => !t.description?.trim());
    const initial: Record<string, string> = {};
    withoutDesc.forEach((t) => {
      initial[t.id] = `${t.name} related to ${t.category}`;
    });
    setBulkEditTags(initial);
    setIsBulkEditOpen(true);
  };

  const saveBulkDescriptions = async () => {
    try {
      await Promise.all(
        Object.entries(bulkEditTags).map(([id, description]) => updateTag(id, { description })),
      );
      toast.success(`Updated ${Object.keys(bulkEditTags).length} tags`);
      setIsBulkEditOpen(false);
      setBulkEditTags({});
    } catch {
      toast.error('Error: Failed to update descriptions');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-title">Import and bulk editing</h2>
        <p className="mt-2 text-13 text-muted-foreground">
          Add tags, fill descriptions, or connect tags to places.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <TagsCsvImport onImportComplete={() => window.location.reload()} />
          <BulkCreateAITags onComplete={() => window.location.reload()} />
          <BatchGeoLinkDialog onComplete={() => window.location.reload()} />
          <Button variant="outline" size="sm" onClick={handleBulkEditDescriptions}>
            Bulk descriptions
          </Button>
        </div>
      </div>
      <TagCategorizer />
      <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Edit Tag Descriptions</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Add descriptions to tags that don't have them.
            </p>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {Object.entries(bulkEditTags).map(([tagId, description]) => {
              const tag = tags.find((t) => t.id === tagId);
              if (!tag) return null;
              return (
                <div key={tagId} className="rounded-element bg-muted p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{tag.name}</span>
                    <Badge variant="outline">{tag.category}</Badge>
                  </div>
                  <FieldRenderer
                    field={{
                      name: `description-${tagId}`,
                      label: `Description for ${tag.name}`,
                      type: 'textarea',
                      group: 'basic',
                      placeholder: 'Enter description...',
                    }}
                    value={description}
                    onChange={(next) =>
                      setBulkEditTags((p) => ({ ...p, [tagId]: String(next ?? '') }))
                    }
                  />
                </div>
              );
            })}
            {Object.keys(bulkEditTags).length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">All tags have descriptions!</p>
              </div>
            )}
            {Object.keys(bulkEditTags).length > 0 && (
              <div className="flex gap-2 pt-4">
                <Button onClick={saveBulkDescriptions} className="flex-1">
                  Save All ({Object.keys(bulkEditTags).length} tags)
                </Button>
                <Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
