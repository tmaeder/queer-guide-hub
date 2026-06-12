import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SaveDefaultPromptProps {
  message: string;
  onSave: () => Promise<void> | void;
  onDismiss: () => void;
}

/**
 * One-line "save as my default" affordance shown on first use of a filter
 * (gated to max one per session by useDefaultPromptGate).
 */
export function SaveDefaultPrompt({ message, onSave, onDismiss }: SaveDefaultPromptProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
      onDismiss();
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-element border border-border bg-muted/40 px-2 py-1.5">
      <p className="flex-1 text-13 text-muted-foreground">{message}</p>
      <Button size="sm" className="rounded-element" disabled={saving} onClick={() => void handleSave()}>
        {t('prefs.saveDefault.save', 'Save')}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-element"
        aria-label={t('prefs.saveDefault.dismiss', 'Not now')}
        onClick={onDismiss}
      >
        <X size={14} />
      </Button>
    </div>
  );
}
