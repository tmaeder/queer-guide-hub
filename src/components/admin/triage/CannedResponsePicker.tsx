import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCannedResponses } from '@/hooks/useCannedResponses';

interface CannedResponsePickerProps {
  value: string;
  onSelect: (slug: string, template: string) => void;
}

export function CannedResponsePicker({ value, onSelect }: CannedResponsePickerProps) {
  const { data: responses } = useCannedResponses();

  if (!responses?.length) return null;

  return (
    <Select
      value={value}
      onValueChange={(slug) => {
        const r = responses.find((t) => t.slug === slug);
        if (r) onSelect(r.slug, r.template);
      }}
    >
      <SelectTrigger className="h-7 text-xs">
        <SelectValue placeholder="Quick response..." />
      </SelectTrigger>
      <SelectContent>
        {responses.map((r, i) => (
          <SelectItem key={r.slug} value={r.slug}>
            <span className="text-muted-foreground mr-1">{i + 1}.</span>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
