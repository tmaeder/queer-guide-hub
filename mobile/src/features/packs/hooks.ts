import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { packDb } from './db';
import type { PackIndexEntry } from './format';
import { createPackService, packsConfigured } from './service';
import { listInstalled } from './store';

const service = async () => createPackService(await packDb());

export const packKeys = {
  index: ['packs', 'index'] as const,
  installed: ['packs', 'installed'] as const,
};

export function usePackIndex() {
  return useQuery({
    queryKey: packKeys.index,
    queryFn: async () => (await service()).fetchIndex(),
    enabled: packsConfigured(),
    staleTime: 60 * 60_000,
    retry: 1,
  });
}

export function useInstalledPacks() {
  return useQuery({
    queryKey: packKeys.installed,
    queryFn: async () => listInstalled(await packDb()),
  });
}

export function useInstallPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: PackIndexEntry) => (await service()).install(entry),
    onSuccess: () => qc.invalidateQueries({ queryKey: packKeys.installed }),
  });
}

export function useRemovePack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await service()).remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: packKeys.installed }),
  });
}
