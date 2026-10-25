import type { ApiPromise } from "@autonomys/auto-utils";
import { createTransferToConsensusTxData, TRANSPORTER_PRECOMPILE_ADDRESS, transporterTransfer } from "@autonomys/auto-xdm";
import type { Direction, TxPhase } from "@/types";
import type { FeeBreakdown } from "@/lib/fees";
import { MAX_FEE_BPS } from "@/lib/fees";
import { ensureChain, type EthProvider } from "@/lib/evm/wallet";
import { findPendingTransfer, type XdmMessageRef } from "./tracking";
import { verifyPrecompileCalldata, verifyXdmCall, type DecodedCall } from "./verify";

// Minimal structural interfaces so we don't depend on either copy of @polkadot/types.
interface SignerOptions {
  signer?: {
    signPayload?: (payload: unknown) => Promise<{ id: number; signature: string }>;
    signRaw?: (raw: unknown) => Promise<{ id: number; signature: string }>;
    update?: (id: number, status: unknown) => void;
  };
}

interface TxStatus {
  asInBlock: { toHex(): string };
  asFinalized: { toHex(): string };
}

interface DispatchError {
  isModule: boolean;
  asModule: { index: Uint8Array; error: Uint8Array };
  toString(): string;
}

interface TxEventRecord {
  event: { section: string; method: string; data: { toJSON(): unknown } };
}

interface TxResult {
  events?: TxEventRecord[];
  isReady: boolean;
  isBroadcast: boolean;
  isInBlock: boolean;
  isFinalized: boolean;
  isError: boolean;
  dispatchError?: DispatchError;
  status: TxStatus;
  txHash?: { toHex(): string };
}

export interface XdmTransferParams {
  api: ApiPromise;
  direction: Direction;
  fromAddress: string;
  toAddress: string;
  /** Amount in Shannons as BigInt */
  amountShannons: bigint;
  domainId: number;
  /** EVM chain ID for the Auto EVM domain (870 = Mainnet) */
  evmChainId?: number;
  /** Platform fee split (from lib/fees). Only applied for c2e via batchAll. */
  fee?: FeeBreakdown & { referrer: string | null };
  /** Treasury SS58 address that receives the platform fee. */
  treasurySS58?: string;
  onPhaseChange: (phase: TxPhase, blockHash?: string) => void;
  /** XDM message id, once known — lets the app follow the transfer to the destination */
  onMessage?: (ref: XdmMessageRef) => void;
  onError: (message: string) => void;
}

export async function buildAndSendXdm(params: XdmTransferParams): Promise<() => void> {
  const {
    api,
    direction,
    fromAddress,
    toAddress,
    amountShannons,
    domainId,
    fee,
    treasurySS58,
    onPhaseChange,
    onMessage,
    onError,
  } = params;

  const withFee = direction === "c2e" && !!fee && fee.fee > 0n && !!treasurySS58;

  const destination =
    direction === "c2e"
      ? ({ domainId } as const)
      : ("consensus" as const);

  const account =
    direction === "c2e"
      ? ({ accountId20: toAddress } as const)
      : ({ accountId32: toAddress } as const);

  let extrinsic: ReturnType<typeof transporterTransfer>;
  try {
    if (withFee && fee && treasurySS58) {
      const calls = [
        transporterTransfer(api, destination, account, fee.net),
        api.tx.balances.transferKeepAlive(treasurySS58, fee.treasury),
      ];
      if (fee.referral > 0n && fee.referrer) {
        calls.push(api.tx.balances.transferKeepAlive(fee.referrer, fee.referral));
      }
      extrinsic = api.tx.utility.batchAll(calls) as unknown as ReturnType<typeof transporterTransfer>;
    } else {
      extrinsic = transporterTransfer(api, destination, account, amountShannons);
    }
    verifyXdmCall(extrinsic.method as unknown as DecodedCall, {
      direction,
      toAddress,
      amountShannons,
      domainId,
      maxFeeBps: MAX_FEE_BPS,
      treasurySS58,
      expectedFee: withFee && fee
        ? { treasury: fee.treasury, referral: fee.referral, referrer: fee.referrer }
        : undefined,
    });
  } catch (err: unknown) {
    onError(errorMessage(err, "Failed to build XDM extrinsic"));
    return () => {};
  }

  const { web3FromAddress } = await import("@polkadot/extension-dapp");
  let injector: Awaited<ReturnType<typeof web3FromAddress>>;
  try {
    injector = await web3FromAddress(fromAddress);
  } catch (err: unknown) {
    onError(errorMessage(err, "Could not get signer from wallet extension"));
    return () => {};
  }

  onPhaseChange("signing");

  let unsub: () => void = () => {};

  const signOpts: SignerOptions = { signer: injector.signer as SignerOptions["signer"] };

  try {
    type SignAndSendFn = (
      address: string,
      opts: SignerOptions,
      callback: (result: TxResult) => void
    ) => Promise<() => void>;
    const unsubPromise = (extrinsic.signAndSend as unknown as SignAndSendFn)(
      fromAddress,
      signOpts,
      (result: TxResult) => {
      if (result.dispatchError) {
        let errorText = "Transaction failed";
        if (result.dispatchError.isModule) {
          try {
            const decoded = api.registry.findMetaError(
              result.dispatchError.asModule as unknown as Parameters<typeof api.registry.findMetaError>[0]
            );
            errorText = `${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}`;
          } catch {
            errorText = result.dispatchError.toString();
          }
        } else {
          errorText = result.dispatchError.toString();
        }
        onError(errorText);
        unsub();
        return;
      }

      // Re-attempt hash capture on every callback — isInBlock always has it.
      const rh = result.txHash;
      const hex = rh && typeof (rh as { toHex?: unknown }).toHex === "function"
        ? (rh as { toHex(): string }).toHex()
        : undefined;
      const txHash = hex && hex !== "0x" ? hex : undefined;

      const initiated = result.events?.find(
        ({ event }) => event.section === "transporter" && event.method === "OutgoingTransferInitiated"
      );
      if (initiated && onMessage) {
        const [chainId, messageId] = initiated.event.data.toJSON() as [unknown, [string, string]];
        onMessage({ source: direction === "c2e" ? "consensus" : "evm", dstChainId: chainId, messageId });
      }

      if (result.isReady) {
        onPhaseChange("ready", txHash);
      } else if (result.isBroadcast) {
        onPhaseChange("broadcast", txHash);
      } else if (result.isInBlock) {
        onPhaseChange("inBlock", txHash);
      } else if (result.isFinalized) {
        onPhaseChange("finalized");
        unsub();
      } else if (result.isError) {
        onError("Transaction error");
        unsub();
      }
    });

    unsub = await unsubPromise;
  } catch (err: unknown) {
    const msg = errorMessage(err, "Failed to sign or send transaction");
    if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("reject")) {
      onError("Transaction cancelled by user");
    } else {
      onError(msg);
    }
    return () => {};
  }

  return unsub;
}

// ─── EVM wallet → Consensus via Transporter precompile ───────────────────────
// Uses eth_sendTransaction (no eth_sign) — works with MetaMask, Rabby, etc.

export async function buildAndSendXdmEvm(params: XdmTransferParams): Promise<() => void> {
  const { api, fromAddress, toAddress, amountShannons, evmChainId = 870, onPhaseChange, onMessage, onError } = params;

  let calldata: string;
  let precompileAddress: string;
  try {
    const txData = createTransferToConsensusTxData(toAddress, amountShannons);
    if (txData.to !== TRANSPORTER_PRECOMPILE_ADDRESS) {
      throw new Error(`Unexpected precompile address: ${txData.to}`);
    }
    verifyPrecompileCalldata(txData.data, toAddress, amountShannons);
    calldata = txData.data;
    precompileAddress = txData.to;
  } catch (err: unknown) {
    onError(errorMessage(err, "Failed to encode transfer"));
    return () => {};
  }

  let eth: EthProvider;
  try {
    eth = await ensureChain(evmChainId);
  } catch (err: unknown) {
    onError(errorMessage(err, "Failed to switch to Auto EVM chain"));
    return () => {};
  }

  onPhaseChange("signing");

  let txHash: string;
  try {
    txHash = await eth.request<string>({
      method: "eth_sendTransaction",
      params: [{ from: fromAddress, to: precompileAddress, data: calldata, value: "0x0" }],
    });
  } catch (err: unknown) {
    const msg = errorMessage(err, "Failed to send transaction");
    const code = (err as { code?: number }).code;
    if (code === 4001 || ["cancel", "reject", "denied", "user rejected"].some((k) => msg.toLowerCase().includes(k))) {
      onError("Transaction cancelled by user");
    } else {
      onError(msg);
    }
    return () => {};
  }

  onPhaseChange("broadcast", txHash);

  let cancelled = false;

  (async () => {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (!cancelled && Date.now() < deadline) {
      try {
        const receipt = await eth.request<{ status: string } | null>({
          method: "eth_getTransactionReceipt",
          params: [txHash],
        });
        if (receipt !== null) {
          if (receipt.status === "0x1") {
            if (!cancelled) onPhaseChange("inBlock", txHash);
            // The precompile log has no message id; recover it from the pending-transfer map
            findPendingTransfer(api, {
              sender: { accountId20: fromAddress },
              receiver: { accountId32: toAddress },
              amount: amountShannons,
            })
              .then((ref) => { if (ref && !cancelled) onMessage?.(ref); })
              .catch(() => {});
            await new Promise((r) => setTimeout(r, 2000));
            if (!cancelled) onPhaseChange("finalized");
          } else {
            if (!cancelled) onError("Transaction reverted on-chain");
          }
          return;
        }
      } catch {
        // transient polling error — retry
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!cancelled) onError("Transaction not confirmed after 5 minutes");
  })();

  return () => { cancelled = true; };
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err || fallback;
  return fallback;
}
