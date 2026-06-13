import { ShieldCheck, ShieldAlert, Skull, AlertTriangle } from 'lucide-react';
import type { TripSafetyReport } from '@/hooks/useTripSafety';

export type OverallRisk = TripSafetyReport['overallRisk'];

export interface RiskVisual {
  bg: string;
  fg: string;
  border: string;
  Icon: typeof ShieldCheck;
}

/**
 * The one place LGBTQ+ safety risk maps to the locked traffic-light palette
 * (low/moderate/high/critical). User-locked design exception — safety reads
 * over monochrome consistency for travelers in high-risk destinations.
 *
 * Shared by TripSafetyBriefing (per-trip) and SafetyVerdict (per-country) so
 * the two surfaces can never drift. Raw hex lives ONLY here; both consumers
 * stay literal-free and the eslint hex-ban allowlists this single module.
 *
 * Not a React hook (no hooks used) — the `use` prefix mirrors the original
 * call site and signals "theme-aware, read at render". Call unconditionally.
 */
export function useRiskVisual(risk: OverallRisk): RiskVisual {
  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const bg = {
    low: isDark ? '#052e1a' : '#ecfdf5',
    moderate: isDark ? '#3a2a06' : '#fffbeb',
    high: isDark ? '#3f1515' : '#fef2f2',
    critical: isDark ? '#2a0606' : '#fef2f2',
  }[risk];
  const fg = {
    low: isDark ? '#34d399' : '#047857',
    moderate: isDark ? '#fbbf24' : '#b45309',
    high: isDark ? '#f87171' : '#b91c1c',
    critical: isDark ? '#fca5a5' : '#7f1d1d',
  }[risk];
  const border = {
    low: isDark ? '#064e3b' : '#a7f3d0',
    moderate: isDark ? '#78350f' : '#fcd34d',
    high: isDark ? '#7f1d1d' : '#fca5a5',
    critical: isDark ? '#450a0a' : '#dc2626',
  }[risk];
  const Icon = {
    low: ShieldCheck,
    moderate: AlertTriangle,
    high: ShieldAlert,
    critical: Skull,
  }[risk];
  return { bg, fg, border, Icon };
}
