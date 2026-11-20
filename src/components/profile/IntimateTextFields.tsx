import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FlatField } from '@/components/ui/FlatFieldGroup';
import { useToast } from '@/hooks/use-toast';
import {
  useMyIntimateProfile,
  useMyIntimateText,
  useSetIntimateText,
} from '@/hooks/useIntimateProfile';

/**
 * The intimate profile's "About me", edited in the Profile section. Renders nothing
 * until the member has an intimate profile (18+ consent given): the text only shows
 * to other opted-in members.
 */
export function IntimateAboutField() {
  const { toast } = useToast();
  const { data: me } = useMyIntimateProfile();
  const { data: text } = useMyIntimateText();
  const setText = useSetIntimateText();
  const [value, setValue] = useState<string | null>(null);

  if (!me?.consent_18plus_at || !text) return null;
  const current = value ?? text.about_intimate ?? '';
  const dirty = value !== null && value !== (text.about_intimate ?? '');

  const save = async () => {
    try {
      await setText.mutateAsync({
        aboutIntimate: current.trim() || null,
        lookingFor: text.looking_for,
      });
      setValue(null);
      toast({ title: 'About me saved' });
    } catch (e) {
      toast({ title: 'Could not save', description: String(e), variant: 'destructive' });
    }
  };

  return (
    <section aria-labelledby="settings-intimate-about" className="flex flex-col gap-2">
      <h3
        id="settings-intimate-about"
        className="text-2xs font-bold uppercase tracking-wide text-muted-foreground"
      >
        About me (intimate profile)
      </h3>
      <FlatField label="Shown only to members who also opted in" htmlFor="intimate-about">
        <Textarea
          id="intimate-about"
          maxLength={1000}
          placeholder="A few lines about you."
          value={current}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-element"
        />
      </FlatField>
      <Button
        onClick={save}
        disabled={!dirty || setText.isPending}
        className="self-start rounded-element"
      >
        {setText.isPending ? 'Saving…' : 'Save'}
      </Button>
    </section>
  );
}
