import { SHANNONS_PER_AI3 } from "@/lib/constants";

// Platform fee for Consensus → Auto EVM transfers, tiered like tax brackets:
// FEE_BPS_BASE on the first FEE_TIER_THRESHOLD, FEE_BPS_ABOVE on the rest.
// Currently a flat 1% (both tiers equal).
export const FEE_TIER_THRESHOLD = 1000n * SHANNONS_PER_AI3;
export const FEE_BPS_BASE = 100;
export const FEE_BPS_ABOVE = 100;
/** Hard cap the pre-sign check enforces regardless of tiers */
export const MAX_FEE_BPS = FEE_BPS_BASE;

/** Referral program switch — off for now; flip to re-enable payouts, the ?ref= capture and the invite card */
export const REFERRALS_ENABLED = false;

/** Share of the platform fee paid to the referrer, in percent */
export const REFERRAL_SHARE_PCT = 20n;

export function computePlatformFee(amount: bigint): bigint {
  if (amount <= 0n) return 0n;
  const base = amount < FEE_TIER_THRESHOLD ? amount : FEE_TIER_THRESHOLD;
  const above = amount - base;
  return (base * BigInt(FEE_BPS_BASE) + above * BigInt(FEE_BPS_ABOVE)) / 10000n;
}

export interface FeeBreakdown {
  /** Total platform fee taken from the entered amount */
  fee: bigint;
  /** What the recipient receives */
  net: bigint;
  treasury: bigint;
  /** 0 when there is no referrer */
  referral: bigint;
}

export function feeBreakdown(amount: bigint, withReferral: boolean): FeeBreakdown {
  const fee = computePlatformFee(amount);
  const referral = withReferral ? (fee * REFERRAL_SHARE_PCT) / 100n : 0n;
  return { fee, net: amount - fee, treasury: fee - referral, referral };
}

/** Effective fee rate in percent, for display (e.g. "2.4%") */
export function effectiveFeePct(amount: bigint): string {
  if (amount <= 0n) return `${FEE_BPS_BASE / 100}%`;
  const bps = Number((computePlatformFee(amount) * 10000n) / amount);
  return `${bps / 100}%`;
}
