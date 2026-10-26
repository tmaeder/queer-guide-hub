import { useEffect, useMemo, useRef, useState } from 'react';
import { EmailEditor, type EmailEditorRef } from '@react-email/editor';
import { EmailNode, composeReactEmail } from '@react-email/editor/core';
import { StarterKit } from '@react-email/editor/extensions';
import { EmailTheming } from '@react-email/editor/plugins';
import EmailInspector from './EmailInspector';
import Image from '@tiptap/extension-image';
import type { JSONContent } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { ArrowDown, ArrowUp, Copy, ImageIcon, Plus, Redo2, Trash2, Undo2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TemplateVariable } from './TemplateVariable';
import {
  prepareLegacyHtml,
  preservePlainTextVariables,
  readBlockDocument,
  storeBlockDocument,
  type EmailVariable,
} from './emailDocument';
import '@react-email/editor/themes/default.css';
import './email-editor.css';

const EmailImage = EmailNode.from(Image, ({ node }) => (
  <img
    src={node.attrs?.src}
    alt={node.attrs?.alt || ''}
    width={node.attrs?.width || undefined}
    style={{ maxWidth: '100%', height: 'auto' }}
  />
));
const BLOCKS = [
  ['paragraph', 'Text'],
  ['heading', 'Heading'],
  ['button', 'Button'],
  ['image', 'Image'],
  ['horizontalRule', 'Divider'],
  ['twoColumns', 'Columns'],
  ['bulletList', 'List'],
] as const;

function blockContainer(json: JSONContent): JSONContent {
  let container = json.content?.find((node) => node.type === 'container') ?? json;
  while (
    container.content?.length === 1 &&
    ['body', 'container'].includes(container.content[0].type ?? '')
  )
    container = container.content[0];
  return container;
}

interface Props {
  initialHtml: string;
  variables: EmailVariable[];
  onChange: (html: string, text: string) => void;
  onPending: (pending: boolean) => void;
  onError: (message: string | null) => void;
  disabled?: boolean;
}

export default function EmailBlockEditor({
  initialHtml,
  variables,
  onChange,
  onPending,
  onError,
  disabled = false,
}: Props) {
  const ref = useRef<EmailEditorRef>(null);
  const revision = useRef(0);
  useEffect(
    () => () => {
      revision.current++;
      onPending(false);
    },
    [onPending],
  );
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [document, setDocument] = useState<JSONContent | null>(null);
  const [imageDialog, setImageDialog] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imageError, setImageError] = useState('');
  const extensions = useMemo(
    () => [
      StarterKit.configure(),
      EmailTheming.configure({ theme: 'basic' }),
      TemplateVariable,
      EmailImage,
    ],
    [],
  );
  const [content] = useState(
    () => readBlockDocument(initialHtml) ?? prepareLegacyHtml(initialHtml),
  );

  const exportDocument = async (handle: EmailEditorRef) => {
    const current = ++revision.current;
    setDocument(handle.getJSON());
    setHistory({ undo: !!handle.editor?.can().undo(), redo: !!handle.editor?.can().redo() });
    onPending(true);
    onError(null);
    try {
      if (!handle.editor) throw new Error('Editor is not ready.');
      const json = handle.getJSON();
      const { unformattedHtml, text } = await composeReactEmail({ editor: handle.editor });
      if (current === revision.current)
        onChange(
          storeBlockDocument(unformattedHtml, json),
          preservePlainTextVariables(text, unformattedHtml),
        );
    } catch {
      if (current === revision.current)
        onError(
          'Could not prepare the email. Make another edit to retry; your draft is still in the editor.',
        );
    } finally {
      if (current === revision.current) onPending(false);
    }
  };

  const insert = (type: string) => {
    const editor = ref.current?.editor;
    if (!editor || disabled) return;
    if (type === 'image') {
      setImageDialog(true);
      return;
    }
    if (type === 'twoColumns') {
      editor.chain().focus().insertColumns(2).run();
      return;
    }
    const text =
      type === 'heading' ? 'Your heading' : type === 'button' ? 'Call to action' : 'Your text';
    const node: JSONContent =
      type === 'horizontalRule'
        ? { type }
        : type === 'bulletList'
          ? {
              type,
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
                },
              ],
            }
          : {
              type,
              attrs:
                type === 'heading'
                  ? { level: 2 }
                  : type === 'button'
                    ? { href: 'https://queer.guide' }
                    : {},
              content: [{ type: 'text', text }],
            };
    const selection = editor.state.selection.$from;
    let containerDepth = 0;
    for (let depth = 1; depth <= selection.depth; depth++) {
      if (['container', 'body'].includes(selection.node(depth).type.name)) containerDepth = depth;
    }
    const position = containerDepth
      ? selection.depth > containerDepth
        ? selection.after(containerDepth + 1)
        : selection.end(containerDepth)
      : editor.state.doc.content.size;
    editor.chain().focus().insertContentAt(position, node).run();
  };

  const changeBlock = (index: number, action: 'up' | 'down' | 'copy' | 'delete') => {
    const editor = ref.current?.editor;
    if (!editor || disabled) return;
    const json = editor.getJSON();
    const container = blockContainer(json);
    const blocks = [...(container.content ?? [])];
    if (action === 'delete') blocks.splice(index, 1);
    if (action === 'copy') blocks.splice(index + 1, 0, structuredClone(blocks[index]));
    if (action === 'up' && index > 0)
      [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
    if (action === 'down' && index < blocks.length - 1)
      [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]];
    // Replace only the content inside the existing container. Replacing the
    // entire document can undo the library's automatic container wrapper too.
    let start = 0;
    let size = editor.state.doc.content.size;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'container' && start === 0) {
        start = pos + 1;
        size = node.content.size;
        return false;
      }
      return true;
    });
    const next = blocks.length ? blocks : [{ type: 'paragraph' }];
    editor.view.dispatch(
      closeHistory(editor.state.tr).replaceWith(
        start,
        start + size,
        next.map((node) => editor.schema.nodeFromJSON(node)),
      ),
    );
  };

  return (
    <fieldset
      disabled={disabled}
      className="email-block-editor min-w-0 space-y-4"
      aria-disabled={disabled}
    >
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Email blocks">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Plus size={16} className="mr-2" />
              Add block
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {BLOCKS.map(([type, label]) => (
              <DropdownMenuItem key={type} onSelect={() => insert(type)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={!variables.length}>
              Insert variable
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {variables.map((variable) => (
              <DropdownMenuItem
                key={variable.name}
                onSelect={() =>
                  ref.current?.editor
                    ?.chain()
                    .focus()
                    .insertContent({ type: 'templateVariable', attrs: { name: variable.name } })
                    .run()
                }
              >{`{{${variable.name}}}`}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Undo"
          disabled={disabled || !history.undo}
          onClick={() => ref.current?.editor?.chain().focus().undo().run()}
        >
          <Undo2 size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Redo"
          disabled={disabled || !history.redo}
          onClick={() => ref.current?.editor?.chain().focus().redo().run()}
        >
          <Redo2 size={18} />
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Select text to format it. Use Add block to build your email; select a block to adjust its
        properties.
      </p>
      <div className="email-block-layout">
        <EmailEditor
          ref={ref}
          content={content}
          editable={!disabled}
          extensions={extensions}
          className="email-canvas"
          onUpdate={exportDocument}
          onReady={(handle) => {
            if (handle.editor) {
              handle.editor.view.dom.setAttribute('aria-label', 'Email block content');
              handle.editor.view.dom.setAttribute('role', 'textbox');
              handle.editor.view.dom.setAttribute('aria-multiline', 'true');
            }
            if (readBlockDocument(initialHtml)) {
              setDocument(handle.getJSON());
            } else {
              void exportDocument(handle);
            }
          }}
        >
          <EmailInspector />
        </EmailEditor>
      </div>
      <details className="rounded-element border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Arrange blocks ({document ? (blockContainer(document).content?.length ?? 0) : 0})
        </summary>
        <ol className="mt-4 space-y-2">
          {document &&
            blockContainer(document).content?.map((block, index) => (
              <li key={index} className="flex flex-wrap items-center gap-1">
                <span className="mr-auto text-sm">
                  {index + 1}. {BLOCKS.find(([type]) => type === block.type)?.[1] ?? block.type}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Move block ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => changeBlock(index, 'up')}
                >
                  <ArrowUp size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Move block ${index + 1} down`}
                  disabled={
                    index === (document ? (blockContainer(document).content?.length ?? 0) : 0) - 1
                  }
                  onClick={() => changeBlock(index, 'down')}
                >
                  <ArrowDown size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Duplicate block ${index + 1}`}
                  onClick={() => changeBlock(index, 'copy')}
                >
                  <Copy size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete block ${index + 1}`}
                  onClick={() => changeBlock(index, 'delete')}
                >
                  <Trash2 size={16} />
                </Button>
              </li>
            ))}
        </ol>
      </details>
      <Dialog open={imageDialog} onOpenChange={setImageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add image</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="email-image-url">Image URL</Label>
            <Input
              id="email-image-url"
              type="url"
              placeholder="https://…"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-image-alt">Alternative text</Label>
            <Input
              id="email-image-alt"
              value={imageAlt}
              onChange={(event) => setImageAlt(event.target.value)}
            />
          </div>
          {imageError && (
            <p role="alert" className="text-sm text-destructive">
              {imageError}
            </p>
          )}
          <Button
            onClick={() => {
              if (disabled) return;
              try {
                const url = new URL(imageUrl);
                if (url.protocol !== 'https:') throw new Error();
              } catch {
                setImageError('Use a valid https image URL.');
                return;
              }
              ref.current?.editor?.chain().focus().setImage({ src: imageUrl, alt: imageAlt }).run();
              setImageDialog(false);
              setImageUrl('');
              setImageAlt('');
              setImageError('');
            }}
          >
            <ImageIcon size={16} className="mr-2" />
            Insert image
          </Button>
        </DialogContent>
      </Dialog>
    </fieldset>
  );
}
