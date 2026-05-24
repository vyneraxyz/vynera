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

export function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
