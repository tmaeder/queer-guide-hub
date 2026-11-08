import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

export interface FileRejection {
  file: File;
  reason: string;
}

interface UseFileDropOptions {
  onDrop: (files: File[]) => void;
  onDropRejected?: (rejections: FileRejection[]) => void;
  /** MIME types or wildcards (`image/*`), same syntax as `<input accept>`. */
  accept?: string[];
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
}

export function matchesAccept(file: File, accept?: string[]) {
  if (!accept?.length) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return accept.some((rule) => {
    const r = rule.trim().toLowerCase();
    if (r.startsWith('.')) return name.endsWith(r);
    if (r.endsWith('/*')) return type.startsWith(r.slice(0, -1));
    return type === r;
  });
}

/** Native replacement for the react-dropzone subset this app used. */
export function useFileDrop({
  onDrop,
  onDropRejected,
  accept,
  maxSize,
  multiple = true,
  disabled = false,
}: UseFileDropOptions) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setDragActive] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || disabled) return;
      const all = multiple ? Array.from(list) : Array.from(list).slice(0, 1);
      const accepted: File[] = [];
      const rejected: FileRejection[] = [];
      for (const file of all) {
        if (!matchesAccept(file, accept)) rejected.push({ file, reason: 'File type not accepted' });
        else if (maxSize != null && file.size > maxSize)
          rejected.push({
            file,
            reason: `File is larger than ${Math.round(maxSize / 1048576)} MB`,
          });
        else accepted.push(file);
      }
      if (rejected.length) onDropRejected?.(rejected);
      onDrop(accepted);
    },
    [accept, maxSize, multiple, disabled, onDrop, onDropRejected],
  );

  const open = () => {
    if (!disabled) inputRef.current?.click();
  };

  const getRootProps = () => ({
    role: 'button' as const,
    tabIndex: disabled ? -1 : 0,
    'aria-disabled': disabled || undefined,
    onClick: open,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (!disabled) setDragActive(true);
    },
    onDragLeave: () => setDragActive(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
  });

  const getInputProps = () => ({
    ref: inputRef,
    type: 'file' as const,
    hidden: true,
    tabIndex: -1,
    multiple,
    disabled,
    accept: accept?.join(','),
    onClick: (e: MouseEvent) => e.stopPropagation(),
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      e.target.value = '';
    },
  });

  return { getRootProps, getInputProps, isDragActive, open };
}
