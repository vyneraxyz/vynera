import type { ApiPromise } from "@autonomys/auto-utils";
import { samePublicKey } from "./addresses";

// Delivery tracking without an indexer.
// - The source chain keeps each in-flight transfer in
//   `transporter.outgoingTransfers(dstChainId, messageId)` until the destination's
//   acknowledgement travels back — that's how we find a transfer's message id.
// - The destination processes inbox messages in nonce order, so once its channel's
//   `nextInboxNonce` is past our nonce the funds are credited there. This happens
//   long before the source entry clears (the ack needs another confirmation trip).

/** Chain id as the runtime JSON-encodes it: { domain: 0 } or { consensus: null } */
export type XdmChainId = { domain: number } | { consensus: null };

export interface XdmMessageRef {
  /** Chain the transfer was sent from — where the pending entry lives */
  source: "consensus" | "evm";
  dstChainId: XdmChainId | unknown;
  /** (channelId, nonce) as hex U256 strings */
  messageId: [string, string];
}

export type XdmAccount = { accountId20: string } | { accountId32: string };

interface Location {
  chainId: XdmChainId;
  accountId: Partial<{ accountId20: string; accountId32: string }>;
}

export interface PendingTransfer {
  ref: XdmMessageRef;
  amount: bigint;
  sender: Location;
  receiver: Location;
}

function sameAccount(loc: Location["accountId"], account: string): boolean {
  if (loc.accountId20) return loc.accountId20.toLowerCase() === account.trim().toLowerCase();
  if (loc.accountId32) return samePublicKey(loc.accountId32, account);
  return false;
}

function matches(loc: Location["accountId"], want: XdmAccount): boolean {
  return "accountId20" in want ? sameAccount(loc, want.accountId20) : sameAccount(loc, want.accountId32);
}

async function allPending(api: ApiPromise): Promise<PendingTransfer[]> {
  const entries = await api.query.transporter.outgoingTransfers.entries();
  return entries.map(([key, value]) => {
    const [dstChainId, messageId] = key.args.map((a) => a.toJSON()) as [XdmChainId, [string, string]];
    const v = value.toJSON() as unknown as { amount: string | number; sender: Location; receiver: Location };
    return {
      ref: {
        source: "consensus" in v.sender.chainId ? "consensus" : "evm",
        dstChainId,
        messageId,
      },
      amount: BigInt(v.amount),
      sender: v.sender,
      receiver: v.receiver,
    };
  });
}

/** Find the newest pending transfer matching sender, receiver and amount. */
export async function findPendingTransfer(
  api: ApiPromise,
  want: { sender: XdmAccount; receiver: XdmAccount; amount: bigint }
): Promise<XdmMessageRef | null> {
  const candidates = (await allPending(api)).filter(
    (p) =>
      p.amount === want.amount &&
      matches(p.sender.accountId, want.sender) &&
      matches(p.receiver.accountId, want.receiver)
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (BigInt(b.ref.messageId[1]) > BigInt(a.ref.messageId[1]) ? 1 : -1));
  return candidates[0].ref;
}

/** All in-flight transfers sent from or to `address` on the chain behind `api`. */
export async function pendingTransfersFor(api: ApiPromise, address: string): Promise<PendingTransfer[]> {
  return (await allPending(api)).filter(
    (p) => sameAccount(p.sender.accountId, address) || sameAccount(p.receiver.accountId, address)
  );
}

/** True while the source chain still holds the transfer (ack not back yet). */
export async function isTransferPending(api: ApiPromise, ref: XdmMessageRef): Promise<boolean> {
  const entry = await api.query.transporter.outgoingTransfers(ref.dstChainId as never, ref.messageId as never);
  return (entry as unknown as { isSome: boolean }).isSome;
}

/** True once the destination (`dstApi`) has processed the transfer's message. */
export async function isTransferDelivered(dstApi: ApiPromise, ref: XdmMessageRef): Promise<boolean> {
  const srcChainId: XdmChainId = ref.source === "consensus" ? { consensus: null } : { domain: 0 };
  const [channelId, nonce] = ref.messageId;
  const channel = await dstApi.query.messenger.channels(srcChainId as never, channelId as never);
  const json = channel.toJSON() as { nextInboxNonce?: string | number } | null;
  if (!json?.nextInboxNonce) return false;
  return BigInt(json.nextInboxNonce) > BigInt(nonce);
}
