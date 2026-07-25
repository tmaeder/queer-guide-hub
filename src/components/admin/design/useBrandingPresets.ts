import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { adminAction } from '@/lib/adminAction';
import { countOverrides, type BrandingDoc } from './tokenCatalog';

export type BrandingPreset = {
  id: string;
  name: string;
  doc: BrandingDoc;
  updated_at: string;
};

export type BrandingSchedule = {
  id: string;
  preset_id: string;
  starts_at: string;
  ends_at: string | null;
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'error';
  error: string | null;
  created_at: string;
};

export function useBrandingPresets() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['branding-presets'] });
    qc.invalidateQueries({ queryKey: ['branding-schedules'] });
  };

  const presets = useQuery({
    queryKey: ['branding-presets'],
    queryFn: async (): Promise<BrandingPreset[]> => {
      const { data, error } = await untypedFrom('site_branding_presets')
        .select('id,name,doc,updated_at')
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as BrandingPreset[];
    },
  });

  const schedules = useQuery({
    queryKey: ['branding-schedules'],
    queryFn: async (): Promise<BrandingSchedule[]> => {
      const { data, error } = await untypedFrom('site_branding_schedules')
        .select('id,preset_id,starts_at,ends_at,status,error,created_at')
        .in('status', ['pending', 'active'])
        .order('starts_at');
      if (error) throw error;
      return (data ?? []) as unknown as BrandingSchedule[];
    },
  });

  const savePreset = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await untypedRpc('branding_preset_save', { p_name: name });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await invalidate();
      await adminAction({ label: 'Preset saved', perform: () => undefined });
    },
  });

  const applyPreset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedRpc('branding_preset_apply', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      // The draft changed server-side — reseed the design controller's buffer.
      qc.invalidateQueries({ queryKey: ['site-branding'] });
      await adminAction({
        label: 'Preset applied to draft — review and publish',
        perform: () => undefined,
      });
    },
  });

  const deletePreset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedRpc('branding_preset_delete', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await invalidate();
      await adminAction({ label: 'Preset deleted', perform: () => undefined });
    },
  });

  const createSchedule = useMutation({
    mutationFn: async (v: { presetId: string; startsAt: string; endsAt: string | null }) => {
      const { error } = await untypedRpc('branding_schedule_create', {
        p_preset_id: v.presetId,
        p_starts_at: v.startsAt,
        p_ends_at: v.endsAt,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await invalidate();
      await adminAction({ label: 'Schedule created', perform: () => undefined });
    },
  });

  const cancelSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedRpc('branding_schedule_cancel', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await invalidate();
      qc.invalidateQueries({ queryKey: ['site-branding'] });
      await adminAction({ label: 'Schedule cancelled', perform: () => undefined });
    },
  });

  return { presets, schedules, savePreset, applyPreset, deletePreset, createSchedule, cancelSchedule };
}

export function presetOverrideCount(doc: BrandingDoc): number {
  return countOverrides(doc);
}
