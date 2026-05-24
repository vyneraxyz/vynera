import { SHANNONS_PER_AI3, RESERVE_SHANNONS, NETWORK_FEE_SHANNONS } from "@/lib/constants";

/** Parse a decimal AI3 string into Shannons (BigInt). Returns null on invalid input. */
export function parseAI3(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ".") return null;

  const match = trimmed.match(/^(\d+)(?:\.(\d*))?$/);
  if (!match) return null;

  const intPart = match[1] ?? "0";
  const rawFrac = match[2] ?? "";
  const fracPart = rawFrac.padEnd(18, "0").slice(0, 18);

  try {
    return BigInt(intPart) * SHANNONS_PER_AI3 + BigInt(fracPart);
  } catch {
    return null;
  }
}

/** Format Shannons BigInt to a human-readable AI3 string with given decimal places. */
export function formatAI3(shannons: bigint, decimals = 4): string {
  const neg = shannons < 0n;
  const abs = neg ? -shannons : shannons;
  const intPart = abs / SHANNONS_PER_AI3;
  const fracPart = abs % SHANNONS_PER_AI3;
  const fracStr = fracPart.toString().padStart(18, "0").slice(0, decimals);
  return (neg ? "-" : "") + intPart.toString() + "." + fracStr;
}

/** Format Shannons BigInt to a locale string with unit. */
export function formatShannons(shannons: bigint): string {
  // Cap display at 1 trillion AI3 worth — beyond that use compact notation
  if (shannons > 10n ** 30n) {
    const digits = shannons.toString();
    const exp = digits.length - 1;
    const mantissa = (Number(shannons) / 10 ** exp).toFixed(2);
    return `~${mantissa}×10^${exp} Shannons`;
  }
  return shannons.toLocaleString("en-US") + " Shannons";
}

/** Compute the max sendable amount given balance in Shannons. */
export function computeMax(balanceShannons: bigint): bigint {
  const available = balanceShannons - RESERVE_SHANNONS - NETWORK_FEE_SHANNONS;
  return available > 0n ? available : 0n;
}

/** Check if an amount (Shannons) exceeds available balance. */
export function isInsufficient(
  amountShannons: bigint | null,
  balanceShannons: bigint
): boolean {
  if (amountShannons === null || amountShannons <= 0n) return false;
  return amountShannons + NETWORK_FEE_SHANNONS > balanceShannons;
}
