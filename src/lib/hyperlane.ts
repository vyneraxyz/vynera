import { CHAINS, HYPERLANE } from "@/lib/constants";
import { ensureChain, ethCall, waitForReceipt, type EvmReceipt } from "@/lib/evm/wallet";
import type { LegKind } from "@/types";

// AI3 warp route between Auto EVM (HypNative, locks native AI3) and Ethereum
// (synthetic WAI3, minted/burned). Both routers expose transferRemote; delivery
// is final once the destination Mailbox reports the message as delivered.

const SEL = {
  transferRemote: "0x81b4e8b4", // transferRemote(uint32,bytes32,uint256)
  quoteGasPayment: "0xf2ed8c53", // quoteGasPayment(uint32)
  routers: "0x2ead72f6", // routers(uint32)
  delivered: "0xe495f1d4", // delivered(bytes32)
  balanceOf: "0x70a08231", // balanceOf(address)
} as const;

/** Mailbox Dispatch(Id) event — topic[1] is the message id */
const DISPATCH_ID_TOPIC = "0x788dbc1b7152732178210e7f4d9d010ef016f9eafbe66786bd7169f56e0c353a";

type HlChain = "evm" | "ethereum";

interface HlSide {
  chainId: number;
  rpc: string;
  router: string;
  domain: number;
}

const SIDE: Record<HlChain, HlSide> = {
  evm: {
    chainId: CHAINS.Mainnet.evm.chainId,
    rpc: CHAINS.Mainnet.evm.httpRpc,
    router: HYPERLANE.router.evm,
    domain: HYPERLANE.domain.evm,
  },
  ethereum: {
    chainId: CHAINS.Mainnet.ethereum.chainId,
    rpc: CHAINS.Mainnet.ethereum.httpRpc,
    router: HYPERLANE.router.ethereum,
    domain: HYPERLANE.domain.ethereum,
  },
};

export function hyperlaneSides(kind: LegKind): { origin: HlSide; dest: HlSide } {
  if (kind === "hyperlane-evm2eth") return { origin: SIDE.evm, dest: SIDE.ethereum };
  if (kind === "hyperlane-eth2evm") return { origin: SIDE.ethereum, dest: SIDE.evm };
  throw new Error(`${kind} is not a Hyperlane leg`);
}

const word = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const uint = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");

export function encodeTransferRemote(destDomain: number, recipient: string, amount: bigint): string {
  return SEL.transferRemote + uint(destDomain) + word(recipient) + uint(amount);
}

/** Interchain gas the origin router charges on top (currently 0 on this route). */
export async function quoteGasPayment(kind: LegKind): Promise<bigint> {
  const { origin, dest } = hyperlaneSides(kind);
  return BigInt(await ethCall(origin.rpc, origin.router, SEL.quoteGasPayment + uint(dest.domain)));
}

/**
 * Pre-sign checks: the calldata we built says what the user confirmed, and the
 * origin router is enrolled with the expected remote router (so funds can't be
 * routed to a contract we don't know).
 */
export async function verifyHyperlaneTransfer(
  kind: LegKind,
  calldata: string,
  toAddress: string,
  amount: bigint
): Promise<void> {
  const { origin, dest } = hyperlaneSides(kind);
  const hex = calldata.toLowerCase();
  const expected = encodeTransferRemote(dest.domain, toAddress, amount).toLowerCase();
  if (hex !== expected) throw new Error("Transaction check failed: Hyperlane calldata mismatch");

  const enrolled = await ethCall(origin.rpc, origin.router, SEL.routers + uint(dest.domain));
  if (word(enrolled) !== word(dest.router)) {
    throw new Error("Transaction check failed: bridge router is not enrolled with the expected remote router");
  }
}

export function messageIdFromReceipt(receipt: EvmReceipt): string | null {
  const log = receipt.logs.find(
    (l) => l.address.toLowerCase() === HYPERLANE.mailbox.toLowerCase() && l.topics[0] === DISPATCH_ID_TOPIC
  );
  return log?.topics[1] ?? null;
}

export async function isHyperlaneDelivered(kind: LegKind, messageId: string): Promise<boolean> {
  const { dest } = hyperlaneSides(kind);
  const res = await ethCall(dest.rpc, HYPERLANE.mailbox, SEL.delivered + word(messageId));
  return BigInt(res) === 1n;
}

/** WAI3 balance on Ethereum (18 decimals, same unit as Shannons). */
export async function getWai3Balance(address: string): Promise<bigint> {
  return BigInt(await ethCall(SIDE.ethereum.rpc, SIDE.ethereum.router, SEL.balanceOf + word(address)));
}

export interface HyperlaneSendParams {
  kind: LegKind;
  fromAddress: string;
  toAddress: string;
  amount: bigint;
  onSigning: () => void;
  onSubmitted: (txHash: string) => void;
  onDispatched: (txHash: string, messageId: string) => void;
  onError: (message: string) => void;
}

export async function sendHyperlaneTransfer(p: HyperlaneSendParams): Promise<void> {
  const { origin } = hyperlaneSides(p.kind);
  const { dest } = hyperlaneSides(p.kind);
  try {
    const calldata = encodeTransferRemote(dest.domain, p.toAddress, p.amount);
    await verifyHyperlaneTransfer(p.kind, calldata, p.toAddress, p.amount);
    const gas = await quoteGasPayment(p.kind);
    // Native collateral (Auto EVM) is paid as msg.value; synthetic WAI3 is burned, only gas is paid
    const value = p.kind === "hyperlane-evm2eth" ? p.amount + gas : gas;

    const eth = await ensureChain(origin.chainId);
    p.onSigning();
    const txHash = await eth.request<string>({
      method: "eth_sendTransaction",
      params: [{ from: p.fromAddress, to: origin.router, data: calldata, value: `0x${value.toString(16)}` }],
    });
    p.onSubmitted(txHash);

    const receipt = await waitForReceipt(origin.rpc, txHash);
    if (!receipt) return p.onError("Transaction not confirmed after 10 minutes");
    if (receipt.status !== "0x1") return p.onError("Transaction reverted on-chain");
    const messageId = messageIdFromReceipt(receipt);
    if (!messageId) return p.onError("Bridge message not found in the transaction");
    p.onDispatched(txHash, messageId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to send transaction";
    const code = (err as { code?: number }).code;
    if (code === 4001 || /reject|denied|cancel/i.test(msg)) p.onError("Transaction cancelled by user");
    else p.onError(msg);
  }
}
