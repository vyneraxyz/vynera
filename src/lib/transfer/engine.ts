"use client";

import { getApi } from "@/lib/autonomys/api";
import {
  findPendingTransfer,
  isTransferDelivered,
  type XdmAccount,
} from "@/lib/autonomys/tracking";
import { buildAndSendXdm, buildAndSendXdmEvm } from "@/lib/autonomys/xdm";
import { CHAINS, TREASURY_SS58 } from "@/lib/constants";
import { jsonRpc, type EvmReceipt } from "@/lib/evm/wallet";
import {
  isHyperlaneDelivered,
  messageIdFromReceipt,
  sendHyperlaneTransfer,
} from "@/lib/hyperlane";
import { notify } from "@/lib/notify";
import { CHAIN_LABEL } from "@/lib/routes";
import { quoteRoute } from "@/lib/transfer/quote";
import { allTransfers, useTxStore } from "@/store/transactions";
import type { Chain, LegPhase, StoredLeg, StoredTx, TxPhase } from "@/types";

// Runs route legs and follows them to the destination. State lives in the
// persisted tx store, so a reload (or a 30 h XDM wait) resumes where it left off.

export interface NewTransfer {
  from: Chain;
  to: Chain;
  /** Wallet that signs the first leg */
  sender: string;
  /** User's Auto EVM address — the hop for two-leg routes */
  evmAddress: string | null;
  recipient: string;
  amount: bigint;
  /** Referrer credited from the platform fee (Consensus-first routes) */
  referrer: string | null;
}

export function createTransfer(t: NewTransfer): StoredTx {
  const quote = quoteRoute(t.from, t.to, t.amount, t.referrer);
  if (!quote) throw new Error("Pick two different networks and an amount");
  if (quote.legs.length > 1 && !t.evmAddress) {
    throw new Error("Connect an EVM wallet — this route goes through your Auto EVM address");
  }
  if (quote.receives <= 0n) throw new Error("Amount too small for this route");

  const legs: StoredLeg[] = quote.legs.map((l, i) => {
    const last = i === quote.legs.length - 1;
    return {
      kind: l.kind,
      from: l.from,
      to: l.to,
      fromAddress: i === 0 ? t.sender : (t.evmAddress as string),
      toAddress: last ? t.recipient : (t.evmAddress as string),
      amount: l.amount.toString(),
      phase: "pending",
    };
  });
  const fee = quote.fee;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    hash: "",
    direction: t.from === "consensus" ? "c2e" : "e2c",
    fromAddress: t.sender,
    toAddress: t.recipient,
    amount: t.amount.toString(),
    network: "Mainnet",
    phase: "signing",
    createdAt: Date.now(),
    from: t.from,
    to: t.to,
    legs,
    fee: fee
      ? {
          total: fee.fee.toString(),
          net: fee.net.toString(),
          treasury: fee.treasury.toString(),
          referral: fee.referral.toString(),
          referrer: fee.referrer,
        }
      : undefined,
  };
}

function find(id: string): StoredTx | undefined {
  return allTransfers().find((t) => t.id === id);
}

/** Overall phase derived from the legs, kept in sync for the existing UI */
function overallPhase(tx: StoredTx): TxPhase {
  const legs = tx.legs ?? [];
  const err = legs.find((l) => l.phase === "error");
  if (err) return "error";
  const cur = legs.findIndex((l) => l.phase !== "delivered");
  if (cur === -1) return "delivered";
  const leg = legs[cur];
  if (leg.phase === "pending") return cur > 0 ? "awaitingNextLeg" : "signing";
  const map: Record<LegPhase, TxPhase> = {
    pending: "signing",
    signing: "signing",
    submitted: "broadcast",
    inBlock: "inBlock",
    inFlight: "finalized",
    delivered: "delivered",
    error: "error",
  };
  return map[leg.phase];
}

function setLeg(id: string, i: number, patch: Partial<StoredLeg>): void {
  const store = useTxStore.getState();
  store.updateLeg(id, i, patch);
  const tx = find(id);
  if (!tx) return;
  const phase = overallPhase(tx);
  const legErr = tx.legs?.find((l) => l.phase === "error")?.error;
  store.updateTx(id, {
    phase,
    hash: tx.legs?.[0]?.hash ?? tx.hash,
    error: legErr,
    deliveredAt: phase === "delivered" ? Date.now() : tx.deliveredAt,
  });
}

/** Index of the leg the user should sign next, or -1 */
export function nextLegToSign(tx: StoredTx): number {
  const legs = tx.legs ?? [];
  const i = legs.findIndex((l) => l.phase !== "delivered");
  if (i === -1 || legs[i].phase !== "pending") return -1;
  return i === 0 || legs[i - 1].phase === "delivered" ? i : -1;
}

const xdmAccount = (chain: Chain, address: string): XdmAccount =>
  chain === "consensus" ? { accountId32: address } : { accountId20: address };

export async function runLeg(id: string, i: number): Promise<void> {
  const tx = find(id);
  const leg = tx?.legs?.[i];
  if (!tx || !leg) return;
  const amount = BigInt(leg.amount);
  const fail = (message: string) => setLeg(id, i, { phase: "error", error: message });

  setLeg(id, i, { phase: "signing", error: undefined });

  if (leg.kind === "xdm-c2e" || leg.kind === "xdm-e2c") {
    const c2e = leg.kind === "xdm-c2e";
    const quoted = c2e && i === 0 ? tx.fee : undefined;
    try {
      const api = await getApi(c2e ? CHAINS.Mainnet.consensus.rpc : CHAINS.Mainnet.evm.rpc);
      const params = {
        api,
        direction: c2e ? ("c2e" as const) : ("e2c" as const),
        fromAddress: leg.fromAddress,
        toAddress: leg.toAddress,
        amountShannons: amount,
        domainId: CHAINS.Mainnet.evm.domainId,
        evmChainId: CHAINS.Mainnet.evm.chainId,
        treasurySS58: TREASURY_SS58,
        fee: quoted
          ? {
              fee: BigInt(quoted.total),
              net: BigInt(quoted.net),
              treasury: BigInt(quoted.treasury),
              referral: BigInt(quoted.referral),
              referrer: quoted.referrer,
            }
          : undefined,
        onPhaseChange: (phase: TxPhase, hash?: string) => {
          const patch: Partial<StoredLeg> = hash ? { hash } : {};
          if (phase === "ready" || phase === "broadcast") setLeg(id, i, { ...patch, phase: "submitted", submittedAt: Date.now() });
          else if (phase === "inBlock") setLeg(id, i, { ...patch, phase: "inBlock" });
          else if (phase === "finalized") setLeg(id, i, { ...patch, phase: "inFlight" });
          else if (hash) setLeg(id, i, patch);
        },
        onMessage: (messageRef: StoredLeg["messageRef"]) => setLeg(id, i, { messageRef }),
        onError: fail,
      };
      if (c2e) await buildAndSendXdm(params);
      else await buildAndSendXdmEvm(params);
    } catch (err: unknown) {
      fail(err instanceof Error ? err.message : "Unexpected error");
    }
    return;
  }

  await sendHyperlaneTransfer({
    kind: leg.kind,
    fromAddress: leg.fromAddress,
    toAddress: leg.toAddress,
    amount,
    onSigning: () => setLeg(id, i, { phase: "signing" }),
    onSubmitted: (hash) => setLeg(id, i, { hash, phase: "submitted", submittedAt: Date.now() }),
    onDispatched: (hash, hyperlaneMessageId) => setLeg(id, i, { hash, hyperlaneMessageId, phase: "inFlight" }),
    onError: fail,
  });
}

// ─── Delivery watcher ────────────────────────────────────────────────────────

async function evmReceipt(chain: Chain, hash: string): Promise<EvmReceipt | null> {
  const url = chain === "ethereum" ? CHAINS.Mainnet.ethereum.httpRpc : CHAINS.Mainnet.evm.httpRpc;
  return jsonRpc<EvmReceipt | null>(url, "eth_getTransactionReceipt", [hash]);
}

/** Bring a leg interrupted by a reload (submitted but not yet tracked) up to date */
async function recoverLeg(tx: StoredTx, i: number, leg: StoredLeg): Promise<void> {
  if (leg.kind.startsWith("hyperlane")) {
    if (!leg.hash) return;
    const receipt = await evmReceipt(leg.from, leg.hash);
    if (!receipt) return;
    if (receipt.status !== "0x1") return setLeg(tx.id, i, { phase: "error", error: "Transaction reverted on-chain" });
    const hyperlaneMessageId = messageIdFromReceipt(receipt);
    if (hyperlaneMessageId) setLeg(tx.id, i, { phase: "inFlight", hyperlaneMessageId });
    return;
  }

  if (leg.from === "evm" && leg.hash) {
    const receipt = await evmReceipt("evm", leg.hash);
    if (!receipt) return;
    if (receipt.status !== "0x1") return setLeg(tx.id, i, { phase: "error", error: "Transaction reverted on-chain" });
  }
  if (leg.phase === "submitted" && !leg.hash) return; // never confirmed in a block — can't tell
  const api = await getApi(leg.from === "consensus" ? CHAINS.Mainnet.consensus.rpc : CHAINS.Mainnet.evm.rpc);
  const amount = leg.kind === "xdm-c2e" && i === 0 && tx.fee ? BigInt(tx.fee.net) : BigInt(leg.amount);
  const messageRef = await findPendingTransfer(api, {
    sender: xdmAccount(leg.from, leg.fromAddress),
    receiver: xdmAccount(leg.to, leg.toAddress),
    amount,
  });
  // Included on-chain but no longer pending on the source → long since credited
  setLeg(tx.id, i, messageRef ? { phase: "inFlight", messageRef } : { phase: "delivered", deliveredAt: Date.now() });
}

async function isDelivered(leg: StoredLeg): Promise<boolean | null> {
  if (leg.hyperlaneMessageId) return isHyperlaneDelivered(leg.kind, leg.hyperlaneMessageId);
  if (leg.messageRef) {
    const dst = await getApi(leg.to === "consensus" ? CHAINS.Mainnet.consensus.rpc : CHAINS.Mainnet.evm.rpc);
    return isTransferDelivered(dst, leg.messageRef);
  }
  return null;
}

function announce(tx: StoredTx, i: number): void {
  const legs = tx.legs ?? [];
  const leg = legs[i];
  const amount = Number(BigInt(leg.amount)) / 1e18;
  if (i < legs.length - 1) {
    notify(
      "Step 1 complete — sign step 2",
      `${amount.toFixed(4)} AI3 arrived on ${CHAIN_LABEL[leg.to]}. Open Vynera to send it on to ${CHAIN_LABEL[legs[i + 1].to]}.`,
      tx.id
    );
  } else {
    notify("Transfer delivered", `${amount.toFixed(4)} AI3 credited on ${CHAIN_LABEL[leg.to]}.`, tx.id);
  }
}

let ticking = false;

export async function watchTick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    for (const tx of allTransfers()) {
      const legs = tx.legs ?? [];
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        try {
          if ((leg.phase === "submitted" || leg.phase === "inBlock") && Date.now() - (leg.submittedAt ?? 0) > 60_000) {
            await recoverLeg(tx, i, leg);
          } else if (leg.phase === "inFlight") {
            if (!leg.messageRef && !leg.hyperlaneMessageId) {
              await recoverLeg(tx, i, leg);
              continue;
            }
            if (await isDelivered(leg)) {
              setLeg(tx.id, i, { phase: "delivered", deliveredAt: Date.now() });
              announce(tx, i);
            }
          }
        } catch {
          // RPC hiccup — try again next tick
        }
      }
    }
  } finally {
    ticking = false;
  }
}

/** Origin explorer link for a leg */
export function legExplorerUrl(leg: StoredLeg): string | null {
  if (!leg.hash) return null;
  if (leg.from === "consensus") return `${CHAINS.Mainnet.consensus.explorerBase}/tx/${leg.hash}`;
  if (leg.from === "ethereum") return `${CHAINS.Mainnet.ethereum.explorerBase}/tx/${leg.hash}`;
  return `${CHAINS.Mainnet.evm.explorerBase}/tx/${leg.hash}`;
}

