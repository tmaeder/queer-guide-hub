/**
 * SaveButton — editor save control with state feedback:
 * idle → "Saving..." → "Saved ✓" flash (1.5s) → idle. Failures surface via
 * the editor's error banner/toast, not here.
 */

import { useEffect, useRef, useState } from 'react';
import { Save, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SaveButtonProps {
  isDirty: boolean;
  isSaving: boolean;
  /** True when the last save attempt left a save/conflict error. */
  hasError: boolean;
  onSave: () => void;
  shortcutLabel: string;
}

export function SaveButton({ isDirty, isSaving, hasError, onSave, shortcutLabel }: SaveButtonProps) {
  const [justSaved, setJustSaved] = useState(false);
  const prevSaving = useRef(isSaving);

  useEffect(() => {
    if (prevSaving.current && !isSaving && !hasError) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1500);
      return () => clearTimeout(t);
    }
    prevSaving.current = isSaving;
  }, [isSaving, hasError]);

  useEffect(() => {
    prevSaving.current = isSaving;
  }, [isSaving]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          disabled={(!isDirty && !justSaved) || isSaving}
          onClick={onSave}
          className="font-semibold normal-case min-w-[80px]"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" aria-label="Loading" />
          ) : justSaved ? (
            <Check className="h-4 w-4 mr-1" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          {isSaving ? 'Saving...' : justSaved ? 'Saved' : 'Save'}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Save ({shortcutLabel})</TooltipContent>
    </Tooltip>
  );
}
