import { describe, expect, it } from 'vitest';
import {
  ClinicListQuerySchema,
  MUNICIPALITIES,
  PATHWAY_CONCERNS,
  PathwayMatchRequestSchema,
  PathwayUrgentResponseSchema,
} from './index.js';

describe('clinic and pathway schemas', () => {
  it('applies list query defaults and bounds', () => {
    expect(ClinicListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(ClinicListQuerySchema.safeParse({ pageSize: 51 }).success).toBe(false);
    expect(ClinicListQuerySchema.safeParse({ municipality: 'Manila' }).success).toBe(false);
    expect(MUNICIPALITIES).toHaveLength(6);
  });

  it('pathway request is strict, unique and identifier-free', () => {
    expect(PathwayMatchRequestSchema.safeParse({}).success).toBe(true);
    expect(PathwayMatchRequestSchema.safeParse({ concerns: [...PATHWAY_CONCERNS], municipality: 'Boac', urgentExposureWithin72h: false }).success).toBe(true);
    expect(PathwayMatchRequestSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(PathwayMatchRequestSchema.safeParse({ concerns: ['cost', 'cost'] }).success).toBe(false);
  });

  it('urgent response cannot carry contacts', () => {
    const base = {
      mode: 'urgent',
      urgent: true,
      guidance: {
        kind: 'urgent_professional_assessment',
        articleSlug: 's',
        articlePath: '/learn/s',
        message: { en: 'e', fil: 'f' },
        clinicalReview: 'unreviewed',
        contacts: [],
      },
    };
    expect(PathwayUrgentResponseSchema.safeParse(base).success).toBe(true);
    expect(PathwayUrgentResponseSchema.safeParse({ ...base, guidance: { ...base.guidance, contacts: ['0917'] } }).success).toBe(false);
  });
});
