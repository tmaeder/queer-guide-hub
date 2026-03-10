/**
 * useQualityGates — Quality scoring and auto-approval for imported content.
 * Applies configurable thresholds to determine if items should be auto-approved,
 * sent to review queue, or rejected.
 */

import { useCallback } from 'react';
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';

// ── Types ────────────────────────────────────────────────────────────

export interface QualityScore {
  overall: number;
  completeness: number;
  validity: number;
  uniqueness: number;
  details: QualityDetail[];
}

export interface QualityDetail {
  field: string;
  score: number;
  issue?: string;
}

export interface QualityThresholds {
  autoApprove: number; // >= this → auto-approve (default 90)
  review: number; // >= this → review queue (default 60)
  reject: number; // < review → auto-reject
}

export type QualityDecision = 'auto_approve' | 'review' | 'reject';

const DEFAULT_THRESHOLDS: QualityThresholds = {
  autoApprove: 90,
  review: 60,
  reject: 0,
};

// Required fields per content type for completeness scoring
const REQUIRED_FIELDS: Record<string, string[]> = {
  venues: ['name', 'description', 'category', 'address', 'city', 'country'],
  events: ['title', 'description', 'start_date', 'city', 'country'],
  personalities: ['name', 'description', 'profession'],
  news_articles: ['title', 'excerpt', 'source_url', 'source_name'],
  cities: ['name', 'country_id'],
  countries: ['name', 'code'],
  hotels: ['name', 'hotel_type', 'city', 'country'],
  queer_villages: ['name', 'slug', 'city_id', 'country_id'],
};

// ── Scoring Functions ───────────────────────────────────────────────

function scoreCompleteness(
  data: Record<string, unknown>,
  contentType: string,
): { score: number; details: QualityDetail[] } {
  const required = REQUIRED_FIELDS[contentType] ?? [];
  if (required.length === 0) return { score: 100, details: [] };

  const details: QualityDetail[] = [];
  let filled = 0;

  for (const field of required) {
    const val = data[field];
    const isFilled =
      val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0);

    if (isFilled) {
      filled++;
      details.push({ field, score: 100 });
    } else {
      details.push({ field, score: 0, issue: `Missing required field: ${field}` });
    }
  }

  // Bonus for optional fields being filled
  const allFields = Object.keys(data);
  const optionalFilled = allFields.filter(
    (f) => !required.includes(f) && data[f] != null && data[f] !== '',
  ).length;
  const optionalBonus = Math.min(10, Math.round(optionalFilled * 0.5));

  return {
    score: Math.min(100, Math.round((filled / required.length) * 90) + optionalBonus),
    details,
  };
}

function scoreValidity(data: Record<string, unknown>): { score: number; details: QualityDetail[] } {
  const details: QualityDetail[] = [];
  let issues = 0;
  let checks = 0;

  // URL validation
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'string' && (key.includes('url') || key.includes('website'))) {
      checks++;
      try {
        if (val.trim()) new URL(val);
        details.push({ field: key, score: 100 });
      } catch {
        issues++;
        details.push({ field: key, score: 0, issue: `Invalid URL: ${val}` });
      }
    }

    // Email validation
    if (typeof val === 'string' && key.includes('email') && val.trim()) {
      checks++;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        details.push({ field: key, score: 100 });
      } else {
        issues++;
        details.push({ field: key, score: 0, issue: `Invalid email: ${val}` });
      }
    }

    // Coordinate validation
    if (key === 'latitude' && typeof val === 'number') {
      checks++;
      if (val >= -90 && val <= 90) {
        details.push({ field: key, score: 100 });
      } else {
        issues++;
        details.push({ field: key, score: 0, issue: `Invalid latitude: ${val}` });
      }
    }
    if (key === 'longitude' && typeof val === 'number') {
      checks++;
      if (val >= -180 && val <= 180) {
        details.push({ field: key, score: 100 });
      } else {
        issues++;
        details.push({ field: key, score: 0, issue: `Invalid longitude: ${val}` });
      }
    }
  }

  if (checks === 0) return { score: 100, details };
  return { score: Math.round(((checks - issues) / checks) * 100), details };
}

// ── Hook ────────────────────────────────────────────────────────────

export function useQualityGates(thresholds?: Partial<QualityThresholds>) {
  const { user } = useAuth();
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  const scoreItem = useCallback(
    (data: Record<string, unknown>, contentType: string): QualityScore => {
      const completeness = scoreCompleteness(data, contentType);
      const validity = scoreValidity(data);

      // Weighted average
      const overall = Math.round(completeness.score * 0.7 + validity.score * 0.3);

      return {
        overall,
        completeness: completeness.score,
        validity: validity.score,
        uniqueness: 100, // Placeholder — dedup is handled by ingestion pipeline
        details: [...completeness.details, ...validity.details],
      };
    },
    [],
  );

  const getDecision = useCallback(
    (score: QualityScore): QualityDecision => {
      if (score.overall >= t.autoApprove) return 'auto_approve';
      if (score.overall >= t.review) return 'review';
      return 'reject';
    },
    [t],
  );

  const applyQualityGate = useCallback(
    async (
      stagingId: string,
      data: Record<string, unknown>,
      contentType: string,
    ): Promise<{ decision: QualityDecision; score: QualityScore }> => {
      const score = scoreItem(data, contentType);
      const decision = getDecision(score);

      // Record the quality assessment
      try {
        await api.from('content_flags' as any).insert({
          module_name: 'quality-gate',
          content_type: contentType,
          content_id: stagingId,
          flag_type: 'quality_issue',
          severity: decision === 'reject' ? 'error' : decision === 'review' ? 'warning' : 'info',
          confidence: score.overall / 100,
          title: `Quality Score: ${score.overall}%`,
          description: `Completeness: ${score.completeness}%, Validity: ${score.validity}%`,
          auto_approved: decision === 'auto_approve',
          status: decision === 'auto_approve' ? 'approved' : 'pending',
          reviewed_by: decision === 'auto_approve' ? user?.id : null,
          reviewed_at: decision === 'auto_approve' ? new Date().toISOString() : null,
        });
      } catch (err) {
        console.error('Failed to record quality gate result:', err);
      }

      return { decision, score };
    },
    [scoreItem, getDecision, user],
  );

  return {
    scoreItem,
    getDecision,
    applyQualityGate,
    thresholds: t,
  };
}
