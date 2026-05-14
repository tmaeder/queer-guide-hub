import { useCallback, useEffect, useState } from "react";
import { fetchMySubmissions, listWatched, type SubmissionRow, type WatchedRow } from "../../shared/api";
import { getValidAccessToken } from "../../shared/auth";

interface LazyState<T> {
  rows: T[] | null;
  error: string | null;
  reload: () => Promise<void>;
}

function useLazy<T>(active: boolean, loader: (token: string) => Promise<T[]>): LazyState<T> {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRows(null);
    setError(null);
    const token = await getValidAccessToken();
    if (!token) { setError("not signed in"); return; }
    try { setRows(await loader(token)); }
    catch (e) { setError(e instanceof Error ? e.message : "failed"); }
  }, [loader]);

  useEffect(() => {
    if (active && rows === null && !error) void reload();
  }, [active, rows, error, reload]);

  return { rows, error, reload };
}

export function useHistory(active: boolean): LazyState<SubmissionRow> {
  return useLazy<SubmissionRow>(active, fetchMySubmissions);
}

export function useWatched(active: boolean): LazyState<WatchedRow> {
  return useLazy<WatchedRow>(active, listWatched);
}
