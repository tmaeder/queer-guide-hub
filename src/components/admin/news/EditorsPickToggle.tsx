import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorsPickToggle } from '@/hooks/useEditorsPickToggle';

interface EditorsPickToggleProps {
  articleId: string;
  initialValue: boolean;
  onChange?: (next: boolean) => void;
}

// Admin-only star toggle. Mirrors FavoriteButton density so the action row
// keeps its rhythm. Filled star = picked, outline = not.
export function EditorsPickToggle({ articleId, initialValue, onChange }: EditorsPickToggleProps) {
  const { value, saving, toggle } = useEditorsPickToggle(initialValue);

  const handleClick = async () => {
    const next = await toggle(articleId);
    if (next !== null) onChange?.(next);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={saving}
      aria-pressed={value}
      aria-label={value ? "Remove from editor’s picks" : "Mark as editor’s pick"}
      title={value ? "Editor’s pick — click to clear" : "Mark as editor’s pick"}
      className="gap-1.5"
    >
      <Star
        size={16}
        fill={value ? 'currentColor' : 'none'}
        strokeWidth={value ? 2 : 1.75}
      />
      <span className="hidden md:inline">{value ? "Editor’s pick" : "Pick"}</span>
    </Button>
  );
}
