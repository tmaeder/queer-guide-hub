import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, X, CheckCircle, AlertTriangle } from 'lucide-react';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/wav',
];

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export function MediaUploadZone() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const uploadFile = useCallback(async (uf: UploadFile) => {
    setFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'uploading' as const, progress: 10 } : f));

    try {
      const ext = uf.file.name.split('.').pop() || 'bin';
      const path = `${crypto.randomUUID()}.${ext}`;

      setFiles(prev => prev.map(f => f.id === uf.id ? { ...f, progress: 30 } : f));

      const { error: storageError } = await supabase.storage
        .from('cms-media')
        .upload(path, uf.file, { contentType: uf.file.type });

      if (storageError) throw storageError;

      setFiles(prev => prev.map(f => f.id === uf.id ? { ...f, progress: 70 } : f));

      const { error: dbError } = await untypedFrom('cms_media').insert({
        filename: path,
        original_filename: uf.file.name,
        mime_type: uf.file.type,
        file_size: uf.file.size,
        storage_path: path,
      });

      if (dbError) throw dbError;

      setFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'done' as const, progress: 100 } : f));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'error' as const, error: message } : f));
    }
  }, []);

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles: UploadFile[] = accepted.map(file => ({
      file,
      id: crypto.randomUUID(),
      progress: 0,
      status: 'pending' as const,
    }));

    setFiles(prev => [...prev, ...newFiles]);
    setExpanded(true);

    for (const uf of newFiles) {
      uploadFile(uf);
    }
  }, [uploadFile]);

  const onDropEnd = useCallback(() => {
    const allDone = files.every(f => f.status === 'done' || f.status === 'error');
    if (allDone && files.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['unified-media'] });
    }
  }, [files, queryClient]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_TYPES.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: MAX_FILE_SIZE,
    onDropRejected: (rejections) => {
      for (const r of rejections) {
        const reason = r.errors[0]?.message || 'Invalid file';
        toast({ title: `Rejected: ${r.file.name}`, description: reason, variant: 'destructive' });
      }
    },
  });

  const clearCompleted = () => {
    setFiles(prev => prev.filter(f => f.status !== 'done'));
    queryClient.invalidateQueries({ queryKey: ['unified-media'] });
    if (files.every(f => f.status === 'done')) {
      setExpanded(false);
    }
  };

  const activeCount = files.filter(f => f.status === 'uploading' || f.status === 'pending').length;
  const doneCount = files.filter(f => f.status === 'done').length;

  return (
    <div className="flex flex-col gap-2">
      <div
        {...getRootProps()}
        className={`border border-dashed p-4 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-foreground bg-muted' : 'border-border hover:border-foreground/50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Upload style={{ height: 16, width: 16 }} />
          {isDragActive ? 'Drop files to upload' : 'Drop files here or click to upload'}
        </div>
      </div>

      {expanded && files.length > 0 && (
        <div className="border border-border p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {activeCount > 0 && `Uploading ${activeCount}...`}
              {activeCount === 0 && doneCount > 0 && `${doneCount} uploaded`}
            </p>
            <div className="flex gap-1">
              {doneCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCompleted}>
                  Clear completed
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setExpanded(false); onDropEnd(); }}
              >
                <X style={{ height: 14, width: 14 }} />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-2 text-xs">
                {f.status === 'done' && <CheckCircle style={{ height: 12, width: 12 }} />}
                {f.status === 'error' && <AlertTriangle style={{ height: 12, width: 12 }} />}
                <span className="truncate flex-1">{f.file.name}</span>
                {(f.status === 'uploading' || f.status === 'pending') && (
                  <Progress value={f.progress} className="w-20 h-1" />
                )}
                {f.status === 'error' && (
                  <span className="text-muted-foreground">{f.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
