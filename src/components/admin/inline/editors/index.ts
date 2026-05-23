import type { ComponentType } from 'react';
import type { FieldType } from '@/types/cms';
import { TextEditor } from './TextEditor';
import { TextareaEditor } from './TextareaEditor';
import { SelectEditor } from './SelectEditor';
import { BooleanEditor } from './BooleanEditor';
import { TagsEditor } from './TagsEditor';
import { HoursEditor } from './HoursEditor';
import { ImageEditor } from './ImageEditor';
import { ImageArrayEditor } from './ImageArrayEditor';
import { RichTextInlineEditor } from './RichTextInlineEditor';
import type { EditorProps } from './types';

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
  json: HoursEditor,
  image: ImageEditor,
  images: ImageArrayEditor,
  richtext: RichTextInlineEditor,
};

export function getEditorForFieldType(type: FieldType): ComponentType<EditorProps> | null {
  return REGISTRY[type] ?? null;
}

export type { EditorProps };
