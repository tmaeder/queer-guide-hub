import { contentKind } from '@/components/cms/fields/structured/structuredValue';
import { lazy, type ComponentType } from 'react';
import type { FieldType } from '@/types/cms';
import { TextEditor } from './TextEditor';
import { TextareaEditor } from './TextareaEditor';
import { SelectEditor } from './SelectEditor';
import { BooleanEditor } from './BooleanEditor';
import { TagsEditor } from './TagsEditor';
import { StructuredEditor } from './StructuredEditor';
import { ImageEditor } from './ImageEditor';
import { ImageArrayEditor } from './ImageArrayEditor';
import { LinkListEditor } from './LinkListEditor';
import type { EditorProps } from './types';

// Lazy: RichTextInlineEditor pulls in tiptap (~150 KB). Every public page that
// wraps a field in <Editable> imports this registry, so a static import shipped
// the rich-text editor to every visitor, though only an admin who clicks to
// edit ever renders it. <Editable> wraps the editor in Suspense.
const RichTextInlineEditor = lazy(() =>
  import('./RichTextInlineEditor').then((m) => ({ default: m.RichTextInlineEditor })),
);

const REGISTRY: Partial<Record<FieldType, ComponentType<EditorProps>>> = {
  text: TextEditor,
  url: TextEditor,
  email: TextEditor,
  phone: TextEditor,
  number: TextEditor,
  date: TextEditor,
  datetime: TextEditor,
  textarea: TextareaEditor,
  select: SelectEditor,
  boolean: BooleanEditor,
  tags: TagsEditor,
  json: StructuredEditor,
  image: ImageEditor,
  images: ImageArrayEditor,
  richtext: RichTextInlineEditor,
  link_list: LinkListEditor,
};

export function getEditorForFieldType(
  type: FieldType,
  value?: unknown,
): ComponentType<EditorProps> | null {
  if (['text', 'textarea', 'richtext', 'json'].includes(type)) {
    const kind = contentKind(value);
    if (kind === 'structured' || kind === 'unreadable') return StructuredEditor;
    if (kind === 'richtext') return RichTextInlineEditor;
  }
  return REGISTRY[type] ?? null;
}

export type { EditorProps };
