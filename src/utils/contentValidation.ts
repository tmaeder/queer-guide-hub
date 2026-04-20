/**
 * Content validation utilities for CMS and Import Hub.
 * Validates content fields before submission to ensure data quality.
 */

import { normalizeAndValidateUrl } from './url';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// Max lengths for common fields
const FIELD_LIMITS: Record<string, number> = {
  title: 255,
  name: 255,
  slug: 128,
  description: 5000,
  meta_title: 70,
  meta_description: 160,
  url: 2048,
  email: 254,
  phone: 30,
  category: 100,
};

/**
 * Validate a single field value against common rules.
 */
function validateField(
  field: string,
  value: unknown,
  rules: FieldRule[] = []
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const rule of rules) {
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push({ field, message: `${rule.label || field} is required`, severity: 'error' });
      continue;
    }

    if (value === undefined || value === null || value === '') continue;

    const strValue = String(value);

    if (rule.maxLength && strValue.length > rule.maxLength) {
      errors.push({
        field,
        message: `${rule.label || field} must be ${rule.maxLength} characters or fewer (currently ${strValue.length})`,
        severity: 'error',
      });
    }

    if (rule.minLength && strValue.length < rule.minLength) {
      errors.push({
        field,
        message: `${rule.label || field} must be at least ${rule.minLength} characters`,
        severity: 'error',
      });
    }

    if (rule.pattern && !rule.pattern.test(strValue)) {
      errors.push({
        field,
        message: rule.patternMessage || `${rule.label || field} has an invalid format`,
        severity: 'error',
      });
    }

    if (rule.type === 'url') {
      const result = normalizeAndValidateUrl(strValue);
      if (!result.ok) {
        errors.push({ field, message: result.reason, severity: 'error' });
      }
    }

    if (rule.type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(strValue)) {
        errors.push({ field, message: `${rule.label || field} must be a valid email address`, severity: 'error' });
      }
    }

    if (rule.type === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        errors.push({ field, message: `${rule.label || field} must be a number`, severity: 'error' });
      } else {
        if (rule.min !== undefined && num < rule.min) {
          errors.push({ field, message: `${rule.label || field} must be at least ${rule.min}`, severity: 'error' });
        }
        if (rule.max !== undefined && num > rule.max) {
          errors.push({ field, message: `${rule.label || field} must be at most ${rule.max}`, severity: 'error' });
        }
      }
    }
  }

  return errors;
}

export interface FieldRule {
  required?: boolean;
  label?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  type?: 'string' | 'number' | 'url' | 'email' | 'date';
  min?: number;
  max?: number;
}

/**
 * Validate a slug format
 */
export function validateSlug(slug: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!slug) return errors;

  if (slug.length > FIELD_LIMITS.slug) {
    errors.push({ field: 'slug', message: `Slug must be ${FIELD_LIMITS.slug} characters or fewer`, severity: 'error' });
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    errors.push({ field: 'slug', message: 'Slug must contain only lowercase letters, numbers, and hyphens', severity: 'error' });
  }
  return errors;
}

/**
 * Generate a valid slug from a title string.
 */
export function generateSlug(title: string, maxLength: number = FIELD_LIMITS.slug): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength);
}

// --- Content type specific validators ---

/**
 * Validate venue data
 */
export function validateVenue(data: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  errors.push(...validateField('name', data.name, [
    { required: true, label: 'Venue name', maxLength: FIELD_LIMITS.name, minLength: 2 },
  ]));

  errors.push(...validateField('address', data.address, [
    { label: 'Address', maxLength: 500 },
  ]));

  errors.push(...validateField('city', data.city, [
    { label: 'City', maxLength: FIELD_LIMITS.name },
  ]));

  errors.push(...validateField('country', data.country, [
    { label: 'Country', maxLength: FIELD_LIMITS.name },
  ]));

  errors.push(...validateField('website', data.website, [
    { label: 'Website', type: 'url', maxLength: FIELD_LIMITS.url },
  ]));

  errors.push(...validateField('email', data.email, [
    { label: 'Email', type: 'email', maxLength: FIELD_LIMITS.email },
  ]));

  errors.push(...validateField('phone', data.phone, [
    { label: 'Phone', maxLength: FIELD_LIMITS.phone },
  ]));

  // Validate coordinates
  if (data.latitude !== undefined && data.latitude !== null) {
    errors.push(...validateField('latitude', data.latitude, [
      { label: 'Latitude', type: 'number', min: -90, max: 90 },
    ]));
  }
  if (data.longitude !== undefined && data.longitude !== null) {
    errors.push(...validateField('longitude', data.longitude, [
      { label: 'Longitude', type: 'number', min: -180, max: 180 },
    ]));
  }

  const warnings = errors.filter(e => e.severity === 'warning');
  const realErrors = errors.filter(e => e.severity === 'error');

  return {
    isValid: realErrors.length === 0,
    errors: realErrors,
    warnings,
  };
}

/**
 * Validate event data
 */
export function validateEvent(data: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  errors.push(...validateField('title', data.title, [
    { required: true, label: 'Event title', maxLength: FIELD_LIMITS.title, minLength: 3 },
  ]));

  errors.push(...validateField('description', data.description, [
    { label: 'Description', maxLength: FIELD_LIMITS.description },
  ]));

  // Validate dates
  if (data.start_date && data.end_date) {
    const start = new Date(data.start_date as string);
    const end = new Date(data.end_date as string);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end < start) {
      errors.push({ field: 'end_date', message: 'End date must be after start date', severity: 'error' });
    }
  }

  const warnings = errors.filter(e => e.severity === 'warning');
  const realErrors = errors.filter(e => e.severity === 'error');

  return {
    isValid: realErrors.length === 0,
    errors: realErrors,
    warnings,
  };
}

/**
 * Validate news article data
 */
export function validateNewsArticle(data: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  errors.push(...validateField('title', data.title, [
    { required: true, label: 'Article title', maxLength: FIELD_LIMITS.title, minLength: 5 },
  ]));

  errors.push(...validateField('url', data.url, [
    { label: 'Article URL', type: 'url', maxLength: FIELD_LIMITS.url },
  ]));

  const warnings = errors.filter(e => e.severity === 'warning');
  const realErrors = errors.filter(e => e.severity === 'error');

  return {
    isValid: realErrors.length === 0,
    errors: realErrors,
    warnings,
  };
}

/**
 * Validate news source data
 */
export function validateNewsSource(data: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  errors.push(...validateField('name', data.name, [
    { required: true, label: 'Source name', maxLength: FIELD_LIMITS.name, minLength: 2 },
  ]));

  errors.push(...validateField('url', data.url, [
    { required: true, label: 'Source URL', type: 'url', maxLength: FIELD_LIMITS.url },
  ]));

  errors.push(...validateField('category', data.category, [
    { required: true, label: 'Category', maxLength: FIELD_LIMITS.category },
  ]));

  errors.push(...validateField('fetch_frequency', data.fetch_frequency, [
    { label: 'Fetch frequency', type: 'number', min: 30, max: 10080 },
  ]));

  const warnings = errors.filter(e => e.severity === 'warning');
  const realErrors = errors.filter(e => e.severity === 'error');

  return {
    isValid: realErrors.length === 0,
    errors: realErrors,
    warnings,
  };
}

/**
 * Validate CMS content data
 */
export function validateCMSContent(data: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  // Title can be JSONB or string
  const title = data.title;
  if (!title) {
    errors.push({ field: 'title', message: 'Title is required', severity: 'error' });
  } else if (typeof title === 'object' && title !== null) {
    const titleObj = title as Record<string, string>;
    if (!titleObj.en || titleObj.en.trim().length === 0) {
      errors.push({ field: 'title', message: 'English title is required', severity: 'error' });
    }
    Object.entries(titleObj).forEach(([lang, text]) => {
      if (typeof text === 'string' && text.length > FIELD_LIMITS.title) {
        errors.push({ field: `title.${lang}`, message: `Title (${lang}) must be ${FIELD_LIMITS.title} characters or fewer`, severity: 'error' });
      }
    });
  } else if (typeof title === 'string' && title.length > FIELD_LIMITS.title) {
    errors.push({ field: 'title', message: `Title must be ${FIELD_LIMITS.title} characters or fewer`, severity: 'error' });
  }

  // Slug validation
  if (data.slug) {
    errors.push(...validateSlug(String(data.slug)));
  }

  // Meta SEO validation
  if (data.meta_title) {
    errors.push(...validateField('meta_title', data.meta_title, [
      { label: 'Meta title', maxLength: FIELD_LIMITS.meta_title },
    ]));
  }

  if (data.meta_description) {
    errors.push(...validateField('meta_description', data.meta_description, [
      { label: 'Meta description', maxLength: FIELD_LIMITS.meta_description },
    ]));
  }

  const warnings = errors.filter(e => e.severity === 'warning');
  const realErrors = errors.filter(e => e.severity === 'error');

  return {
    isValid: realErrors.length === 0,
    errors: realErrors,
    warnings,
  };
}

/**
 * Validate an import CSV row against expected schema.
 * Returns validation result for each row.
 */
export function validateImportRow(
  row: Record<string, string>,
  rowIndex: number,
  contentType: string,
  requiredFields: string[] = []
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check required fields
  for (const field of requiredFields) {
    if (!row[field] || row[field].trim() === '') {
      errors.push({
        field,
        message: `Row ${rowIndex + 1}: Missing required field "${field}"`,
        severity: 'error',
      });
    }
  }

  // Type-specific field validation
  for (const [key, value] of Object.entries(row)) {
    if (!value || value.trim() === '') continue;

    // URL fields
    if (key.toLowerCase().includes('url') || key.toLowerCase().includes('website')) {
      if (!normalizeAndValidateUrl(value).ok) {
        errors.push({
          field: key,
          message: `Row ${rowIndex + 1}: "${key}" contains an invalid URL`,
          severity: 'warning',
        });
      }
    }

    // Email fields
    if (key.toLowerCase().includes('email')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        errors.push({
          field: key,
          message: `Row ${rowIndex + 1}: "${key}" contains an invalid email`,
          severity: 'warning',
        });
      }
    }

    // Coordinate fields
    if (key === 'latitude' || key === 'lat') {
      const num = Number(value);
      if (isNaN(num) || num < -90 || num > 90) {
        errors.push({
          field: key,
          message: `Row ${rowIndex + 1}: Latitude must be between -90 and 90`,
          severity: 'error',
        });
      }
    }
    if (key === 'longitude' || key === 'lng' || key === 'lon') {
      const num = Number(value);
      if (isNaN(num) || num < -180 || num > 180) {
        errors.push({
          field: key,
          message: `Row ${rowIndex + 1}: Longitude must be between -180 and 180`,
          severity: 'error',
        });
      }
    }

    // Excessive length check
    if (value.length > 10000) {
      errors.push({
        field: key,
        message: `Row ${rowIndex + 1}: "${key}" value is unusually long (${value.length} characters)`,
        severity: 'warning',
      });
    }
  }

  return errors;
}

/**
 * Validate a full CSV import batch.
 */
export function validateImportBatch(
  rows: Record<string, string>[],
  contentType: string,
  requiredFields: string[] = []
): ValidationResult {
  const allErrors: ValidationError[] = [];

  if (rows.length === 0) {
    allErrors.push({ field: 'data', message: 'No data rows found in the file', severity: 'error' });
    return { isValid: false, errors: allErrors, warnings: [] };
  }

  for (let i = 0; i < rows.length; i++) {
    allErrors.push(...validateImportRow(rows[i], i, contentType, requiredFields));
  }

  // Check for duplicates within the batch
  const uniqueKeys = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = Object.values(row).join('|').toLowerCase();
    if (!uniqueKeys.has(key)) {
      uniqueKeys.set(key, []);
    }
    uniqueKeys.get(key)!.push(index + 1);
  });

  for (const [, indices] of uniqueKeys) {
    if (indices.length > 1) {
      allErrors.push({
        field: 'duplicate',
        message: `Duplicate rows detected at lines: ${indices.join(', ')}`,
        severity: 'warning',
      });
    }
  }

  const warnings = allErrors.filter(e => e.severity === 'warning');
  const errors = allErrors.filter(e => e.severity === 'error');

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
