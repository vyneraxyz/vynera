import { isValidSubstrateAddress, samePublicKey, toAutonomysAddress } from "@/lib/autonomys/addresses";
import { TREASURY_SS58 } from "@/lib/constants";
import { REFERRALS_ENABLED } from "@/lib/fees";

// Referrals: a link like https://vynera.xyz/?ref=<SS58> pays the referrer a share
// of the platform fee inside the same batchAll. First touch wins.

const STORAGE_KEY = "vynera-ref";

/** Store the ?ref= referrer from the current URL unless one is already saved. */
export function captureReferralFromUrl(): void {
  if (!REFERRALS_ENABLED || typeof window === "undefined") return;
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (!ref || !isValidSubstrateAddress(ref)) return;
  try {
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, toAutonomysAddress(ref.trim()));
    }
  } catch {
    // storage unavailable
  }
}

/** The saved referrer, or null if none / not usable for this sender. */
export function getReferrer(senderAddress: string | null): string | null {
  if (!REFERRALS_ENABLED) return null;
  let ref: string | null = null;
  try {
    ref = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!ref || !isValidSubstrateAddress(ref)) return null;
  if (senderAddress && samePublicKey(ref, senderAddress)) return null; // no self-referral
  if (samePublicKey(ref, TREASURY_SS58)) return null;
  return ref;
}

export function referralLink(address: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://vynera.xyz";
  return `${origin}/?ref=${toAutonomysAddress(address)}`;
}
