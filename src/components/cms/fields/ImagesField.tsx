import React, { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { ImageIcon, Plus, X, GripVertical, FolderOpen } from 'lucide-react';
import MediaPickerDialog from '@/components/cms/media/MediaPickerDialog';

/**
 * Multiple images field for the 'images' type.
 * Value is string[] of image URLs.
 * Shows thumbnails in a grid with remove buttons.
 * "Add" button prompts for a URL via an inline input.
 */
export function ImagesField({ field, value, onChange, error, disabled }: FieldProps) {
  const images = useMemo<string[]>(() => {
    if (Array.isArray(value)) return value as string[];
    return [];
  }, [value]);

  const [newUrl, setNewUrl] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  const addImage = useCallback(() => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    if (images.includes(trimmed)) {
      setNewUrl('');
      return;
    }
    onChange([...images, trimmed]);
    setNewUrl('');
    setShowInput(false);
  }, [newUrl, images, onChange]);

  const removeImage = useCallback(
    (index: number) => {
      if (disabled) return;
      const updated = images.filter((_, i) => i !== index);
      onChange(updated);
    },
    [images, onChange, disabled]
  );

  const moveImage = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (disabled) return;
      if (toIndex < 0 || toIndex >= images.length) return;
      const updated = [...images];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      onChange(updated);
    },
    [images, onChange, disabled]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addImage();
    }
    if (e.key === 'Escape') {
      setShowInput(false);
      setNewUrl('');
    }
  };

  const handleImageError = (url: string) => {
    setFailedImages((prev) => new Set(prev).add(url));
  };

  return (
    <FieldWrapper field={field} error={error}>
      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {images.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="relative group rounded-lg border border-input overflow-hidden bg-muted/30"
            >
              {failedImages.has(url) ? (
                <div className="w-full h-24 flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="w-6 h-6 opacity-40" />
                </div>
              ) : (
                <img
                  src={url}
                  alt={`${field.label} ${index + 1}`}
                  role="presentation"
                  className="w-full h-24 object-cover"
                  onError={() => handleImageError(url)}
                />
              )}

              {/* Overlay controls */}
              {!disabled && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                  {/* Move left */}
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => moveImage(index, index - 1)}
                      className="p-1 rounded bg-white/90 hover:bg-white text-gray-700 text-xs"
                      title="Move left"
                    >
                      <GripVertical className="w-3 h-3 rotate-90" />
                    </button>
                  )}
                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="p-1 rounded bg-white/90 hover:bg-white text-red-600"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  {/* Move right */}
                  {index < images.length - 1 && (
                    <button
                      type="button"
                      onClick={() => moveImage(index, index + 1)}
                      className="p-1 rounded bg-white/90 hover:bg-white text-gray-700 text-xs"
                      title="Move right"
                    >
                      <GripVertical className="w-3 h-3 -rotate-90" />
                    </button>
                  )}
                </div>
              )}

              {/* Index badge */}
              <span className="absolute top-1 left-1 text-[10px] font-mono bg-black/50 text-white rounded px-1">
                {index + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {images.length === 0 && !showInput && (
        <div className="rounded-lg border border-dashed border-input bg-muted/20 p-6 flex flex-col items-center justify-center text-muted-foreground">
          <ImageIcon className="w-8 h-8 mb-2 opacity-40" />
          <span className="text-xs mb-2">No images added</span>
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
            >
              <FolderOpen className="w-4 h-4 mr-1" />
              Browse Media
            </Button>
          )}
        </div>
      )}

      {/* Add image input */}
      {showInput && !disabled && (
        <div className="flex gap-2 mt-1">
          <Input
            type="url"
            value={newUrl}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter image URL..."
            autoFocus
            className="flex-1"
          />
          <Button type="button" size="sm" onClick={addImage} disabled={!newUrl.trim()}>
            Add
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowInput(false);
              setNewUrl('');
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Add buttons */}
      {!showInput && !disabled && (
        <div className="flex gap-2 mt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowInput(true)}
            className="flex-1"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add URL
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
            className="flex-1"
          >
            <FolderOpen className="w-4 h-4 mr-1" />
            Browse
          </Button>
        </div>
      )}

      {/* Media Picker Dialog */}
      <MediaPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={() => {}}
        onSelectUrl={(url) => {
          if (!images.includes(url)) {
            onChange([...images, url]);
          }
          setPickerOpen(false);
        }}
        mimeFilter="image/"
      />
    </FieldWrapper>
  );
}
