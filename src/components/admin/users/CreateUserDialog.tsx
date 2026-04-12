import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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
import Box from '@mui/material/Box';
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
  const { toast } = useToast();
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
      toast({ title: 'Email is required', variant: 'destructive' });
      return;
    }
    if (form.password.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'destructive' });
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
      toast({
        title: 'Failed to create user',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
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

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Field
            label="Email *"
            value={form.email}
            onChange={(v) => set('email', v)}
            type="email"
          />

          <Box>
            <Label style={{ fontSize: '0.875rem', marginBottom: 4, display: 'block' }}>
              Password *
            </Label>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Input
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                style={{ flex: 1, fontFamily: 'monospace' }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => set('password', generatePassword())}
                title="Generate random password"
                style={{ flexShrink: 0 }}
              >
                <Shuffle style={{ height: 14, width: 14 }} />
              </Button>
            </Box>
          </Box>

          <Field
            label="Display Name"
            value={form.display_name}
            onChange={(v) => set('display_name', v)}
            placeholder="Defaults to email"
          />

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Box sx={{ flex: 1 }}>
              <Field
                label="First Name"
                value={form.first_name}
                onChange={(v) => set('first_name', v)}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Field
                label="Last Name"
                value={form.last_name}
                onChange={(v) => set('last_name', v)}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Box sx={{ flex: 1 }}>
              <Field
                label="Pronouns"
                value={form.pronouns}
                onChange={(v) => set('pronouns', v)}
                placeholder="e.g. they/them"
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Field label="Location" value={form.location} onChange={(v) => set('location', v)} />
            </Box>
          </Box>
        </Box>

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
    <Box>
      <Label style={{ fontSize: '0.875rem', marginBottom: 4, display: 'block' }}>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </Box>
  );
}
