import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { ImageIcon, X, ExternalLink, FolderOpen } from 'lucide-react';
import MediaPickerDialog from '@/components/cms/media/MediaPickerDialog';

/**
 * Single image field for the 'image' type.
 * Shows an image preview if a URL value exists.
 * Provides a URL text input to set/change the image.
 * Shows a placeholder when empty.
 */
export function ImageField({ field, value, onChange, error, disabled }: FieldProps) {
  const imageUrl = (value as string) ?? '';
  const [inputValue, setInputValue] = useState(imageUrl);
  const [imgError, setImgError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Sync input when value changes externally
  React.useEffect(() => {
    setInputValue((value as string) ?? '');
    setImgError(false);
  }, [value]);

  const handleApply = () => {
    onChange(inputValue.trim() || null);
    setImgError(false);
  };

  const handleClear = () => {
    if (disabled) return;
    setInputValue('');
    onChange(null);
    setImgError(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
  };

  return (
    <FieldWrapper field={field} error={error}>
      {/* Image preview */}
      <div className="rounded-element border border-input bg-muted/30 overflow-hidden">
        {imageUrl && !imgError ? (
          <div className="relative group">
            <img
              src={imageUrl}
              alt={field.label}
              role="presentation"
              className="w-full h-48 object-cover"
              onError={() => setImgError(true)}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-700 mr-2"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              {!disabled && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-2 rounded-full bg-white/90 hover:bg-white text-red-600"
                  title="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="w-8 h-8 mb-2 opacity-40" />
            <span className="text-xs mb-2">
              {imgError ? 'Failed to load image' : 'No image set'}
            </span>
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

        {/* URL input + Browse */}
        <div className="p-2 border-t border-input flex gap-2">
          <Input
            id={field.name}
            type="url"
            value={inputValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
            onBlur={handleApply}
            onKeyDown={handleKeyDown}
            placeholder={field.placeholder || 'Enter image URL...'}
            disabled={disabled}
            className="flex-1"
          />
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
              className="shrink-0"
            >
              <FolderOpen className="w-4 h-4" />
            </Button>
          )}
          {!disabled && imageUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Media Picker Dialog */}
      <MediaPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={() => {}}
        onSelectUrl={(url) => {
          setInputValue(url);
          onChange(url);
          setImgError(false);
          setPickerOpen(false);
        }}
        mimeFilter="image/"
      />
    </FieldWrapper>
  );
}
