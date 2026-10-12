import { useId, type ComponentProps } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

/** A compact mark inside a full-size label target, rather than a stretched checkbox. */
export function AdminSelectionCheckbox(props: ComponentProps<typeof Checkbox>) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <label
      htmlFor={id}
      className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-element hover:bg-muted"
    >
      <span className="sr-only">{props['aria-label']}</span>
      <Checkbox
        {...props}
        id={id}
        className="size-6 min-w-0 shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        style={{ outline: '1px solid hsl(var(--input))', outlineOffset: -1 }}
      />
    </label>
  );
}
