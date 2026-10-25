"use client";

import { TRANSPORTER_PRECOMPILE_ADDRESS } from "@autonomys/auto-xdm";
import { getApi } from "@/lib/autonomys/api";
import { isValidEthereumAddress, isValidSubstrateAddress } from "@/lib/autonomys/addresses";
import { findPendingTransfer, isTransferDelivered, pendingTransfersFor, type XdmMessageRef } from "@/lib/autonomys/tracking";
import { CHAINS, HYPERLANE } from "@/lib/constants";
import { jsonRpc, type EvmReceipt } from "@/lib/evm/wallet";
import { isHyperlaneDelivered, messageIdFromReceipt } from "@/lib/hyperlane";
import type { Chain, LegKind } from "@/types";

// "Where is my money?" — resolve a tx hash, Consensus extrinsic id or address
// into bridge status using only public RPCs.

export type TrackStatus = "inFlight" | "delivered" | "failed" | "unknown";

export interface TrackedTransfer {
  kind: LegKind;
  from: Chain;
  to: Chain;
  amount: bigint;
  sender: string;
  receiver: string;
  status: TrackStatus;
  sentAt?: number;
  sourceUrl?: string;
  note?: string;
}

export type TrackResult =
  | { type: "transfers"; transfers: TrackedTransfer[]; note?: string }
  | { type: "error"; message: string };

/** Transporter precompile TransferToConsensus(address indexed from, bytes32 indexed to, uint256 amount) */
const XDM_PRECOMPILE_TOPIC = "0x527902f4e4e81d14c83f1dd2561d2a895dccec790e8f1ef252c6e169acedf18f";
/** Router SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amount) */
const HL_SENT_TOPIC = "0xd229aacb94204188fe8042965fa6b269c62dc5818b21238779ab64bdd17efeec";

const E2C_MS = 30 * 3600_000;

const lower = (s: string) => s.toLowerCase();
const addr20 = (topic: string) => `0x${topic.slice(26)}`;

async function blockTime(rpc: string, blockNumber: string): Promise<number | undefined> {
  try {
    const b = await jsonRpc<{ timestamp: string } | null>(rpc, "eth_getBlockByNumber", [blockNumber, false]);
    return b ? parseInt(b.timestamp, 16) * 1000 : undefined;
  } catch {
    return undefined;
  }
}

async function receipt(rpc: string, hash: string): Promise<EvmReceipt | null> {
  try {
    return await jsonRpc<EvmReceipt | null>(rpc, "eth_getTransactionReceipt", [hash]);
  } catch {
    return null;
  }
}

async function fromEvmReceipt(r: EvmReceipt, hash: string): Promise<TrackedTransfer | null> {
  const rpc = CHAINS.Mainnet.evm.httpRpc;
  const sourceUrl = `${CHAINS.Mainnet.evm.explorerBase}/tx/${hash}`;
  const sentAt = await blockTime(rpc, r.blockNumber);
  const failed = r.status !== "0x1";

  const xdm = r.logs.find((l) => lower(l.address) === lower(TRANSPORTER_PRECOMPILE_ADDRESS) && l.topics[0] === XDM_PRECOMPILE_TOPIC);
  if (xdm || lower(r.to ?? "") === lower(TRANSPORTER_PRECOMPILE_ADDRESS)) {
    if (failed || !xdm) {
      return { kind: "xdm-e2c", from: "evm", to: "consensus", amount: 0n, sender: r.from, receiver: "", status: "failed", sentAt, sourceUrl };
    }
    const sender = addr20(xdm.topics[1]);
    const receiver = xdm.topics[2];
    const amount = BigInt(xdm.data);
    const api = await getApi(CHAINS.Mainnet.evm.rpc);
    const ref = await findPendingTransfer(api, { sender: { accountId20: sender }, receiver: { accountId32: receiver }, amount });
    const delivered = !ref || (await isTransferDelivered(await getApi(CHAINS.Mainnet.consensus.rpc), ref));
    return {
      kind: "xdm-e2c",
      from: "evm",
      to: "consensus",
      amount,
      sender,
      receiver,
      status: delivered ? "delivered" : "inFlight",
      sentAt,
      sourceUrl,
      note: !delivered && sentAt ? `Expected around ${new Date(sentAt + E2C_MS).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}` : undefined,
    };
  }

  if (lower(r.to ?? "") === lower(HYPERLANE.router.evm)) {
    return hyperlaneTransfer(r, "hyperlane-evm2eth", sentAt, sourceUrl);
  }
  return null;
}

async function hyperlaneTransfer(
  r: EvmReceipt,
  kind: LegKind,
  sentAt: number | undefined,
  sourceUrl: string
): Promise<TrackedTransfer> {
  const evm2eth = kind === "hyperlane-evm2eth";
  const sent = r.logs.find((l) => l.topics[0] === HL_SENT_TOPIC);
  const base = {
    kind,
    from: (evm2eth ? "evm" : "ethereum") as Chain,
    to: (evm2eth ? "ethereum" : "evm") as Chain,
    amount: sent ? BigInt(sent.data) : 0n,
    sender: r.from,
    receiver: sent ? addr20(sent.topics[2]) : "",
    sentAt,
    sourceUrl,
  };
  const id = messageIdFromReceipt(r);
  if (r.status !== "0x1" || !id) return { ...base, status: "failed" };
  return { ...base, status: (await isHyperlaneDelivered(kind, id)) ? "delivered" : "inFlight" };
}

async function trackHash(hash: string): Promise<TrackResult> {
  const evm = await receipt(CHAINS.Mainnet.evm.httpRpc, hash);
  if (evm) {
    const t = await fromEvmReceipt(evm, hash);
    return t
      ? { type: "transfers", transfers: [t] }
      : { type: "error", message: "This Auto EVM transaction is not a bridge transfer." };
  }

  const eth = await receipt(CHAINS.Mainnet.ethereum.httpRpc, hash);
  if (eth) {
    if (lower(eth.to ?? "") !== lower(HYPERLANE.router.ethereum)) {
      return { type: "error", message: "This Ethereum transaction is not a WAI3 bridge transfer." };
    }
    const sentAt = await blockTime(CHAINS.Mainnet.ethereum.httpRpc, eth.blockNumber);
    const t = await hyperlaneTransfer(eth, "hyperlane-eth2evm", sentAt, `${CHAINS.Mainnet.ethereum.explorerBase}/tx/${hash}`);
    return { type: "transfers", transfers: [t] };
  }

  return {
    type: "error",
    message:
      "Not found on Auto EVM or Ethereum. For a Consensus transfer, paste its extrinsic ID from Subscan (like 10129160-2) or your address.",
  };
}

async function trackExtrinsic(id: string): Promise<TrackResult> {
  const [blockNum, index] = id.split("-").map(Number);
  if (!Number.isSafeInteger(blockNum) || blockNum > MAX_BLOCK) return { type: "error", message: "Block number out of range." };
  const api = await getApi(CHAINS.Mainnet.consensus.rpc);
  const blockHash = await api.rpc.chain.getBlockHash(blockNum);
  if (blockHash.isEmpty) return { type: "error", message: `Block ${blockNum} not found.` };

  const at = await api.at(blockHash);
  const records = (await at.query.system.events()) as unknown as Array<{
    phase: { isApplyExtrinsic: boolean; asApplyExtrinsic: { toNumber(): number } };
    event: { section: string; method: string; data: { toJSON(): unknown } };
  }>;
  const mine = records.filter((r) => r.phase.isApplyExtrinsic && r.phase.asApplyExtrinsic.toNumber() === index);
  if (mine.length === 0) return { type: "error", message: `Extrinsic ${id} not found.` };

  const sourceUrl = `${CHAINS.Mainnet.consensus.explorerBase}/extrinsic/${id}`;
  const sentAt = Number((await at.query.timestamp.now()).toString());
  const failed = mine.some((r) => r.event.section === "system" && r.event.method === "ExtrinsicFailed");
  const init = mine.find((r) => r.event.section === "transporter" && r.event.method === "OutgoingTransferInitiated");
  if (!init) {
    return failed
      ? { type: "transfers", transfers: [{ kind: "xdm-c2e", from: "consensus", to: "evm", amount: 0n, sender: "", receiver: "", status: "failed", sentAt, sourceUrl }] }
      : { type: "error", message: "This extrinsic is not a cross-chain transfer." };
  }

  const [dstChainId, messageId, amountRaw] = init.event.data.toJSON() as [unknown, [string, string], string | number];
  const ref: XdmMessageRef = { source: "consensus", dstChainId, messageId };
  const block = await api.rpc.chain.getBlock(blockHash);
  const ex = block.block.extrinsics[index];
  const signer = ex?.signer?.toString() ?? "";
  // Recipient sits in the transporter.transfer call, possibly inside utility.batchAll
  type Call = { section: string; method: string; args: Array<{ toJSON(): unknown } & Partial<Call[]>> };
  const top = ex?.method as unknown as Call | undefined;
  const transfer =
    top?.section === "utility" ? (top.args[0] as unknown as Call[]).find((c) => c.section === "transporter") : top;
  const loc = transfer?.args[0]?.toJSON() as { accountId?: { accountId20?: string; accountId32?: string } } | undefined;
  const receiver = loc?.accountId?.accountId20 ?? loc?.accountId?.accountId32 ?? "";
  return {
    type: "transfers",
    transfers: [
      {
        kind: "xdm-c2e",
        from: "consensus",
        to: "evm",
        amount: BigInt(amountRaw),
        sender: signer,
        receiver,
        status: (await isTransferDelivered(await getApi(CHAINS.Mainnet.evm.rpc), ref)) ? "delivered" : "inFlight",
        sentAt,
        sourceUrl,
      },
    ],
  };
}

async function trackAddress(address: string): Promise<TrackResult> {
  const [con, evm] = await Promise.all([getApi(CHAINS.Mainnet.consensus.rpc), getApi(CHAINS.Mainnet.evm.rpc)]);
  const [fromCon, fromEvm] = await Promise.all([pendingTransfersFor(con, address), pendingTransfersFor(evm, address)]);
  const show = async (p: (typeof fromCon)[number]): Promise<TrackedTransfer> => {
    const c2e = p.ref.source === "consensus";
    const delivered = await isTransferDelivered(c2e ? evm : con, p.ref);
    return {
      kind: c2e ? "xdm-c2e" : "xdm-e2c",
      from: c2e ? "consensus" : "evm",
      to: c2e ? "evm" : "consensus",
      amount: p.amount,
      sender: p.sender.accountId.accountId20 ?? p.sender.accountId.accountId32 ?? "",
      receiver: p.receiver.accountId.accountId20 ?? p.receiver.accountId.accountId32 ?? "",
      status: delivered ? "delivered" : "inFlight",
      note: delivered ? "Credited — the source chain is still confirming" : undefined,
    };
  };
  return {
    type: "transfers",
    transfers: await Promise.all([...fromCon, ...fromEvm].map(show)),
    note: "Shows recent transfers between Consensus and Auto EVM. For older or Hyperlane transfers, search by tx hash.",
  };
}

const MAX_BLOCK = 2 ** 32 - 1;

export async function track(input: string): Promise<TrackResult> {
  const q = input.trim();
  try {
    if (/^0x[0-9a-fA-F]{64}$/.test(q)) return await trackHash(q);
    if (/^\d+-\d+$/.test(q)) return await trackExtrinsic(q);
    if (isValidEthereumAddress(q) || isValidSubstrateAddress(q)) return await trackAddress(q);
    return { type: "error", message: "Enter a transaction hash, a Consensus extrinsic ID (block-index) or an address." };
  } catch (err: unknown) {
    return { type: "error", message: err instanceof Error ? err.message : "Lookup failed — try again." };
  }
}
