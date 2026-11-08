// Types for ./gate-rpc.mjs, so src/ tests can import it under strict TS.
export interface GateRpcResult {
  ok: boolean;
  status: number;
  body: string | null;
  data: unknown;
}

export const NO_RESPONSE: 0;
export const CF_ORIGIN_ERROR_MIN: number;
export const CF_ORIGIN_ERROR_MAX: number;
export const SNAPSHOT_MAX_AGE_MIN: number;

export function callRpc(url: string, init?: RequestInit): Promise<GateRpcResult>;
export function notEvaluated(result: GateRpcResult | null | undefined): boolean;
export function stallReason(result: GateRpcResult | null | undefined): string | null;
export function readGateSnapshot(
  base: string,
  key: string,
  rpc: string,
  maxAgeMin?: number,
): Promise<GateRpcResult | null>;
