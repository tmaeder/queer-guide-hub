import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Merkliste — a shared editorial to-do list, ported from the PHP tool. Every
 * staff member sees and edits the same list. Not a moderation queue; just a
 * free-form reminder board for the team.
 */

interface Task {
  id: string;
  text: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
}

export default function EditorialTasks() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const key = ['editorial-tasks'];

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await untypedFrom('editorial_tasks')
        .select('id, text, done, done_at, created_at')
        .order('done', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const add = useMutation({
    mutationFn: async (t: string) => {
      const { error } = await untypedFrom('editorial_tasks').insert({
        text: t,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: () => toast.error('Could not add task'),
  });

  const toggle = useMutation({
    mutationFn: async (task: Task) => {
      const { error } = await untypedFrom('editorial_tasks')
        .update({ done: !task.done, done_at: task.done ? null : new Date().toISOString() })
        .eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error('Could not update task'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('editorial_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error('Could not remove task'),
  });

  const { open, done } = useMemo(() => {
    const rows = data ?? [];
    return { open: rows.filter((r) => !r.done), done: rows.filter((r) => r.done) };
  }, [data]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-headline flex items-center gap-2">
          <ListChecks size={22} /> Merkliste
        </h1>
        <p className="text-13 text-muted-foreground">Shared editorial to-do list.</p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate(text.trim());
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task…"
          disabled={add.isPending}
        />
        <Button type="submit" disabled={add.isPending || !text.trim()}>
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </form>

      {isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
      {error && <p className="text-13 text-destructive">Could not load tasks.</p>}

      {!isLoading && !error && (
        <>
          <ul className="flex flex-col gap-1">
            {open.length === 0 ? (
              <li className="text-13 text-muted-foreground">No open tasks.</li>
            ) : (
              open.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-element border border-border p-2"
                >
                  <Checkbox checked={t.done} onCheckedChange={() => toggle.mutate(t)} />
                  <span className="min-w-0 flex-1 text-13">{t.text}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive"
                    aria-label="Delete task"
                    onClick={() => remove.mutate(t.id)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </li>
              ))
            )}
          </ul>

          {done.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                Done ({done.length})
              </p>
              {done.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-element border border-border p-2 opacity-60"
                >
                  <Checkbox checked onCheckedChange={() => toggle.mutate(t)} />
                  <span className="min-w-0 flex-1 text-13 line-through">{t.text}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive"
                    aria-label="Delete task"
                    onClick={() => remove.mutate(t.id)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
