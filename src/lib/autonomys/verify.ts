import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import { samePublicKey } from "./addresses";

// Independent pre-sign checks: re-read what was actually built and compare it
// against what the user confirmed. Any mismatch aborts before the wallet prompt.

// Minimal structural view of a decoded call (works with either @polkadot/types copy).
interface Codec {
  toString(): string;
  toJSON(): unknown;
}
export interface DecodedCall {
  section: string;
  method: string;
  args: readonly (Codec | readonly DecodedCall[])[];
}

export interface ExpectedTransfer {
  direction: "c2e" | "e2c";
  toAddress: string;
  /** Gross amount the user entered */
  amountShannons: bigint;
  domainId: number;
  /** Fee cap in basis points; the built fee must not exceed it */
  maxFeeBps: number;
  /** Required when a fee is charged */
  treasurySS58?: string;
}

export class TxVerificationError extends Error {
  constructor(message: string) {
    super(`Transaction check failed: ${message}`);
    this.name = "TxVerificationError";
  }
}

function fail(message: string): never {
  throw new TxVerificationError(message);
}

function toBigInt(c: Codec): bigint {
  return BigInt(c.toString());
}

function checkTransporterCall(call: DecodedCall, exp: ExpectedTransfer, amount: bigint): void {
  if (call.section !== "transporter" || call.method !== "transfer") {
    fail(`expected transporter.transfer, got ${call.section}.${call.method}`);
  }
  const [locArg, amountArg] = call.args as Codec[];
  const loc = locArg.toJSON() as {
    chainId?: { domain?: number; consensus?: unknown };
    accountId?: { accountId20?: string; accountId32?: string };
  };

  if (exp.direction === "c2e") {
    if (loc.chainId?.domain !== exp.domainId) fail("wrong destination domain");
    const got = loc.accountId?.accountId20?.toLowerCase();
    if (!got || got !== exp.toAddress.trim().toLowerCase()) fail("recipient mismatch");
  } else {
    if (!loc.chainId || !("consensus" in loc.chainId)) fail("destination is not Consensus");
    const got = loc.accountId?.accountId32;
    if (!got || !samePublicKey(got, exp.toAddress.trim())) fail("recipient mismatch");
  }

  if (toBigInt(amountArg) !== amount) fail("transfer amount mismatch");
}

/**
 * Verify a Substrate extrinsic's call before signing.
 * Accepts either a bare transporter.transfer or utility.batchAll([transfer, feeTransfer]).
 */
export function verifyXdmCall(call: DecodedCall, exp: ExpectedTransfer): void {
  if (exp.amountShannons <= 0n) fail("amount must be positive");

  if (call.section === "utility" && call.method === "batchAll") {
    const calls = call.args[0] as readonly DecodedCall[];
    if (calls.length !== 2) fail(`expected 2 calls in batch, got ${calls.length}`);
    const [transfer, feeCall] = calls;

    if (feeCall.section !== "balances" || feeCall.method !== "transferKeepAlive") {
      fail(`unexpected fee call ${feeCall.section}.${feeCall.method}`);
    }
    if (!exp.treasurySS58) fail("fee present but no treasury configured");
    const [destArg, valueArg] = feeCall.args as Codec[];
    const dest = (destArg.toJSON() as { id?: string }).id;
    if (!dest || !samePublicKey(dest, exp.treasurySS58)) fail("fee recipient is not the treasury");

    const fee = toBigInt(valueArg);
    if (fee * 10000n > exp.amountShannons * BigInt(exp.maxFeeBps)) fail("fee exceeds the allowed rate");

    checkTransporterCall(transfer, exp, exp.amountShannons - fee);
    return;
  }

  checkTransporterCall(call, exp, exp.amountShannons);
}

/**
 * Verify transporter precompile calldata: selector(4) ‖ bytes32 accountId ‖ uint256 amount.
 */
export function verifyPrecompileCalldata(
  calldata: string,
  toAddress: string,
  amountShannons: bigint
): void {
  const hex = calldata.toLowerCase().replace(/^0x/, "");
  if (hex.length !== 8 + 64 + 64) fail("unexpected calldata length");
  const account = `0x${hex.slice(8, 72)}`;
  const amount = BigInt(`0x${hex.slice(72, 136)}`);
  if (account !== u8aToHex(decodeAddress(toAddress.trim()))) fail("recipient mismatch");
  if (amount !== amountShannons) fail("transfer amount mismatch");
}
