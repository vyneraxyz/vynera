export type Direction = "c2e" | "e2c";
export type NetworkName = "Mainnet";
export type Chain = "consensus" | "evm";

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
  | "error";

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
}

export interface WalletAccount {
  address: string;
  name: string;
  source: string;
  type?: string;
}
