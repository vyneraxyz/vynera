import { NETWORK_FEE_SHANNONS } from "@/lib/constants";
import { feeBreakdown, type FeeBreakdown } from "@/lib/fees";
import { HOP_GAS_RESERVE, planRoute, type RouteLegPlan } from "@/lib/routes";
import type { Chain } from "@/types";

// One place that turns (route, amount) into what each leg sends and what the
// recipient ends up with. The review screen and the engine both use it, so the
// numbers the user confirms are the numbers that get signed.

export interface QuotedLeg extends RouteLegPlan {
  /** Amount this leg sends */
  amount: bigint;
}

export interface RouteQuote {
  legs: QuotedLeg[];
  /** Platform fee, present when the route starts with Consensus → Auto EVM */
  fee: (FeeBreakdown & { referrer: string | null }) | null;
  /** Gas kept on Auto EVM between legs */
  hopReserve: bigint;
  /** What arrives at the final recipient */
  receives: bigint;
  /** Gas for the first leg in the source token (0 when gas is paid in ETH) */
  sourceGas: bigint;
}

export function quoteRoute(from: Chain, to: Chain, amount: bigint, referrer: string | null): RouteQuote | null {
  const plan = planRoute(from, to);
  if (plan.length === 0 || amount <= 0n) return null;

  const fee = plan[0].kind === "xdm-c2e" ? { ...feeBreakdown(amount, !!referrer), referrer } : null;
  const legs: QuotedLeg[] = [];
  let sending = amount;
  for (let i = 0; i < plan.length; i++) {
    legs.push({ ...plan[i], amount: sending });
    const arrives = i === 0 && fee ? fee.net : sending;
    sending = i < plan.length - 1 ? arrives - HOP_GAS_RESERVE : arrives;
  }

  return {
    legs,
    fee,
    hopReserve: plan.length > 1 ? HOP_GAS_RESERVE : 0n,
    receives: sending,
    sourceGas: from === "ethereum" ? 0n : NETWORK_FEE_SHANNONS,
  };
}
