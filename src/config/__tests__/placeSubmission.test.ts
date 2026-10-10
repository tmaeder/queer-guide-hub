import { describe, expect, it } from 'vitest';
import { submissionRegistry } from '@/config/submissionRegistry';
import { placeSubmissionContentType } from '@/config/contentTypes/place';
import { buildSubmissionSchema } from '@/hooks/submission/buildSubmissionSchema';

describe('place submission contract', () => {
  it('resolves real fields and rejects an empty payload', () => {
    const config = submissionRegistry.place;
    const fields = config.steps.flatMap((step) => step.fields);
    const registered = new Set(placeSubmissionContentType.fields.map((field) => field.name));

    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every((field) => registered.has(field))).toBe(true);
    expect(buildSubmissionSchema(config).fullSchema.safeParse({}).success).toBe(false);
  });
});
