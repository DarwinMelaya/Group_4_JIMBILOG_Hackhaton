import type { BookingAgeBand } from '@kalinga/shared';

/**
 * Minor-booking policy adapter (master prompt F06/F12). The actual approved SOP is an owner-supplied procedural artifact
 * that does NOT exist in this repository, so real submissions for ages 15-17 are impossible: the evidence-gated policy
 * rejects them with `minor_policy_not_configured`. Nothing here composes consent or eligibility rules.
 *
 * Versioned: `MINOR_POLICY_INTERFACE_VERSION` changes if the contract changes; implementations carry their own `version`.
 */
export const MINOR_POLICY_INTERFACE_VERSION = 1;

export interface MinorPolicyInput {
  ageBand: BookingAgeBand;
  clinicId: string;
  isDemoClinic: boolean;
  demoMode: boolean;
}

export type MinorPolicyRejectionCode = 'under_15_not_supported' | 'minor_policy_not_configured';

export type MinorPolicyDecision =
  /** 18+ : the minor policy does not apply. */
  | { outcome: 'not_applicable' }
  /** Real minor submission allowed by approved evidence for this clinic (unreachable until an SOP artifact exists). */
  | { outcome: 'eligible'; policyVersion: string; evidenceId: string }
  /** DEMO fixture only: accepted as a clearly labelled demo minor flow (is_demo_minor_flow = true). */
  | { outcome: 'demo_only'; policyVersion: string }
  | { outcome: 'rejected'; code: MinorPolicyRejectionCode };

export interface MinorBookingPolicy {
  readonly interfaceVersion: typeof MINOR_POLICY_INTERFACE_VERSION;
  readonly version: string;
  evaluate(input: MinorPolicyInput): MinorPolicyDecision;
}

/** Approval evidence for a real minor SOP: an id/version, an effective date and an explicit clinic mapping. */
export interface MinorPolicyEvidence {
  evidenceId: string;
  policyVersion: string;
  effectiveFrom: Date;
  clinicIds: readonly string[];
}

export interface EvidenceGatedOptions {
  /** Must be true AND evidence present AND clinic mapped AND effective. env.ts forbids it today, so it is always false. */
  realMinorBookingEnabled: boolean;
  evidence?: MinorPolicyEvidence | undefined;
  now?: () => Date;
}

/** Fail-closed policy. Without positive evidence for the clinic, every 15-17 request is rejected; under-15 always is. */
export class EvidenceGatedMinorPolicy implements MinorBookingPolicy {
  readonly interfaceVersion = MINOR_POLICY_INTERFACE_VERSION;
  readonly version: string;
  constructor(private readonly options: EvidenceGatedOptions) {
    this.version = options.evidence?.policyVersion ?? 'none';
  }

  evaluate(input: MinorPolicyInput): MinorPolicyDecision {
    if (input.ageBand === '18_plus') return { outcome: 'not_applicable' };
    if (input.ageBand === 'under_15') return { outcome: 'rejected', code: 'under_15_not_supported' };
    const { realMinorBookingEnabled, evidence } = this.options;
    const now = (this.options.now ?? (() => new Date()))();
    if (
      realMinorBookingEnabled &&
      !input.isDemoClinic &&
      evidence !== undefined &&
      evidence.evidenceId.length > 0 &&
      evidence.effectiveFrom.getTime() <= now.getTime() &&
      evidence.clinicIds.includes(input.clinicId)
    ) {
      return { outcome: 'eligible', policyVersion: evidence.policyVersion, evidenceId: evidence.evidenceId };
    }
    return { outcome: 'rejected', code: 'minor_policy_not_configured' };
  }
}

/**
 * DEMO fixture policy. Applies only when the app is in demo mode AND the clinic is a fictitious demo clinic; then a
 * 15-17 request is accepted as a labelled demo flow. In every other case it defers to the wrapped (fail-closed) policy.
 */
export class DemoFixtureMinorPolicy implements MinorBookingPolicy {
  readonly interfaceVersion = MINOR_POLICY_INTERFACE_VERSION;
  readonly version = 'demo-fixture-1';
  constructor(private readonly inner: MinorBookingPolicy) {}

  evaluate(input: MinorPolicyInput): MinorPolicyDecision {
    if (input.ageBand === '15_17' && input.demoMode && input.isDemoClinic) {
      return { outcome: 'demo_only', policyVersion: this.version };
    }
    return this.inner.evaluate(input);
  }
}

/** Build the policy for an environment. Real evidence is honoured only when REAL_MINOR_BOOKING_ENABLED (forbidden by env.ts). */
export function createMinorPolicy(
  env: { DEMO_MODE: boolean; REAL_MINOR_BOOKING_ENABLED: boolean },
  evidence?: MinorPolicyEvidence,
): MinorBookingPolicy {
  const gated = new EvidenceGatedMinorPolicy({ realMinorBookingEnabled: env.REAL_MINOR_BOOKING_ENABLED, evidence });
  return env.DEMO_MODE ? new DemoFixtureMinorPolicy(gated) : gated;
}
