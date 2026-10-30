import { vi } from 'vitest';
import type {
  ClinicDetail,
  ClinicPractice,
  ClinicService,
  ClinicSummary,
  MatchedClinic,
  PathwayRankedResponse,
  PathwayUrgentResponse,
} from '@kalinga/shared';
import { PRIVACY_PRACTICE_KEYS, RANKING_BASIS, URGENT_ARTICLE_SLUG } from '@kalinga/shared';

/** Fictitious fixtures only (DEMO). No real clinic names, contacts or addresses. */

export const CONFIG = {
  apiVersion: 'v1',
  demoMode: true,
  locales: ['en', 'fil'],
  defaultLocale: 'en',
  timezone: 'Asia/Manila',
  notificationTransport: 'mock',
  realBookingEnabled: false,
  clinicalContentApproved: false,
};

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

export const fee = (tier: ClinicService['fee']['tier'], verification: ClinicService['fee']['verification']): ClinicService['fee'] => ({
  tier,
  minPhp: null,
  maxPhp: null,
  note: null,
  verification,
  verifiedAt: verification === 'verified' ? '2026-10-01T00:00:00.000Z' : null,
});

const practices = (over: Partial<Record<(typeof PRIVACY_PRACTICE_KEYS)[number], Partial<ClinicPractice>>> = {}): ClinicPractice[] =>
  PRIVACY_PRACTICE_KEYS.map((key) => ({
    key,
    status: 'unknown' as const,
    verification: 'unknown' as const,
    confirmed: false,
    verifiedAt: null,
    ...over[key],
  }));

export const CLINIC_A: ClinicSummary = {
  id: ID_A,
  slug: 'demo-clinic-a',
  name: 'DEMO Clinic A – Fictitious',
  isDemo: true,
  municipality: 'Boac',
  verification: { level: 'demo_fictitious', source: 'demo_fixture', lastVerifiedAt: '2026-10-10T00:00:00.000Z', freshness: 'recent', staleAfterDays: 180 },
  services: [
    { category: 'hiv_testing', availability: 'available', verification: 'verified', verifiedAt: '2026-10-10T00:00:00.000Z', fee: fee('free', 'verified') },
    { category: 'counselling', availability: 'available', verification: 'verified', verifiedAt: '2026-10-10T00:00:00.000Z', fee: fee('free', 'unverified') },
  ],
  practices: practices({ confidentiality_explained: { status: 'confirmed', verification: 'verified', confirmed: true } }),
};

export const CLINIC_B: ClinicSummary = {
  id: ID_B,
  slug: 'demo-clinic-c',
  name: 'DEMO Clinic C – Fictitious',
  isDemo: true,
  municipality: 'Gasan',
  verification: { level: 'demo_fictitious', source: 'demo_fixture', lastVerifiedAt: '2025-08-01T00:00:00.000Z', freshness: 'stale', staleAfterDays: 180 },
  services: [{ category: 'sti_testing', availability: 'available', verification: 'unverified', verifiedAt: null, fee: fee('unknown', 'unknown') }],
  practices: practices(),
};

export const CLINIC_C: ClinicSummary = {
  id: ID_C,
  slug: 'demo-clinic-d',
  name: 'DEMO Clinic D – Fictitious',
  isDemo: true,
  municipality: 'Santa Cruz',
  verification: { level: 'demo_fictitious', source: null, lastVerifiedAt: null, freshness: 'never', staleAfterDays: 180 },
  services: [],
  practices: practices(),
};

export const DETAIL_B: ClinicDetail = {
  ...CLINIC_B,
  description: 'DEMO placeholder listing. A fictitious clinic whose demo verification is old (stale).',
  barangay: null,
  address: { text: null, verification: 'unknown' },
  contact: { phone: null, email: null, note: 'DEMO – no real contact details exist', verification: 'unknown' },
  unknowns: ['address', 'contact', 'service:sti_testing', 'fee:sti_testing', 'practice:youth_friendly', 'practice:confidentiality_explained', 'weird:thing'],
};

export const DETAIL_A: ClinicDetail = {
  ...CLINIC_A,
  description: 'DEMO placeholder listing.',
  barangay: null,
  address: { text: 'Fictitious address – not a real location', verification: 'verified' },
  contact: { phone: null, email: null, note: 'DEMO – no real contact details exist', verification: 'verified' },
  unknowns: [],
};

export function listOf(items: ClinicSummary[]) {
  return { items, page: 1, pageSize: 20, total: items.length };
}

export function matched(over: Partial<MatchedClinic> = {}): MatchedClinic {
  return {
    rank: 1,
    clinicId: ID_A,
    slug: 'demo-clinic-a',
    name: 'DEMO Clinic A – Fictitious',
    isDemo: true,
    municipality: 'Boac',
    profilePath: '/clinics/demo-clinic-a',
    verification: { level: 'demo_fictitious', lastVerifiedAt: '2026-10-10T00:00:00.000Z', freshness: 'recent' },
    metCount: 1,
    unknownCount: 1,
    whyMayFit: [
      { concern: 'privacy', state: 'met', attributes: [{ attribute: 'confidentiality_explained', verification: 'verified', confirmed: true }, { attribute: 'reduced_disclosure_booking', verification: 'unknown', confirmed: false }] },
    ],
    remainsUnknown: [{ concern: 'procedure', state: 'unknown', attributes: [{ attribute: 'procedure_explained', verification: 'unknown', confirmed: false }] }],
    notMet: [{ concern: 'cost', state: 'not_met', attributes: [{ attribute: 'fee:hiv_testing', verification: 'verified', confirmed: true }] }],
    ...over,
  };
}

export function ranked(matches: MatchedClinic[], notEvaluated: PathwayRankedResponse['appliedFilters']['notEvaluated'] = []): PathwayRankedResponse {
  return {
    mode: 'ranked',
    urgent: false,
    appliedFilters: { municipality: null, concerns: ['privacy'], notEvaluated },
    rankingBasis: RANKING_BASIS,
    notMedicalAdvice: true,
    matches,
    fallback: matches.length === 0 ? { kind: 'browse_all_clinics', path: '/clinics' } : null,
  };
}

export const URGENT: PathwayUrgentResponse = {
  mode: 'urgent',
  urgent: true,
  guidance: {
    kind: 'urgent_professional_assessment',
    articleSlug: URGENT_ARTICLE_SLUG,
    articlePath: `/learn/${URGENT_ARTICLE_SLUG}`,
    message: {
      en: 'API urgent guidance (EN): get a professional assessment as soon as possible.',
      fil: 'API urgent guidance (FIL): magpasuri agad sa propesyonal.',
    },
    clinicalReview: 'unreviewed',
    contacts: [],
  },
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Stubs fetch: /public/config always answers; everything else goes to `handler`. */
export function stubApi(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/v1/public/config') return json(CONFIG);
    return handler(url, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
