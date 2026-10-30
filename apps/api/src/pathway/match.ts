import {
  RANKING_BASIS,
  URGENT_ARTICLE_SLUG,
  type ClinicDetail,
  type ClinicPractice,
  type MatchConcernResult,
  type MatchedClinic,
  type PathwayConcern,
  type PathwayMatchRequest,
  type PathwayRankedResponse,
  type PathwayUrgentResponse,
  type PrivacyPracticeKey,
} from '@kalinga/shared';

/**
 * Stateless, pure, deterministic matcher (master prompt section 9). It reads only documented clinic facts, never
 * infers a privacy guarantee, keeps `unknown`/`unverified` distinct from confirmed, and produces explanations rather
 * than a score. It performs no I/O and keeps no state; the request is never stored or logged by this module.
 *
 * Steps: (1) mandatory location filter (municipality) -- done by the caller as a query/filter and re-applied here;
 * (2) map concerns to documented attributes; (3) deterministic ordering; (4) explain met / unknown / not met.
 */

export const URGENT_GUIDANCE: PathwayUrgentResponse = {
  mode: 'urgent',
  urgent: true,
  guidance: {
    kind: 'urgent_professional_assessment',
    articleSlug: URGENT_ARTICLE_SLUG,
    articlePath: `/learn/${URGENT_ARTICLE_SLUG}`,
    message: {
      en: 'If you think you may have been exposed to HIV in the last 72 hours, please get an assessment from a qualified health professional or hospital as soon as possible. This guide cannot diagnose, assess eligibility for treatment, or give treatment advice.',
      fil: 'Kung sa palagay mo ay maaaring na-expose ka sa HIV sa nakalipas na 72 oras, magpasuri agad sa kwalipikadong propesyonal sa kalusugan o ospital. Hindi makakapag-diagnose, makakapagtasa ng pagiging karapat-dapat sa gamutan, o makapagbigay ng payo sa paggamot ang gabay na ito.',
    },
    clinicalReview: 'unreviewed',
    contacts: [],
  },
};

/** Concern -> documented practice keys (single source of truth for the mapping; mirrored in the shared docs). */
const PRACTICE_CONCERNS: Record<Exclude<PathwayConcern, 'cost' | 'distance'>, readonly PrivacyPracticeKey[]> = {
  privacy: ['confidentiality_explained', 'reduced_disclosure_booking'],
  youth_friendly: ['youth_friendly'],
  minors_info: ['minors_information'],
  procedure: ['procedure_explained'],
};

function practice(clinic: ClinicDetail, key: PrivacyPracticeKey): ClinicPractice {
  return (
    clinic.practices.find((p) => p.key === key) ?? { key, status: 'unknown', verification: 'unknown', confirmed: false, verifiedAt: null }
  );
}

function evaluatePractices(clinic: ClinicDetail, concern: PathwayConcern, keys: readonly PrivacyPracticeKey[]): MatchConcernResult {
  const ps = keys.map((k) => practice(clinic, k));
  const attributes = ps.map((p) => ({ attribute: p.key, verification: p.verification, confirmed: p.confirmed }));
  // Met only on a verified, confirmed fact. Never inferred from silence.
  if (ps.some((p) => p.confirmed)) return { concern, state: 'met', attributes };
  if (ps.every((p) => p.status === 'not_supported' && p.verification === 'verified')) return { concern, state: 'not_met', attributes };
  return { concern, state: 'unknown', attributes };
}

function evaluateCost(clinic: ClinicDetail): MatchConcernResult {
  const services = clinic.services.filter((s) => s.availability !== 'unavailable');
  const attributes = services.map((s) => ({
    attribute: `fee:${s.category}`,
    verification: s.fee.verification,
    confirmed: s.fee.verification === 'verified' && s.fee.tier !== 'unknown',
  }));
  if (services.some((s) => s.fee.verification === 'verified' && (s.fee.tier === 'free' || s.fee.tier === 'low'))) {
    return { concern: 'cost', state: 'met', attributes };
  }
  if (services.length > 0 && services.every((s) => s.fee.verification === 'verified' && s.fee.tier === 'standard')) {
    return { concern: 'cost', state: 'not_met', attributes };
  }
  return { concern: 'cost', state: 'unknown', attributes };
}

function evaluateDistance(clinic: ClinicDetail, municipality: string): MatchConcernResult {
  return {
    concern: 'distance',
    state: clinic.municipality === municipality ? 'met' : 'not_met',
    attributes: [
      { attribute: 'municipality', verification: clinic.address.verification, confirmed: clinic.address.verification === 'verified' },
    ],
  };
}

function evaluate(clinic: ClinicDetail, concern: PathwayConcern, municipality: string | undefined): MatchConcernResult | null {
  if (concern === 'cost') return evaluateCost(clinic);
  if (concern === 'distance') return municipality ? evaluateDistance(clinic, municipality) : null;
  return evaluatePractices(clinic, concern, PRACTICE_CONCERNS[concern]);
}

const FRESHNESS_RANK = { recent: 0, stale: 1, never: 2 } as const;

/**
 * Rank already-public clinics. `clinics` must come from the public repository (published only).
 * Order: priority-weighted concerns met (earlier concern = more weight), then fewer unknowns, then fresher
 * verification, then name, then slug. No randomness, no time dependence beyond the freshness already computed.
 */
export function matchClinics(clinics: readonly ClinicDetail[], request: PathwayMatchRequest): PathwayRankedResponse {
  const concerns = request.concerns ?? [];
  const municipality = request.municipality;
  const notEvaluated = concerns.filter((c) => c === 'distance' && !municipality);
  const evaluated = concerns.filter((c) => !notEvaluated.includes(c));

  const scored = clinics
    .filter((c) => !municipality || c.municipality === municipality)
    .map((clinic) => {
      const results = evaluated.map((c) => evaluate(clinic, c, municipality)).filter((r): r is MatchConcernResult => r !== null);
      let weight = 0;
      results.forEach((r, i) => {
        if (r.state === 'met') weight += evaluated.length - i;
      });
      return { clinic, results, weight };
    });

  scored.sort(
    (a, b) =>
      b.weight - a.weight ||
      a.results.filter((r) => r.state === 'unknown').length - b.results.filter((r) => r.state === 'unknown').length ||
      FRESHNESS_RANK[a.clinic.verification.freshness] - FRESHNESS_RANK[b.clinic.verification.freshness] ||
      a.clinic.name.localeCompare(b.clinic.name, 'en') ||
      a.clinic.slug.localeCompare(b.clinic.slug, 'en'),
  );

  const matches: MatchedClinic[] = scored.map(({ clinic, results }, i) => ({
    rank: i + 1,
    clinicId: clinic.id,
    slug: clinic.slug,
    name: clinic.name,
    isDemo: clinic.isDemo,
    municipality: clinic.municipality,
    profilePath: `/clinics/${clinic.slug}`,
    verification: {
      level: clinic.verification.level,
      lastVerifiedAt: clinic.verification.lastVerifiedAt,
      freshness: clinic.verification.freshness,
    },
    metCount: results.filter((r) => r.state === 'met').length,
    unknownCount: results.filter((r) => r.state === 'unknown').length,
    whyMayFit: results.filter((r) => r.state === 'met'),
    remainsUnknown: results.filter((r) => r.state === 'unknown'),
    notMet: results.filter((r) => r.state === 'not_met'),
  }));

  return {
    mode: 'ranked',
    urgent: false,
    appliedFilters: { municipality: municipality ?? null, concerns: [...concerns], notEvaluated },
    rankingBasis: RANKING_BASIS,
    notMedicalAdvice: true,
    matches,
    fallback: matches.length === 0 ? { kind: 'browse_all_clinics', path: '/clinics' } : null,
  };
}
