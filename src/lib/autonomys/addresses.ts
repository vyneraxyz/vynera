import { u8aToHex } from "@polkadot/util";
import { decodeAddress, encodeAddress, isEthereumAddress } from "@polkadot/util-crypto";
import type { Chain } from "@/types";

/** Re-encode any SS58 address to the Autonomys-specific prefix (6094). */
export function toAutonomysAddress(addr: string): string {
  if (!addr || addr.startsWith("0x")) return addr;
  try {
    return encodeAddress(decodeAddress(addr), 6094);
  } catch {
    return addr;
  }
}

export function isValidEthereumAddress(addr: string): boolean {
  return isEthereumAddress(addr.trim());
}

export function isValidSubstrateAddress(addr: string): boolean {
  const trimmed = addr.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("0x")) return false; // EVM addresses are not Substrate
  try {
    const decoded = decodeAddress(trimmed);
    return decoded.length === 32; // Substrate accounts are always 32 bytes
  } catch {
    return false;
  }
}

export type RecipientValidation =
  | { state: "idle" }
  | { state: "valid"; message: string }
  | { state: "invalid"; message: string };

export function validateRecipient(
  value: string,
  targetChain: Chain
): RecipientValidation {
  const trimmed = value.trim();
  if (!trimmed) return { state: "idle" };

  const expectsEvm = targetChain === "evm";
  const isEvm = isValidEthereumAddress(trimmed);
  const isSub = isValidSubstrateAddress(trimmed);

  if (expectsEvm && isEvm) {
    return { state: "valid", message: "Valid EVM recipient" };
  }
  if (!expectsEvm && isSub) {
    return { state: "valid", message: "Valid Substrate recipient" };
  }
  if (expectsEvm && isSub) {
    return {
      state: "invalid",
      message: "This is a Substrate address — Auto EVM needs 0x… format",
    };
  }
  if (!expectsEvm && isEvm) {
    return {
      state: "invalid",
      message: "This is an EVM address — Consensus needs SS58 format",
    };
  }
  return {
    state: "invalid",
    message: expectsEvm ? "Not a valid EVM address" : "Not a valid SS58 address",
  };
}

/** Compare two SS58 / hex account ids by public key (prefix-independent). */
export function samePublicKey(a: string, b: string): boolean {
  try {
    return u8aToHex(decodeAddress(a.trim())) === u8aToHex(decodeAddress(b.trim()));
  } catch {
    return false;
  }
}

function sameAccount(a: string, b: string, targetChain: Chain): boolean {
  return targetChain === "evm"
    ? a.trim().toLowerCase() === b.trim().toLowerCase()
    : samePublicKey(a, b);
}

export interface RecipientNotice {
  level: "warning" | "info";
  message: string;
  /** User must explicitly acknowledge before confirming */
  requiresAck: boolean;
}

/**
 * Context about who the recipient is, shown once the address itself is valid.
 * Catches the costly mistakes format validation can't: sending to the
 * platform treasury, or to an address that isn't the user's own.
 */
export function recipientNotice(
  recipient: string,
  targetChain: Chain,
  ctx: { treasurySS58?: string; ownAddress?: string | null }
): RecipientNotice | null {
  if (validateRecipient(recipient, targetChain).state !== "valid") return null;

  if (targetChain === "consensus" && ctx.treasurySS58 && samePublicKey(recipient, ctx.treasurySS58)) {
    return {
      level: "warning",
      message: "This is the platform treasury address. Only continue if you control it.",
      requiresAck: true,
    };
  }
  if (ctx.ownAddress && sameAccount(recipient, ctx.ownAddress, targetChain)) {
    return { level: "info", message: "Your connected wallet", requiresAck: false };
  }
  return {
    level: "info",
    message: "Not one of your connected wallets — double-check the address",
    requiresAck: false,
  };
}

export function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
