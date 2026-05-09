import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Shuffle } from 'lucide-react';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function generatePassword(): string {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits;
  let pw = '';
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  for (let i = 0; i < 9; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }
  return pw
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: generatePassword(),
    display_name: '',
    first_name: '',
    last_name: '',
    pronouns: '',
    location: '',
  });

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const reset = () => {
    setForm({
      email: '',
      password: generatePassword(),
      display_name: '',
      first_name: '',
      last_name: '',
      pronouns: '',
      location: '',
    });
  };

  const handleSubmit = async () => {
    if (!form.email.trim()) {
      toast.error('Email is required');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, string> = {
        email: form.email.trim(),
        password: form.password,
      };
      if (form.display_name.trim()) body.display_name = form.display_name.trim();
      if (form.first_name.trim()) body.first_name = form.first_name.trim();
      if (form.last_name.trim()) body.last_name = form.last_name.trim();
      if (form.pronouns.trim()) body.pronouns = form.pronouns.trim();
      if (form.location.trim()) body.location = form.location.trim();

      const { data, error } = await supabase.functions.invoke('admin-create-user', { body });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'User created',
        description: `${data.user?.email ?? form.email} has been created.`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-table', 'profiles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-stats'] });
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(`Failed to create user: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create User</AlertDialogTitle>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          <Field
            label="Email *"
            value={form.email}
            onChange={(v) => set('email', v)}
            type="email"
          />

          <div>
            <Label className="text-sm mb-1 block">Password *</Label>
            <div className="flex gap-2">
              <Input
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                className="flex-1 font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => set('password', generatePassword())}
                title="Generate random password"
                className="shrink-0"
              >
                <Shuffle className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <Field
            label="Display Name"
            value={form.display_name}
            onChange={(v) => set('display_name', v)}
            placeholder="Defaults to email"
          />

          <div className="flex gap-3">
            <div className="flex-1">
              <Field
                label="First Name"
                value={form.first_name}
                onChange={(v) => set('first_name', v)}
              />
            </div>
            <div className="flex-1">
              <Field
                label="Last Name"
                value={form.last_name}
                onChange={(v) => set('last_name', v)}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Field
                label="Pronouns"
                value={form.pronouns}
                onChange={(v) => set('pronouns', v)}
                placeholder="e.g. they/them"
              />
            </div>
            <div className="flex-1">
              <Field label="Location" value={form.location} onChange={(v) => set('location', v)} />
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Create User'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-sm mb-1 block">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
