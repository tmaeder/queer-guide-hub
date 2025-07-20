import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Users } from "lucide-react";
import { GroupImageUpload } from "./GroupImageUpload";
import { TagSelector } from "@/components/tags/TagSelector";

interface CreateGroupDialogProps {
  onCreateGroup: (data: { 
    name: string; 
    description?: string; 
    isPrivate?: boolean; 
    imageUrl?: string; 
    rules?: string; 
    tags?: string[];
  }) => void;
  isCreating?: boolean;
}

export const CreateGroupDialog = ({ onCreateGroup, isCreating }: CreateGroupDialogProps) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isPrivate: false,
    imageUrl: "",
    rules: "",
    tags: [] as string[]
  });
  const [groupImages, setGroupImages] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    onCreateGroup({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      isPrivate: formData.isPrivate,
      imageUrl: groupImages.length > 0 ? groupImages[0] : (formData.imageUrl.trim() || undefined),
      rules: formData.rules.trim() || undefined,
      tags: formData.tags
    });

    // Reset form and close dialog
    setFormData({
      name: "",
      description: "",
      isPrivate: false,
      imageUrl: "",
      rules: "",
      tags: []
    });
    setGroupImages([]);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-primary hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" />
          Create Group
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Create New Group
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Group Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter group name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="What's this group about?"
              rows={3}
            />
          </div>

          <GroupImageUpload
            currentImages={groupImages}
            onImagesChange={setGroupImages}
            maxImages={1}
          />

          <div className="space-y-2">
            <Label htmlFor="imageUrl">Or Image URL</Label>
            <Input
              id="imageUrl"
              value={formData.imageUrl}
              onChange={(e) => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
              placeholder="https://example.com/image.jpg"
              type="url"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rules">Group Rules</Label>
            <Textarea
              id="rules"
              value={formData.rules}
              onChange={(e) => setFormData(prev => ({ ...prev, rules: e.target.value }))}
              placeholder="Guidelines for group members"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <TagSelector
              selectedTags={formData.tags}
              onTagsChange={(tags) => setFormData(prev => ({ ...prev, tags }))}
              placeholder="Add tags to help others discover your group..."
              maxTags={5}
              allowCustomTags={true}
            />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label htmlFor="private" className="text-sm font-medium">
                Private Group
              </Label>
              <p className="text-xs text-muted-foreground">
                Only invited members can see and join
              </p>
            </div>
            <Switch
              id="private"
              checked={formData.isPrivate}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, isPrivate: checked }))
              }
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!formData.name.trim() || isCreating}
              className="flex-1 bg-gradient-primary hover:opacity-90"
            >
              {isCreating ? "Creating..." : "Create Group"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};