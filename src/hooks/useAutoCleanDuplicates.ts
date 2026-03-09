import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ==================== Types ====================

export interface AutoCleanTypeResult {
  scanned: number;
  auto_merged: number;
  flagged_for_review: number;
  errors: string[];
  whitespace_fixed?: number;
  junction_fixed?: number;
  details?: any;
  total?: number;
  has_more?: boolean;
}

export interface StagingCleanResult {
  phase1_skipped_duplicates: number;
  phase2_skipped_merge_candidates: number;
  phase3_scanned_pending: number;
  phase3_new_duplicates: number;
  phase3_new_merge_candidates: number;
  phase3_new_unique: number;
  total_cleared: number;
  dry_run: boolean;
  errors: string[];
  error?: string;
}

export interface AutoCleanResult {
  by_type: Record<string, AutoCleanTypeResult>;
  total_scanned: number;
  total_auto_merged: number;
  total_flagged: number;
  errors: string[];
  dry_run: boolean;
  staging?: StagingCleanResult | null;
}

export interface DuplicateCounts {
  venues: number;
  events: number;
  personalities: number;
  news_articles: number;
  cities: number;
  total: number;
}

export type BatchPhase = 'idle' | 'scanning' | 'processing' | 'done' | 'error';

export interface TypeScanProgress {
  scanned: number;
  total: number;
  done: boolean;
}

export interface BatchProgress {
  phase: BatchPhase;
  currentType: string | null;
  currentOffset: number;
  currentTotal: number;
  typesCompleted: number;
  typesTotal: number;
  totalScanned: number;
  message: string;
  typeProgress: Record<string, TypeScanProgress>;
}

// ==================== Constants ====================

const BATCH_SIZE = 500;
const DEFAULT_ENTITY_TYPES = ['venues', 'events', 'personalities', 'news_articles', 'cities'];

const INITIAL_PROGRESS: BatchProgress = {
  phase: 'idle',
  currentType: null,
  currentOffset: 0,
  currentTotal: 0,
  typesCompleted: 0,
  typesTotal: 0,
  totalScanned: 0,
  message: '',
  typeProgress: {},
};

// ==================== Helpers ====================

async function getAuthToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

async function callEdgeFunction(_token: string, params: Record<string, any>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('clean-merge-all-duplicates', {
    body: params,
  });
  if (error) {
    throw new Error(error.message || 'Edge function call failed');
  }
  return data;
}

// ==================== Hooks ====================

/** Counts pending duplicate pairs per entity type */
export function useDuplicateCounts() {
  return useQuery({
    queryKey: ['duplicate-counts'],
    queryFn: async (): Promise<DuplicateCounts> => {
      const { data, error } = await supabase
        .from('scraper_dedupe_decisions' as any)
        .select('entity_type')
        .eq('decision', 'pending');

      if (error) {
        console.error('Failed to fetch duplicate counts:', error);
        return { venues: 0, events: 0, personalities: 0, news_articles: 0, cities: 0, total: 0 };
      }

      const counts: DuplicateCounts = {
        venues: 0,
        events: 0,
        personalities: 0,
        news_articles: 0,
        cities: 0,
        total: 0,
      };
      for (const row of (data || []) as any[]) {
        const t = row.entity_type as keyof Omit<DuplicateCounts, 'total'>;
        if (t in counts && t !== 'total') (counts as any)[t]++;
        counts.total++;
      }
      return counts;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Batched auto-clean hook that scans ALL records across all entity types.
 *
 * Phase 1 (Scanning): For each entity type, calls the edge function with
 *   scanOnly=true and increasing offsets (0, 500, 1000...) until all records
 *   are scanned. Progress is reported in real-time.
 *
 * Phase 2 (Processing): A single call with scanOnly=false, limit=0 processes
 *   all accumulated pending decisions (auto-merge + flag) and cleans staging.
 */
export function useBatchedAutoClean() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const abortRef = useRef(false);

  const [progress, setProgress] = useState<BatchProgress>(INITIAL_PROGRESS);
  const [lastResult, setLastResult] = useState<AutoCleanResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const run = useCallback(
    async (params: {
      autoMergeThreshold?: number;
      reviewThreshold?: number;
      entityTypes?: string[];
      dryRun?: boolean;
    }) => {
      abortRef.current = false;
      setIsRunning(true);
      setLastResult(null);

      const entityTypes = params.entityTypes ?? DEFAULT_ENTITY_TYPES;
      const autoMergeThreshold = params.autoMergeThreshold ?? 0.9;
      const reviewThreshold = params.reviewThreshold ?? 0.7;
      const dryRun = params.dryRun ?? true;

      // Accumulated results
      const accumulatedByType: Record<string, AutoCleanTypeResult> = {};
      let totalScanned = 0;
      const allErrors: string[] = [];

      // Initialize per-type progress
      const typeProgress: Record<string, TypeScanProgress> = {};
      for (const type of entityTypes) {
        typeProgress[type] = { scanned: 0, total: 0, done: false };
        accumulatedByType[type] = {
          scanned: 0,
          auto_merged: 0,
          flagged_for_review: 0,
          errors: [],
        };
      }

      // Emit initial progress
      setProgress({
        phase: 'scanning',
        currentType: entityTypes[0] ?? null,
        currentOffset: 0,
        currentTotal: 0,
        typesCompleted: 0,
        typesTotal: entityTypes.length,
        totalScanned: 0,
        message: 'Starting scan…',
        typeProgress: { ...typeProgress },
      });

      try {
        const token = await getAuthToken();

        // ========== Phase 1: Scan all types in batches ==========
        for (let typeIdx = 0; typeIdx < entityTypes.length; typeIdx++) {
          if (abortRef.current) break;

          const type = entityTypes[typeIdx];
          let offset = 0;
          let hasMore = true;
          let typeScanned = 0;
          let typeTotal = 0;

          while (hasMore && !abortRef.current) {
            const msg =
              typeTotal > 0
                ? `Scanning ${type} (${Math.min(offset + BATCH_SIZE, typeTotal).toLocaleString()}/${typeTotal.toLocaleString()})…`
                : `Scanning ${type}…`;

            setProgress({
              phase: 'scanning',
              currentType: type,
              currentOffset: offset,
              currentTotal: typeTotal,
              typesCompleted: typeIdx,
              typesTotal: entityTypes.length,
              totalScanned,
              message: msg,
              typeProgress: { ...typeProgress },
            });

            try {
              const result = await callEdgeFunction(token, {
                entityTypes: [type],
                limit: BATCH_SIZE,
                offset,
                scanOnly: true,
                dryRun,
                autoMergeThreshold,
                reviewThreshold,
                includeStaging: false,
              });

              const typeResult = result.by_type?.[type];
              if (typeResult) {
                const batchScanned = typeResult.scanned || 0;
                typeScanned += batchScanned;
                totalScanned += batchScanned;
                typeTotal = typeResult.total || typeTotal;
                hasMore = typeResult.has_more ?? false;

                accumulatedByType[type].scanned = typeScanned;
                accumulatedByType[type].total = typeTotal;
                typeProgress[type] = { scanned: typeScanned, total: typeTotal, done: !hasMore };

                if (typeResult.errors?.length) {
                  accumulatedByType[type].errors.push(...typeResult.errors);
                }
              } else {
                hasMore = false;
              }

              if (result.errors?.length) {
                allErrors.push(...result.errors);
              }
            } catch (err: any) {
              accumulatedByType[type].errors.push(err.message);
              allErrors.push(`${type}: ${err.message}`);
              hasMore = false; // Move to next type on error
            }

            offset += BATCH_SIZE;
          }

          // Mark type as done
          typeProgress[type] = { ...typeProgress[type], done: true };
        }

        if (abortRef.current) {
          setProgress((p) => ({ ...p, phase: 'idle', message: 'Aborted' }));
          setIsRunning(false);
          toast({
            title: 'Scan Aborted',
            description: `Scanned ${totalScanned.toLocaleString()} records before abort.`,
          });
          return;
        }

        // ========== Phase 2: Process decisions + staging ==========
        setProgress((p) => ({
          ...p,
          phase: 'processing',
          currentType: null,
          message: dryRun ? 'Analyzing results…' : 'Processing merges & staging…',
          typeProgress: { ...typeProgress },
        }));

        const processResult = await callEdgeFunction(token, {
          entityTypes,
          limit: 0, // Skip scanning — process pending decisions only
          scanOnly: false,
          dryRun,
          autoMergeThreshold,
          reviewThreshold,
          includeStaging: true,
        });

        // Merge Phase 2 results (merge/flag counts) into accumulated scan data
        for (const [type, data] of Object.entries(processResult.by_type || {}) as [string, any][]) {
          if (accumulatedByType[type]) {
            accumulatedByType[type].auto_merged = data.auto_merged || 0;
            accumulatedByType[type].flagged_for_review = data.flagged_for_review || 0;
            accumulatedByType[type].whitespace_fixed = data.whitespace_fixed;
            accumulatedByType[type].junction_fixed = data.junction_fixed;
            if (data.errors?.length) {
              accumulatedByType[type].errors.push(...data.errors);
            }
          } else {
            // New type from processing phase (e.g., tags)
            accumulatedByType[type] = data;
          }
        }

        const finalResult: AutoCleanResult = {
          by_type: accumulatedByType,
          total_scanned: totalScanned,
          total_auto_merged: processResult.total_auto_merged || 0,
          total_flagged: processResult.total_flagged || 0,
          errors: [...allErrors, ...(processResult.errors || [])],
          dry_run: dryRun,
          staging: processResult.staging || null,
        };

        setLastResult(finalResult);
        setProgress({
          phase: 'done',
          currentType: null,
          currentOffset: 0,
          currentTotal: 0,
          typesCompleted: entityTypes.length,
          typesTotal: entityTypes.length,
          totalScanned,
          message: 'Complete',
          typeProgress: { ...typeProgress },
        });

        // Invalidate related queries
        queryClient.invalidateQueries({ queryKey: ['duplicate-pairs'] });
        queryClient.invalidateQueries({ queryKey: ['duplicate-counts'] });
        queryClient.invalidateQueries({ queryKey: ['review-counts'] });
        queryClient.invalidateQueries({ queryKey: ['merge-history'] });
        queryClient.invalidateQueries({ queryKey: ['staging-items'] });

        const action = dryRun ? 'Full scan complete' : 'Auto-clean complete';
        const stagingMsg = finalResult.staging?.total_cleared
          ? ` | Staging cleared: ${finalResult.staging.total_cleared}`
          : '';
        toast({
          title: action,
          description: `Scanned: ${totalScanned.toLocaleString()}, ${dryRun ? 'Would merge' : 'Merged'}: ${finalResult.total_auto_merged}, Flagged: ${finalResult.total_flagged}${stagingMsg}`,
        });
      } catch (err: any) {
        setProgress((p) => ({ ...p, phase: 'error', message: err.message }));
        toast({ title: 'Auto-clean Failed', description: err.message, variant: 'destructive' });
      } finally {
        setIsRunning(false);
      }
    },
    [queryClient, toast],
  );

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { run, abort, progress, lastResult, isRunning };
}
