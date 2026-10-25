import type { Chain, LegKind } from "@/types";
import { SHANNONS_PER_AI3 } from "@/lib/constants";

// A route is one or two legs. Two-leg routes go through the user's own Auto EVM
// address, so the second leg is signed by the same EVM wallet.

export const CHAIN_LABEL: Record<Chain, string> = {
  consensus: "Consensus",
  evm: "Auto EVM",
  ethereum: "Ethereum",
};

/** Token symbol the user holds on each chain */
export const CHAIN_TOKEN: Record<Chain, string> = {
  consensus: "AI3",
  evm: "AI3",
  ethereum: "WAI3",
};

export interface RouteLegPlan {
  kind: LegKind;
  from: Chain;
  to: Chain;
}

const LEG: Record<string, LegKind> = {
  "consensus>evm": "xdm-c2e",
  "evm>consensus": "xdm-e2c",
  "evm>ethereum": "hyperlane-evm2eth",
  "ethereum>evm": "hyperlane-eth2evm",
};

export function planRoute(from: Chain, to: Chain): RouteLegPlan[] {
  if (from === to) return [];
  const direct = LEG[`${from}>${to}`];
  if (direct) return [{ kind: direct, from, to }];
  // Ethereum ⇄ Consensus hops through Auto EVM
  return [
    { kind: LEG[`${from}>evm`], from, to: "evm" },
    { kind: LEG[`evm>${to}`], from: "evm", to },
  ];
}

/** Gas kept back on Auto EVM when a second leg is sent from what the first leg delivered */
export const HOP_GAS_RESERVE = SHANNONS_PER_AI3 / 100n; // 0.01 AI3

/** Which wallet signs a leg */
export function legSigner(kind: LegKind): "substrate" | "evm" {
  return kind === "xdm-c2e" ? "substrate" : "evm";
}

/** Typical time until funds are usable on the destination, per leg */
export const LEG_ETA: Record<LegKind, string> = {
  "xdm-c2e": "~10 min",
  "xdm-e2c": "~30 h",
  "hyperlane-evm2eth": "~10 min",
  "hyperlane-eth2evm": "~5 min",
};
