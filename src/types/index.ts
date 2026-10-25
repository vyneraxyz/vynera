import type { XdmMessageRef } from "@/lib/autonomys/tracking";

export type Direction = "c2e" | "e2c";
export type NetworkName = "Mainnet";
export type Chain = "consensus" | "evm" | "ethereum";

export type LegKind = "xdm-c2e" | "xdm-e2c" | "hyperlane-evm2eth" | "hyperlane-eth2evm";

export type TxPhase =
  | "idle"
  | "signing"
  | "ready"
  | "broadcast"
  | "inBlock"
  | "finalized"
  | "challenge"
  | "relayed"
  | "executed"
  /** Funds credited on the destination of the last leg */
  | "delivered"
  /** First leg delivered; the user still has to sign the next one */
  | "awaitingNextLeg"
  | "error";

export type LegPhase = "pending" | "signing" | "submitted" | "inBlock" | "inFlight" | "delivered" | "error";

export interface StoredLeg {
  kind: LegKind;
  from: Chain;
  to: Chain;
  fromAddress: string;
  toAddress: string;
  /** Amount in Shannons/wei sent by this leg, decimal string */
  amount: string;
  phase: LegPhase;
  hash?: string;
  /** XDM legs: id of the pending entry on the source chain */
  messageRef?: XdmMessageRef;
  /** Hyperlane legs: Mailbox message id */
  hyperlaneMessageId?: string;
  submittedAt?: number;
  deliveredAt?: number;
  error?: string;
}

export interface StoredTx {
  id: string;
  hash: string;
  direction: Direction;
  fromAddress: string;
  toAddress: string;
  /** Amount in Shannons as decimal string (BigInt.toString()) */
  amount: string;
  network: NetworkName;
  phase: TxPhase;
  error?: string;
  /** Block number when tx was finalized */
  finalizedBlock?: number;
  /** Consensus block number when challenge period started */
  challengeStartBlock?: number;
  /** Last polled consensus block during challenge period */
  challengeCurrentBlock?: number;
  /** Wall-clock timestamp (ms) when challenge period started — used for time-based display */
  challengeStartTime?: number;
  createdAt: number;
  /** Route legs (absent on transfers stored before routes existed) */
  legs?: StoredLeg[];
  from?: Chain;
  to?: Chain;
  /** Platform fee split as quoted to the user (decimal strings) */
  fee?: { total: string; net: string; treasury: string; referral: string; referrer: string | null };
  deliveredAt?: number;
  /** User asked for a browser notification on delivery */
  notify?: boolean;
}

export interface WalletAccount {
  address: string;
  name: string;
  source: string;
  type?: string;
}
